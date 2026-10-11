CREATE TABLE IF NOT EXISTS pandals (
  id               TEXT PRIMARY KEY,
  club_name        TEXT NOT NULL,
  address          TEXT NOT NULL DEFAULT '',
  locality         TEXT NOT NULL DEFAULT '',
  region           TEXT NOT NULL CHECK (region IN ('North Kolkata','South Kolkata','East Kolkata','West Kolkata')),
  nearest_metro    TEXT NOT NULL DEFAULT '',
  metro_distance   TEXT NOT NULL DEFAULT '',
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  google_maps_url  TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  pandal_image     TEXT,
  idol_image       TEXT,
  visited          BOOLEAN NOT NULL DEFAULT FALSE,
  visit_date       DATE,
  favourite        BOOLEAN NOT NULL DEFAULT FALSE,
  is_sample        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Same club name in the same locality counts as a duplicate (this is what makes re-imports safe).
CREATE UNIQUE INDEX IF NOT EXISTS pandals_name_locality_uq
  ON pandals (lower(club_name), lower(locality));
CREATE INDEX IF NOT EXISTS pandals_region_idx ON pandals (region);
CREATE INDEX IF NOT EXISTS pandals_metro_idx ON pandals (nearest_metro);