-- B2 preparation only. Review and back up the target database before execution.
-- This migration changes column capacity but does not encrypt existing values.

ALTER TABLE orders
  MODIFY COLUMN game_account TEXT NULL,
  MODIFY COLUMN game_password TEXT NULL;

ALTER TABLE users
  MODIFY COLUMN game_account TEXT NULL,
  MODIFY COLUMN game_password TEXT NULL;
