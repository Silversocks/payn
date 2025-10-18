// db.js
const mysql = require('mysql2/promise');

// Use a connection pool (recommended for server apps)
const pool = mysql.createPool({
  host: 'localhost',      // change to your DB host
  user: 'root',           // change to your DB user
  password: 'root', // change to your DB password
  database: 'payn', // change to your DB name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Export the pool so you can use `pool.query(...)` anywhere
module.exports = pool;
