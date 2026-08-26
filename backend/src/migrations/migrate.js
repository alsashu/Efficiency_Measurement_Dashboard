require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function migrate() {
  const client = await pool.connect();
  try {
    const migrations = ['001_initial.sql', '002_plan_module.sql', '003_plan_opportunity_categories.sql'];
    console.log('Running migrations...');
    for (const file of migrations) {
      const sqlPath = path.join(__dirname, file);
      if (!fs.existsSync(sqlPath)) { console.warn(`Migration file not found: ${file}, skipping`); continue; }
      console.log(`  Running: ${file}`);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      await client.query(sql);
      console.log(`  Done: ${file}`);
    }
    console.log('All migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
