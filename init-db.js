import { readFileSync } from 'node:fs';
import { pool } from './db.js';

try {
  await pool.query(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  console.log('Database ready: table "pandals" exists.');
} catch (err) {
  console.error('Database setup failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}