-- B4 TOTP additive migration. Review and back up before running on a staging database.
-- Never run this file automatically against the Aliyun production database.
ALTER TABLE user_settings
  MODIFY COLUMN two_factor_secret TEXT NULL,
  ADD COLUMN two_factor_last_step BIGINT NOT NULL DEFAULT -1;

-- Existing two_factor_enabled=1 rows need manual review before deployment:
-- the old UI could set the flag without a usable secret. Do not reset them blindly.
