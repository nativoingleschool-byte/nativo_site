-- Persistent notification center for authenticated users.
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT NULL,
  entity_id UUID NULL,
  action_url TEXT NULL,
  action_intent TEXT NULL,
  dedupe_key TEXT NULL,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
CREATE POLICY "notifications_insert_own" ON public.notifications
FOR INSERT
WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
FOR UPDATE
USING (user_id = auth.uid() OR public.is_admin())
WITH CHECK (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
FOR DELETE
USING (user_id = auth.uid() OR public.is_admin());

-- Enable Realtime when the project publication is available, without failing
-- migrations on installations where it is already enabled.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
