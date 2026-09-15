-- B4 additive migration. Take and verify a backup before applying to production.
-- No existing user row, password, or token is deleted.

ALTER TABLE users
  ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0;
