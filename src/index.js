const express = require("express");
const bcrypt = require('bcryptjs');
const db = require('./routes/db'); // assumes this exports a connection or query function
const app = express();
const port = 8080;

app.use(express.json());

// Endpoint: Initialize app for a user
app.get("/initialiseapp/:uid/:passhash", async (req, res) => {
    const { uid, passhash } = req.params;

    try {
        // Authenticate user
        const [user] = await db.query("SELECT * FROM users WHERE Uid = ? AND Passhash = ?", [uid, passhash]);

        if (!user) {
            return res.status(401).json({ error: "Authentication failed" });
        }

        const [incoming] = await db.query("SELECT * FROM transactions WHERE `To` = ? AND Approved = 'NA'", [uid]);
        const [outgoing] = await db.query("SELECT * FROM transactions WHERE `From` = ? AND Approved = 'NA'", [uid]);

        res.json({ incomingt: incoming, outgoingt: outgoing });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

// Endpoint: Approve a transaction
app.post("/approve/:tid", async (req, res) => {
    const { tid } = req.params;

    try {
        // Approve transaction
        await db.query("UPDATE transactions SET Approved = 'A' WHERE Tid = ?", [tid]);

        // Get transaction details
        const [[transaction]] = await db.query("SELECT `From`, `To`, Amount FROM transactions WHERE Tid = ?", [tid]);
        const { From, To, Amount } = transaction;

        // Deduct and add money
        await db.query("UPDATE users SET Money = Money - ? WHERE Uid = ?", [Amount, From]);
        await db.query("UPDATE users SET Money = Money + ? WHERE Uid = ?", [Amount, To]);

        // You might need logic to update Moneypool in the correct ledger
        await db.query("UPDATE Ledgers SET Moneypool = Moneypool + ? WHERE LedgerID = (SELECT LedgerID FROM transactions WHERE Tid = ?)", [Amount, tid]);

        res.send("Transaction approved and balances updated.");
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Approval failed" });
    }
});

// Endpoint: Make a payment (create a transaction)
app.post("/pay", async (req, res) => {
    const { From, To, Amount, LedgerID, Description } = req.body;

    try {
        await db.query(`
            INSERT INTO transactions (\`From\`, \`To\`, Amount, Approved, LedgerID, Description) 
            VALUES (?, ?, ?, 'NA', ?, ?)`, 
            [From, To, Amount, LedgerID, Description]);

        res.status(201).json({ message: "Transaction created and pending approval." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Payment failed" });
    }
});

// Endpoint: Sign up a new user
router.post("/signup", async (req, res) => {
  const { Uid, Passhash } = req.body; // ⬅️ Use body, not params

  if (!Uid || !Passhash) {
    return res.status(400).json({ error: "Uid and password required" });
  }

  try {
    // Hash the password securely
    const hashedPassword = await bcrypt.hash(Passhash, 10);

    // Save user to the database
    await db.query("INSERT INTO users (Uid, Passhash) VALUES (?, ?)", [Uid, hashedPassword]);

    res.status(201).json({ message: "User registered." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// Endpoint: Log in a user
router.post("/login", async (req, res) => {
  const { Uid, Passhash } = req.body;

  try {
    // Step 1: Find user by Uid
    const [[user]] = await db.query("SELECT * FROM users WHERE Uid = ?", [Uid]);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Step 2: Compare hashed password
    const isMatch = await bcrypt.compare(Passhash, user.Passhash); // Passhash = plain password sent by client

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Optional: Issue a JWT here for frontend login sessions
    // const token = jwt.sign({ uid: user.Uid }, 'your_secret_key');

    res.status(200).json({ message: "Login successful" }); // Add token if using JWT
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Start the server
app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
