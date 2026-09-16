-- Additive metadata only. Existing boosters start offline until they choose to work.
CREATE TABLE IF NOT EXISTS booster_availability (
 user_id INT NOT NULL PRIMARY KEY,
 mode VARCHAR(10) NOT NULL DEFAULT 'manual',
 manual_online TINYINT UNSIGNED NOT NULL DEFAULT 0,
 weekly_schedule TEXT NULL,
 override_online TINYINT UNSIGNED NULL,
 override_until BIGINT UNSIGNED NULL,
 admin_paused TINYINT UNSIGNED NOT NULL DEFAULT 0,
 admin_pause_until BIGINT UNSIGNED NULL,
 admin_reason VARCHAR(200) NOT NULL DEFAULT '',
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS booster_availability_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 actor_id INT NOT NULL,
 action VARCHAR(30) NOT NULL,
 detail TEXT NOT NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_availability_events (user_id,id)
);
