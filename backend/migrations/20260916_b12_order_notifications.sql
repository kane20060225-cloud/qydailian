-- Additive notification metadata. No historical order fan-out or external messages.
CREATE TABLE IF NOT EXISTS order_notifications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id INT NOT NULL,
 event_key VARCHAR(128) NOT NULL,
 kind VARCHAR(30) NOT NULL,
 order_type VARCHAR(20) NOT NULL,
 order_ref VARCHAR(64) NOT NULL,
 title VARCHAR(160) NOT NULL,
 body VARCHAR(500) NOT NULL,
 read_at DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_notification_recipient (user_id,event_key),
 KEY idx_notification_inbox (user_id,id),
 KEY idx_notification_unread (user_id,read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id INT NOT NULL PRIMARY KEY,
 new_orders TINYINT UNSIGNED NOT NULL DEFAULT 1,
 wecom TINYINT UNSIGNED NOT NULL DEFAULT 1,
 sound TINYINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wecom_notification_config (
 id INT NOT NULL PRIMARY KEY,
 corp_id VARCHAR(64) NULL,
 agent_id INT UNSIGNED NULL,
 corp_secret TEXT NULL,
 enabled TINYINT UNSIGNED NOT NULL DEFAULT 0,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wecom_user_bindings (
 user_id INT NOT NULL PRIMARY KEY,
 corp_id VARCHAR(64) NOT NULL,
 agent_id INT UNSIGNED NOT NULL,
 wecom_user_id VARCHAR(64) NOT NULL,
 verified_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_wecom_identity (corp_id,agent_id,wecom_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS wecom_oauth_states (
 state_hash CHAR(64) NOT NULL PRIMARY KEY,
 user_id INT NOT NULL,
 token_version INT UNSIGNED NOT NULL,
 corp_id VARCHAR(64) NOT NULL,
 agent_id INT UNSIGNED NOT NULL,
 expires_at DATETIME NOT NULL,
 KEY idx_wecom_state_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS notification_deliveries (
 notification_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 status VARCHAR(20) NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 retry_after DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 locked_at DATETIME NULL,
 last_error_code VARCHAR(80) NULL,
 message_id VARCHAR(128) NULL,
 KEY idx_notification_delivery_due (status,retry_after)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
