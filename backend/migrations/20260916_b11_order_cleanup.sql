-- Reversible visibility metadata. Business orders, payment callbacks and ledgers remain intact.
CREATE TABLE IF NOT EXISTS order_removals (
  order_type VARCHAR(20) NOT NULL,
  order_ref VARCHAR(64) NOT NULL,
  removed_at DATETIME NOT NULL,
  removed_by INT NULL,
  reason VARCHAR(500) NOT NULL,
  state_snapshot VARCHAR(40) NOT NULL,
  payment_snapshot VARCHAR(30) NOT NULL,
  PRIMARY KEY (order_type, order_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_cleanup_settings (
  id INT NOT NULL PRIMARY KEY,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  retention_days INT UNSIGNED NOT NULL DEFAULT 7,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
