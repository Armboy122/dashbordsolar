CREATE TABLE IF NOT EXISTS solar_inspections (
 id uuid PRIMARY KEY,
 site_id uuid NOT NULL REFERENCES sites(id),
 origin_month text NOT NULL CHECK (origin_month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 category text NOT NULL CHECK (category IN ('production','data','other')),
 title text NOT NULL,
 evidence jsonb NOT NULL,
 status text NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','notified','inspected')),
 version integer NOT NULL DEFAULT 1,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS solar_inspections_one_open ON solar_inspections(site_id,category) WHERE status <> 'inspected';
CREATE TABLE IF NOT EXISTS solar_inspection_events (
 id uuid PRIMARY KEY,
 inspection_id uuid NOT NULL REFERENCES solar_inspections(id),
 command_hash text NOT NULL,
 from_status text,
 to_status text NOT NULL,
 actor text NOT NULL,
 note text NOT NULL,
 repair_id uuid REFERENCES solar_maintenance_records(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS solar_inspection_events_task ON solar_inspection_events(inspection_id,created_at);
