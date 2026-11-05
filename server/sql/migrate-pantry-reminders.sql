-- 可重复执行；普通通知 event_key 为 NULL，不参与去重。不会发送通知或改库存。
SET @pantry_event_column = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_message' AND COLUMN_NAME = 'event_key'
);
SET @pantry_event_sql = IF(@pantry_event_column = 0,
    'ALTER TABLE notification_message ADD COLUMN event_key VARCHAR(96) NULL',
    'SELECT 1');
PREPARE pantry_event_stmt FROM @pantry_event_sql;
EXECUTE pantry_event_stmt;
DEALLOCATE PREPARE pantry_event_stmt;

SET @pantry_event_index = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_message' AND INDEX_NAME = 'uk_notification_event'
);
SET @pantry_event_sql = IF(@pantry_event_index = 0,
    'ALTER TABLE notification_message ADD UNIQUE KEY uk_notification_event (user_id, event_key)',
    'SELECT 1');
PREPARE pantry_event_stmt FROM @pantry_event_sql;
EXECUTE pantry_event_stmt;
DEALLOCATE PREPARE pantry_event_stmt;
