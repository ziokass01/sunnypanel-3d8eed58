-- Kept as a no-op repair marker. Main idempotent schema is in 20260531123000.
NOTIFY pgrst, 'reload schema';
SELECT pg_notification_queue_usage();
