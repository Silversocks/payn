const express = require("express");
const bcrypt = require('bcryptjs');
const db = require('./routes/db');
const app = express();
const port = 8080;

app.use(express.json());

app.get("/initialiseapp/:uid/:passhash", async (req, res) => {
    const { uid, passhash } = req.params;

    try {
        const [user] = await db.query("SELECT * FROM users WHERE Uid = ? AND Passhash = ?;", [uid, passhash]);

        if (!user) {
            return res.status(401).json({ error: "Authentication failed" });
        }

        const [incoming] = await db.query("SELECT * FROM transactions WHERE Touid = ? AND Approved = 'NA';", [uid]);
        const [outgoing] = await db.query("SELECT * FROM transactions WHERE Fromuid = ? AND Approved = 'NA';", [uid]);

        res.json({ incomingt: incoming, outgoingt: outgoing });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

//the routes 'approve' and 'pay' are for direct payments. need not include if not necessary
app.post("/approve/:tid", async (req, res) => {
    const { tid } = req.params;

    try {
        await db.query("UPDATE transactions SET Approved = 0 WHERE Tid = ?;", [tid]);

        const [[transaction]] = await db.query("SELECT Fromuid, Touid, Amount FROM transactions WHERE Tid = ?;", [tid]);
        const { From, To, Amount } = transaction;

        await db.query("UPDATE user SET Money = Money - ? WHERE Uid = ?;", [Amount, From]);
        await db.query("UPDATE user SET Money = Money + ? WHERE Uid = ?;", [Amount, To]);

        await db.query("UPDATE Ledger SET Moneypool = Moneypool + ? WHERE LedgerID = (SELECT LedgerID FROM transactions WHERE Tid = ?);", [Amount, tid]);

        res.send("Transaction approved and balances updated.");
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Approval failed" });
    }
});

app.post("/pay", async (req, res) => {
    const { From, To, Amount, LedgerID, Description } = req.body;

    try {
        await db.query(`
            INSERT INTO transactions (\`From\`, \`To\`, Amount, Approved, LedgerID, Description) 
            VALUES (?, ?, ?, 'NA', ?, ?);`, 
            [From, To, Amount, LedgerID, Description]);

        res.status(201).json({ message: "Transaction created and pending approval." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Payment failed" });
    }
});

//needs uid, password sent ove http in json format
app.post("/signup", async (req, res) => {
  const { Uid, Passhash } = req.body; 

  if (!Uid || !Passhash) {
    return res.status(400).json({ error: "Uid and password required" });
  }
  try {
    const hashedPassword = await bcrypt.hash(Passhash, 10);

    db.query("INSERT INTO user (Uid, Passhash) VALUES (?, ?);", [Uid, hashedPassword]);

    res.status(201).json({ message: "User registered." });
    console.log(`user registered: ${Uid}`)
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

//needs uid, password sent over http, in json format
app.post("/login", async (req, res) => {
  const { Uid, Passhash } = req.body;

  try {
    const [[user]] = await db.query("SELECT * FROM users WHERE Uid = ?;", [Uid]);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(Passhash, user.Passhash);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.status(200).json({ message: "Login successful" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});



/* structure for payexternal{
  "FromList": ["user1", "user2", "user3"],
  "To": "recipient_user",
  "Amount": [100,200],(amount paid by individual)
  "LedgerID": "L12345",
  "Description1": "Monthly contribution",
  "Amountpaid": int(paidamountbyfinaluser)
}*/

// 1 for unresolved, 0 for resolved

app.post("/payexternal", async (req, res) => {
    const conn=await db.getConnection()
    const { FromList, To, Amount, LedgerID, Description, Amountpaid } = req.body;

    if (!Array.isArray(FromList) || FromList.length === 0) {
        return res.status(400).json({ error: "FromList must be a non-empty array" });
    } 

    try {
        await conn.beginTransaction();
        //after paying to external
        for (const from of FromList) {
            await conn.query(`
                INSERT INTO transactions (Fromuid, Touid, Amount, Resolved, LedgerID, Description)
                VALUES (?, ?, ?, ?, ?, ?);`,
                [from, LedgerID, Amount[FromList.indexOf(from)], 1, LedgerID, Description]
            );
        }
        await conn.query(`insert into transactions (Fromuid, Touid,Amount,LedgerID,Description)
          values (?,?,?,?,?);`,
          [To,999, Amountpaid,LedgerID, Description])
          //999 refers to an external

        await conn.query(`insert into transactions (Fromuid, Touid, Amount, Resolved, LedgerID, Description)
          values (?, ?, ?, ?, ?, ?);`,
          [LedgerID, To, Amountpaid, 1, LedgerID, Description]
        );

        await conn.commit();
        res.status(201).json({ message: "Transactions created and pending approval." });

    } catch (err) {
        await conn.rollback();
        console.error(err);
        res.status(500).json({ error: "Payment failed" });
    } finally{
      (await conn).release()
    }
});

//to the popup selecting friends, add ledger selection as well

//req.amount has money in ledger
app.post("/resolve", async (req, res) => {
  console.log("Received resolve request\n");
  const conn = db; // assuming db is a promise-based pool (like mysql2/promise)

  try {
    // Fetch transactions and ledger
    const [list] = await conn.query(
      "SELECT Tid, Amount, Touid FROM Transactions WHERE Fromuid=? AND Resolved=1",
      [req.body.LedgerID]
    );
    const [rows] = await conn.query(
      "SELECT Moneypool FROM Ledger WHERE LedgerID=?",
      [req.body.LedgerID]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Ledger not found" });
    }

    let remaining = rows[0].Moneypool;

    // Nothing to resolve
    if (remaining <= 0) {
      return res.json({ message: "No balance to resolve" });
    }

    const updates = [];

    for (const tx of list) {
      if (remaining <= 0) break;

      if (tx.Amount > remaining) {
        // partially resolve
        updates.push({
          Tid: tx.Tid,
          Amount: tx.Amount - remaining,
          Resolved: 1,
        });
        remaining = 0;
      } else {
        // fully resolve this transaction
        updates.push({
          Tid: tx.Tid,
          Amount: 0,
          Resolved: 0,
        });
        remaining -= tx.Amount;
      }
    }

    if (updates.length === 0) {
      return res.json({ message: "No transactions updated" });
    }

    // Perform all updates in one go (absolute GOATed optimisation by the one and only)
    const updatePromises = updates.map(({ Amount, Tid, Resolved }) =>
      conn.query("UPDATE Transactions SET Amount=?, Resolved=? WHERE Tid=?", [
        Amount,
        Resolved,
        Tid,
      ])
    );

    await Promise.all(updatePromises);

    console.log("Finished resolving transactions");

    res.json({ success: true, updates });
  } catch (error) {
    console.error("Error resolving:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
