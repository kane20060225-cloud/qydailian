-- B4 TOTP additive migration. Review and back up before running on a staging database.
-- Never run this file automatically against the Aliyun production database.
ALTER TABLE user_settings
  MODIFY COLUMN two_factor_secret TEXT NULL,
  ADD COLUMN two_factor_last_step BIGINT NOT NULL DEFAULT -1;

CREATE TABLE IF NOT EXISTS user_two_factor_recovery_codes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  code_hash CHAR(64) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  used_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_two_factor_code_hash (user_id, code_hash),
  KEY idx_two_factor_active (user_id, active),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Existing two_factor_enabled=1 rows need manual review before deployment:
-- the old UI could set the flag without a usable secret. Do not reset them blindly.
