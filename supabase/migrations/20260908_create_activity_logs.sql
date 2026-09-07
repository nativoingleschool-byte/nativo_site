-- Migration: 20260908_create_activity_logs.sql
-- Description: Create activity_logs table for platform telemetry & audit trail with strict RLS and 90-day retention.

-- 1. Enable pg_cron extension if available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Create activity_logs table
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    user_role TEXT,
    event_name TEXT NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- 4. Strict RLS Policies
-- Authenticated users can only insert logs where user_id matches their own auth.uid()
DROP POLICY IF EXISTS "Authenticated users can insert own activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can insert own activity logs"
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Admins can query all activity logs for auditing and weekly reporting
DROP POLICY IF EXISTS "Admins can view activity logs" ON public.activity_logs;
CREATE POLICY "Admins can view activity logs"
ON public.activity_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Zero access for anon: no policies are granted to the anon role.

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_name ON public.activity_logs (event_name);

-- 6. Retention Maintenance (90 days)
CREATE OR REPLACE FUNCTION clean_old_activity_logs()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.activity_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
$$;

-- Safely schedule the daily cleanup job at 03:00 UTC if pg_cron is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule previous job if exists to avoid duplicate schedules
    BEGIN
      PERFORM cron.unschedule('cleanup-activity-logs-90-days');
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    PERFORM cron.schedule(
      'cleanup-activity-logs-90-days',
      '0 3 * * *',
      'SELECT clean_old_activity_logs()'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule notice: %', SQLERRM;
END $$;
