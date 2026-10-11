/**
 * Usage:  npm run import -- path/to/pandals.json [--dry-run]
 * The file may be an array, or an object like { "pandals": [...] } (any single array property works).
 * Safe to re-run: records with the same club name + locality are skipped.
 */
import { readFileSync } from 'node:fs';
import { pool } from './db.js';
import { insertMany, toRecord } from './normalize.js';

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run import -- path/to/pandals.json [--dry-run]');
  process.exit(1);
}
const dry = flags.includes('--dry-run');

let data;
try {
  // Strip the UTF-8 BOM that Windows editors and PowerShell often add.
  data = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
} catch (e) {
  console.error(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}
if (!Array.isArray(data)) data = Object.values(data ?? {}).find(Array.isArray);
if (!Array.isArray(data)) {
  console.error('Could not find an array of pandals in that file.');
  process.exit(1);
}

const records = [];
const rejected = [];
const seen = new Set();
data.forEach((raw, i) => {
  const { record, error } = toRecord(raw);
  if (error) return rejected.push(`#${i + 1}: ${error}`);
  const key = `${record.clubName.toLowerCase()}|${record.locality.toLowerCase()}`;
  if (seen.has(key)) return rejected.push(`#${i + 1}: duplicate in file ("${record.clubName}")`);
  seen.add(key);
  records.push(record);
});

console.log(`Read ${data.length} entries: ${records.length} valid, ${rejected.length} rejected.`);
rejected.slice(0, 25).forEach((m) => console.log('  rejected', m));
if (rejected.length > 25) console.log(`  ...and ${rejected.length - 25} more`);

if (dry) {
  console.log('Dry run: nothing written.');
} else {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { inserted, skippedDuplicates } = await insertMany(client, records);
    await client.query('COMMIT');
    console.log(`Imported ${inserted}. Already in database (skipped): ${skippedDuplicates}.`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Import failed, nothing was written:', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
  }
}
await pool.end();