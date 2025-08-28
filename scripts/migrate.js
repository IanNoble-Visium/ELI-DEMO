const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const sql = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n\n');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(sql);
    console.log('Migrations applied');
  } finally {
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });

