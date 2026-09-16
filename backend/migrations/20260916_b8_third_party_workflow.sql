-- Third-party order workflow metadata. Existing orders remain valid and receive
-- workflow rows lazily when their next action is recorded.
CREATE TABLE IF NOT EXISTS third_party_order_workflow (
  order_no VARCHAR(30) NOT NULL PRIMARY KEY,
  external_order_no VARCHAR(80) NULL,
  expected_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  completion_note TEXT NULL,
  completion_return_reason VARCHAR(500) NULL,
  payment_channel VARCHAR(30) NULL,
  payment_reference VARCHAR(80) NULL,
  payment_confirmed_by INT NULL,
  payment_confirmed_at DATETIME NULL,
  revision_count INT UNSIGNED NOT NULL DEFAULT 0,
  last_resubmitted_at DATETIME NULL,
  complete_requested_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tp_payment_reference (payment_channel, payment_reference),
  KEY idx_tp_workflow_expected (expected_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS third_party_order_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(30) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  actor_user_id INT NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tp_events_order_created (order_no, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
