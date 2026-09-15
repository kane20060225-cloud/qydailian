-- Additive metadata for administrator-verified real refunds and dispute decisions.
-- Neither table triggers a payment or deletes a historical rental order.
CREATE TABLE IF NOT EXISTS rental_payment_reviews (
  order_no VARCHAR(30) NOT NULL PRIMARY KEY,
  evidence_id BIGINT UNSIGNED NOT NULL,
  payment_reference VARCHAR(80) NOT NULL,
  confirmed_by INT NOT NULL,
  confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rental_payment_reference (payment_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rental_refund_reviews (
  order_no VARCHAR(30) NOT NULL PRIMARY KEY,
  refunded_amount DECIMAL(10,2) NOT NULL,
  refund_reference VARCHAR(80) NOT NULL,
  confirmed_by INT NOT NULL,
  confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rental_refund_reference (refund_reference),
  CONSTRAINT chk_rental_refund_nonnegative CHECK (refunded_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rental_settlement_resolutions (
  order_no VARCHAR(30) NOT NULL PRIMARY KEY,
  decision ENUM('completed','cancelled') NOT NULL,
  resolution_reference VARCHAR(80) NOT NULL,
  decided_by INT NOT NULL,
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
