-- Additive only. Does not close orders or change historical balances.
CREATE TABLE IF NOT EXISTS recharge_order_resolutions (
  out_trade_no VARCHAR(64) NOT NULL PRIMARY KEY,
  outcome VARCHAR(30) NOT NULL,
  status_snapshot VARCHAR(20) NOT NULL,
  trade_snapshot VARCHAR(64) NULL,
  reviewed_by INT NOT NULL,
  reason VARCHAR(500) NOT NULL,
  evidence_reference VARCHAR(200) NOT NULL,
  reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS order_lifecycle_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  timeout_enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
