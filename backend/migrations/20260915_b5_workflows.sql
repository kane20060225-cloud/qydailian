-- B5 workflow metadata is additive. Existing orders remain unchanged until an
-- administrator individually reviews them; no historical state is inferred.
CREATE TABLE IF NOT EXISTS rental_order_workflow (
  order_no VARCHAR(30) NOT NULL PRIMARY KEY,
  payment_status ENUM('unpaid','submitted','paid','rejected') NOT NULL DEFAULT 'unpaid',
  owner_complete_requested_at DATETIME NULL,
  renter_confirmed_at DATETIME NULL,
  disputed_at DATETIME NULL,
  resolved_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS third_party_order_finalization (
  order_no VARCHAR(30) NOT NULL PRIMARY KEY,
  final_status ENUM('completed') NOT NULL,
  finalized_by INT NOT NULL,
  finalized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS manual_payment_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  business_type ENUM('order','rental_order','third_party_order') NOT NULL,
  business_ref VARCHAR(30) NOT NULL,
  uploader_user_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  expected_amount DECIMAL(10,2) NOT NULL,
  status ENUM('submitted','accepted','rejected') NOT NULL DEFAULT 'submitted',
  reviewer_user_id INT NULL,
  reviewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_manual_payment_business (business_type, business_ref, created_at),
  KEY idx_manual_payment_review (status, created_at),
  CONSTRAINT chk_manual_payment_expected_amount CHECK (expected_amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
