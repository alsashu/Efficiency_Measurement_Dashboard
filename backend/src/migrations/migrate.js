require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function migrate() {
  const client = await pool.connect();
  try {
    const sqlPath = path.join(__dirname, '001_initial.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running migrations...');
    await client.query(sql);
    console.log('Migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
