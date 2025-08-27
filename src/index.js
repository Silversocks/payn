const express=require("express");
const db=require('./routes/db');

port=8080;

const app=express();

app.post("/initialiseapp",(req,res)=>{
    db.query("insert into books values")
    res.json()
})

app.post("")

app.listen(prompt,console.log("started server"));