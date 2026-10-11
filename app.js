import express from 'express';
import cors from 'cors';
import { pool } from './db.js';
import { bool, COLUMNS, insertMany, rowToPandal, toRecord } from './normalize.js';

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()) : true,
  }),
);
// Images are stored as data URLs, so allow large bodies.
app.use(express.json({ limit: '25mb' }));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const insertSql = `INSERT INTO pandals (${COLUMNS.map(([c]) => c).join(', ')})
  VALUES (${COLUMNS.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
const editable = COLUMNS.filter(([c]) => c !== 'id');
const updateSql = `UPDATE pandals SET ${editable.map(([c], i) => `${c} = $${i + 2}`).join(', ')},
  updated_at = now() WHERE id = $1 RETURNING *`;

const parseRecord = (body) => {
  const { record, error } = toRecord(body);
  if (error) throw new HttpError(400, error);
  return record;
};

app.get('/api/health', wrap(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

app.get('/api/pandals', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM pandals ORDER BY lower(club_name)');
  res.json(rows.map(rowToPandal));
}));

app.post('/api/pandals', wrap(async (req, res) => {
  const rec = parseRecord(req.body);
  const { rows } = await pool.query(insertSql, COLUMNS.map(([, k]) => rec[k]));
  res.status(201).json(rowToPandal(rows[0]));
}));

// Bulk add (used for demo data). Duplicates are skipped.
app.post('/api/pandals/bulk', wrap(async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body?.pandals;
  if (!Array.isArray(list)) throw new HttpError(400, 'Expected an array of pandals.');
  const records = [];
  const rejected = [];
  const seen = new Set();
  list.forEach((raw, i) => {
    const { record, error } = toRecord(raw);
    if (error) return rejected.push(`#${i + 1}: ${error}`);
    const key = `${record.clubName.toLowerCase()}|${record.locality.toLowerCase()}`;
    if (seen.has(key)) return rejected.push(`#${i + 1}: duplicate in request`);
    seen.add(key);
    records.push(record);
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await insertMany(client, records);
    await client.query('COMMIT');
    res.json({ ...result, rejected });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

// Full edit.
app.put('/api/pandals/:id', wrap(async (req, res) => {
  const rec = parseRecord(req.body);
  const { rows } = await pool.query(updateSql, [req.params.id, ...editable.map(([, k]) => rec[k])]);
  if (!rows.length) throw new HttpError(404, 'Pandal not found.');
  res.json(rowToPandal(rows[0]));
}));

// Quick toggles: { visited, visitDate? } and/or { favourite }.
app.patch('/api/pandals/:id', wrap(async (req, res) => {
  const b = req.body ?? {};
  const params = [req.params.id];
  const sets = [];
  if ('favourite' in b) {
    params.push(bool(b.favourite));
    sets.push(`favourite = $${params.length}`);
  }
  if ('visited' in b) {
    const visited = bool(b.visited);
    params.push(visited);
    sets.push(`visited = $${params.length}`);
    if (!visited) {
      sets.push('visit_date = NULL');
    } else {
      params.push(/^\d{4}-\d{2}-\d{2}$/.test(b.visitDate ?? '') ? b.visitDate : null);
      sets.push(
        `visit_date = COALESCE($${params.length}::date, visit_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)`,
      );
    }
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to update.');
  const { rows } = await pool.query(
    `UPDATE pandals SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
    params,
  );
  if (!rows.length) throw new HttpError(404, 'Pandal not found.');
  res.json(rowToPandal(rows[0]));
}));

app.delete('/api/pandals/:id', wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM pandals WHERE id = $1', [req.params.id]);
  if (!rowCount) throw new HttpError(404, 'Pandal not found.');
  res.status(204).end();
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Images are too large. Use smaller photos.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
  if (err.code === '23505') return res.status(409).json({ error: 'A pandal with this name already exists in that locality.' });
  if (err.code === '23514') return res.status(400).json({ error: 'Invalid value (check the region).' });
  if (err.code === '42P01') return res.status(500).json({ error: 'Table missing. Run "npm run db:init" in the server folder.' });
  if (['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(err.code) || /timeout|terminat/i.test(err.message)) {
    console.error('Database connection problem:', err.message);
    return res.status(503).json({ error: 'Database is unreachable right now. Try again in a moment.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

export default app;