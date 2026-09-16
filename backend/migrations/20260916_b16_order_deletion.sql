-- Only additive review metadata. Business orders, payments and balances stay intact.
CREATE TABLE IF NOT EXISTS order_deletion_requests (
 order_type VARCHAR(20) NOT NULL,
 order_ref VARCHAR(64) NOT NULL,
 requester_user_id INT NULL,
 reason VARCHAR(500) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending',
 state_snapshot VARCHAR(40) NOT NULL,
 payment_snapshot VARCHAR(30) NOT NULL,
 reviewed_by INT NULL,
 review_note VARCHAR(500) NULL,
 evidence_reference VARCHAR(200) NULL,
 reviewed_at DATETIME NULL,
 retain_records TINYINT UNSIGNED NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (order_type,order_ref),
 KEY idx_order_deletion_pending (status,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
