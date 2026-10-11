import { randomUUID } from 'node:crypto';

export const REGIONS = ['North Kolkata', 'South Kolkata', 'East Kolkata', 'West Kolkata'];

const keyOf = (s) => s.toLowerCase().replace(/[\s_-]/g, '');
const pick = (obj, keys) => {
  for (const k of keys) {
    const hit = Object.keys(obj).find((x) => keyOf(x) === k);
    if (hit !== undefined && obj[hit] !== null && obj[hit] !== '') return obj[hit];
  }
  return undefined;
};
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const num = (v, min, max) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
export const bool = (v) => v === true || /^(true|yes|1|y)$/i.test(String(v ?? ''));
const img = (v) => (typeof v === 'string' && /^(data:image\/|https?:\/\/)/i.test(v) ? v : null);

export function normalizeRegion(v) {
  const s = str(v).toLowerCase();
  if (!s) return null;
  return REGIONS.find((r) => s.startsWith(r.split(' ')[0].toLowerCase())) ?? null;
}

/** Accepts our own field names plus common aliases. Returns { record } or { error }. */
export function toRecord(raw, { requireName = true } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'not an object' };
  const clubName = str(pick(raw, ['clubname', 'name', 'club', 'pujaname', 'title', 'pandalname', 'pandal']));
  if (requireName && !clubName) return { error: 'missing club name' };
  const region = normalizeRegion(pick(raw, ['region', 'zone', 'arearegion', 'part', 'side']));
  if (!region) return { error: `missing or unrecognised region for "${clubName}"` };

  const lat = num(pick(raw, ['latitude', 'lat']), -90, 90);
  const lng = num(pick(raw, ['longitude', 'lng', 'lon', 'long']), -180, 180);
  const both = lat !== null && lng !== null;
  const visited = bool(pick(raw, ['visited']));
  const vd = str(pick(raw, ['visitdate']));
  const locality = str(pick(raw, ['locality', 'area', 'neighbourhood', 'neighborhood']));

  return {
    record: {
      id: str(pick(raw, ['id'])) || randomUUID(),
      clubName,
      address: str(pick(raw, ['address', 'fulladdress', 'location'])) || (locality ? `${locality}, Kolkata` : ''),
      locality,
      region,
      nearestMetro: str(pick(raw, ['nearestmetro', 'metro', 'metrostation', 'station'])),
      metroDistance: str(pick(raw, ['metrodistance', 'distance', 'distancefrommetro'])),
      latitude: both ? lat : null,
      longitude: both ? lng : null,
      googleMapsUrl: str(pick(raw, ['googlemapsurl', 'mapurl', 'maplink', 'mapslink'])),
      description: str(pick(raw, ['description', 'about', 'details', 'theme'])),
      pandalImage: img(pick(raw, ['pandalimage', 'image', 'photo', 'imageurl'])),
      idolImage: img(pick(raw, ['idolimage', 'idol', 'durgaimage'])),
      visited,
      visitDate: visited && /^\d{4}-\d{2}-\d{2}/.test(vd) ? vd.slice(0, 10) : null,
      favourite: bool(pick(raw, ['favourite', 'favorite', 'fav'])),
      isSample: bool(pick(raw, ['issample', 'sample', 'demo'])),
    },
  };
}

export const COLUMNS = [
  ['id', 'id'], ['club_name', 'clubName'], ['address', 'address'], ['locality', 'locality'],
  ['region', 'region'], ['nearest_metro', 'nearestMetro'], ['metro_distance', 'metroDistance'],
  ['latitude', 'latitude'], ['longitude', 'longitude'], ['google_maps_url', 'googleMapsUrl'],
  ['description', 'description'], ['pandal_image', 'pandalImage'], ['idol_image', 'idolImage'],
  ['visited', 'visited'], ['visit_date', 'visitDate'], ['favourite', 'favourite'], ['is_sample', 'isSample'],
];

const pad = (n) => String(n).padStart(2, '0');

export const rowToPandal = (r) => ({
  id: r.id, clubName: r.club_name, address: r.address, locality: r.locality, region: r.region,
  nearestMetro: r.nearest_metro, metroDistance: r.metro_distance,
  latitude: r.latitude, longitude: r.longitude, googleMapsUrl: r.google_maps_url,
  description: r.description, pandalImage: r.pandal_image, idolImage: r.idol_image,
  visited: r.visited,
  visitDate: r.visit_date instanceof Date
    ? `${r.visit_date.getFullYear()}-${pad(r.visit_date.getMonth() + 1)}-${pad(r.visit_date.getDate())}`
    : r.visit_date,
  favourite: r.favourite, isSample: r.is_sample,
  createdAt: new Date(r.created_at).toISOString(), updatedAt: new Date(r.updated_at).toISOString(),
});

/** Insert many records; duplicates (same name + locality) are skipped, never overwritten. */
export async function insertMany(client, records) {
  const cols = COLUMNS.map(([c]) => c).join(', ');
  const params = COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
  const sql = `INSERT INTO pandals (${cols}) VALUES (${params}) ON CONFLICT DO NOTHING`;
  let inserted = 0;
  for (const rec of records) {
    const res = await client.query(sql, COLUMNS.map(([, k]) => rec[k]));
    inserted += res.rowCount;
  }
  return { inserted, skippedDuplicates: records.length - inserted };
}