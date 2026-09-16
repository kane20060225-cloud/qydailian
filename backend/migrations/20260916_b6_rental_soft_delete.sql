-- Additive B6 rental-account soft deletion and targeted list/occupancy indexes.
-- No existing row is removed or rewritten by this migration.
ALTER TABLE rental_accounts ADD COLUMN deleted_at DATETIME NULL;
CREATE INDEX idx_rental_accounts_visibility_created
  ON rental_accounts (deleted_at, status, created_at, id);
CREATE INDEX idx_rental_accounts_owner_visibility_created
  ON rental_accounts (owner_id, deleted_at, created_at, id);
CREATE INDEX idx_rental_orders_account_status
  ON rental_orders (account_id, status);
