-- Additive metadata only. No historical payment or account balance is changed.
CREATE TABLE IF NOT EXISTS recharge_order_workflow (
  out_trade_no VARCHAR(64) NOT NULL PRIMARY KEY,
  ticket_quantity INT UNSIGNED NULL,
  provider_status VARCHAR(30) NULL,
  provider_checked_at DATETIME NULL,
  credited_at DATETIME NULL,
  credit_error_code VARCHAR(60) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_management_state (
  order_type VARCHAR(20) NOT NULL,
  order_ref VARCHAR(64) NOT NULL,
  archived_at DATETIME NULL,
  archived_by INT NULL,
  archive_reason VARCHAR(500) NULL,
  PRIMARY KEY (order_type, order_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_management_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_type VARCHAR(20) NOT NULL,
  order_ref VARCHAR(64) NOT NULL,
  actor_user_id INT NULL,
  action VARCHAR(50) NOT NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_order_management_event (order_type, order_ref, created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
