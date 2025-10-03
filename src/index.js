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

        const [incoming] = await db.query("SELECT * FROM transactions WHERE `To` = ? AND Approved = 'NA';", [uid]);
        const [outgoing] = await db.query("SELECT * FROM transactions WHERE `From` = ? AND Approved = 'NA';", [uid]);

        res.json({ incomingt: incoming, outgoingt: outgoing });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

app.post("/approve/:tid", async (req, res) => {
    const { tid } = req.params;

    try {
        await db.query("UPDATE transactions SET Approved = 'A' WHERE Tid = ?;", [tid]);

        const [[transaction]] = await db.query("SELECT `From`, `To`, Amount FROM transactions WHERE Tid = ?;", [tid]);
        const { From, To, Amount } = transaction;

        await db.query("UPDATE users SET Money = Money - ? WHERE Uid = ?;", [Amount, From]);
        await db.query("UPDATE users SET Money = Money + ? WHERE Uid = ?;", [Amount, To]);

        await db.query("UPDATE Ledgers SET Moneypool = Moneypool + ? WHERE LedgerID = (SELECT LedgerID FROM transactions WHERE Tid = ?);", [Amount, tid]);

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

app.post("/signup", async (req, res) => {
  const { Uid, Passhash } = req.body; 

  if (!Uid || !Passhash) {
    return res.status(400).json({ error: "Uid and password required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(Passhash, 10);

    await db.query("INSERT INTO users (Uid, Passhash) VALUES (?, ?);", [Uid, hashedPassword]);

    res.status(201).json({ message: "User registered." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

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
  "Amount": 100,
  "LedgerID": "L12345",
  "Description1": "Monthly contribution",
  "Amountpaid": int(paidamountbyfinaluser)
}*/

// 1for unresolved, 0 for resolved

app.post("/payexternal", async (req, res) => {
    const { FromList, To, Amount, LedgerID, Description } = req.body;

    if (!Array.isArray(FromList) || FromList.length === 0) {
        return res.status(400).json({ error: "FromList must be a non-empty array" });
    } 

    try {
        await db.beginTransaction();
        //after paying to external
        for (const from of FromList) {
            await db.query(`
                INSERT INTO transactions (\`From\`, \`To\`, Amount, Resolved, LedgerID, Description)
                VALUES (?, ?, ?, ?, ?, ?);`,
                [from, LedgerID, Amount, 1, LedgerID, Description]
            );
        }
        await db.query(`insert into transactions (\`From\`, \`To\`,Amount,LedgerID,Description)
          values (?,?,?,?,?);`,
          [from,"external", Amountpaid,LedgerID, Description])

        await db.query(`insert into transactions (\`From\`, \`To\`, Amount, Resolved, LedgerID, Description)
          values (?, ?, ?, ?, ?, ?);`,
          [LedgerID, from, Amountpaid, 1, LedgerID, Description]
        );

        await db.commit();
        res.status(201).json({ message: "Transactions created and pending approval." });

    } catch (err) {
        await db.rollback();
        console.error(err);
        res.status(500).json({ error: "Payment failed" });
    } finally {
        conn.release();
    }
});

//to the popup selecting friends, add ledger selection as well

//req.amount has money in ledger
app.post("/resolve",async (req,res)=>{
  const [list]=await db.query("select Tid,Amount,To from Transactions where From=? and Resolved=1",[req.body.LedgerID]);
  const [Amount]=await db.query("select Moneypool from Ledger where LedgerID=?",[req.body.LedgerID]);
  const todo=[]
  let to=0;
  let i=0;
  let j=0;
  let q=[]
  while(i<list.length){
    element=list[i]
    if(element.Amount>=Amount) break
    if(element.Amount<Amount){
      todo[to]={
        Amount:element.Amount-Amount,
        Tid:element.Tid
      }
    }
    i++;
  };
  todo.forEach(async (element)=>{
    if(element.Amount>0){
      await db.query("update Transactions set Amount=? where Tid=?",[element.Amount,element.Tid]);
    }
    else if(element.Amount=0){
      await db.query("update Transactions set Amount=?,Resolved=0 where Tid=?",[element.Amount,element.Tid]);
    }
  }
  )
});

app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});
