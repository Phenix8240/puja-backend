import app from './app.js';
import { pool } from './db.js';

const PORT = Number(process.env.PORT) || 3001;

try {
  await pool.query('SELECT 1');
  console.log('Connected to the database.');
} catch (err) {
  console.error('Could not connect to the database:', err.message);
  process.exit(1);
}

app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));