-- SOMA sync relay. Nothing here is readable: vault and record ids are opaque,
-- blobs are AES-256-GCM ciphertext made on your devices.
CREATE TABLE IF NOT EXISTS vaults (
  vault TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS records (
  vault TEXT NOT NULL,
  id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  blob TEXT NOT NULL,
  PRIMARY KEY (vault, id)
);
CREATE INDEX IF NOT EXISTS records_by_seq ON records (vault, seq);
-- Daily encrypted backups, kept 30 days, split in parts to fit a row.
CREATE TABLE IF NOT EXISTS backups (
  vault TEXT NOT NULL,
  day TEXT NOT NULL,
  part INTEGER NOT NULL,
  parts INTEGER NOT NULL,
  blob TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (vault, day, part)
);
