-- B5 forward-only, additive schema. Never run against production without a fresh
-- verified backup, read-only schema check, maintenance approval and dry-run plan.
CREATE TABLE IF NOT EXISTS account_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entry_key VARCHAR(128) NOT NULL,
  user_id INT NOT NULL,
  account_type ENUM('qy_credits','chest_tickets','booster_points','earnings','rental_earnings','balance') NOT NULL,
  amount_delta DECIMAL(16,2) NOT NULL,
  balance_after DECIMAL(16,2) NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_ref VARCHAR(80) NOT NULL,
  actor_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_account_ledger_entry_key (entry_key),
  KEY idx_account_ledger_user_account_created (user_id, account_type, created_at),
  KEY idx_account_ledger_source (source_type, source_ref),
  CONSTRAINT chk_account_ledger_nonzero CHECK (amount_delta <> 0),
  CONSTRAINT chk_account_ledger_nonnegative CHECK (balance_after >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS operation_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  event_key VARCHAR(128) NOT NULL,
  actor_user_id INT NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(40) NOT NULL,
  target_ref VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_operation_audit_event_key (event_key),
  KEY idx_operation_audit_target_created (target_type, target_ref, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
