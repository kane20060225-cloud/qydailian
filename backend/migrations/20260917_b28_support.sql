-- Additive: preserve users, orders and existing permissions.
CREATE TABLE IF NOT EXISTS support_settings (
 id INT PRIMARY KEY, start_hour INT NOT NULL DEFAULT 9, end_hour INT NOT NULL DEFAULT 21,
 configured TINYINT NOT NULL DEFAULT 0, enabled TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO support_settings (id) VALUES (1);
CREATE TABLE IF NOT EXISTS support_conversations (
 id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, customer_id INT NOT NULL,
 order_type VARCHAR(20) NOT NULL DEFAULT '', order_ref VARCHAR(64) NOT NULL DEFAULT '',
 status VARCHAR(20) NOT NULL DEFAULT 'pending', customer_read_id BIGINT NOT NULL DEFAULT 0,
 last_message_id BIGINT NOT NULL DEFAULT 0, waiting_since DATETIME NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_support_order (customer_id,order_type,order_ref),
 KEY idx_support_queue (status,waiting_since,updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS support_messages (
 id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, conversation_id INT NOT NULL,
 sender_id INT NOT NULL, sender_kind VARCHAR(10) NOT NULL, client_id VARCHAR(64) NOT NULL,
 body TEXT NOT NULL, image_name VARCHAR(128) NULL,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_support_retry (conversation_id,sender_id,client_id),
 KEY idx_support_history (conversation_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS support_staff_reads (
 conversation_id INT NOT NULL, user_id INT NOT NULL, read_id BIGINT NOT NULL DEFAULT 0,
 PRIMARY KEY (conversation_id,user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
