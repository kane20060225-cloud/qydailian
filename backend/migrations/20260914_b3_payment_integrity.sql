-- B3 preparation only. Review and back up the target database before execution.
-- This migration only adds nullable audit fields and an index. It does not delete data.

ALTER TABLE payment_orders
  ADD COLUMN alipay_trade_no VARCHAR(64) NULL AFTER out_trade_no,
  ADD COLUMN paid_at DATETIME NULL AFTER status,
  ADD COLUMN closed_at DATETIME NULL AFTER paid_at,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD UNIQUE KEY uq_payment_orders_alipay_trade_no (alipay_trade_no),
  ADD INDEX idx_payment_orders_status_created_at (status, created_at);
