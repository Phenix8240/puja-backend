import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

// Look in server/.env first, then the project root .env. (On Vercel these files don't exist; env vars are used.)
dotenv.config({ path: fileURLToPath(new URL('./.env', import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const raw = process.env.DB_URL?.trim();
if (!raw) {
  console.error('DB_URL is missing. Set it in server/.env or in your host environment variables.');
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error('DB_URL is not a valid connection string.');
  process.exit(1);
}
// node-postgres does not support channel_binding, and sslmode would override the ssl option below.
url.searchParams.delete('channel_binding');
url.searchParams.delete('sslmode');

// Return DATE columns as plain 'YYYY-MM-DD' strings (no time zone shifts).
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
  max: process.env.VERCEL ? 1 : 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000, // Neon may need a few seconds to wake up
  keepAlive: true,
});

// Neon closes idle connections; without this handler that would crash the process.
pool.on('error', (err) => console.error('Idle database client error:', err.message));