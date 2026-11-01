-- Migration: 20261027100000_scheduled_reminders_cron.sql
-- Description: Server-side scheduled reminders generation for lessons (lookback 48h, upcoming 4h) with pg_cron automation.

CREATE OR REPLACE FUNCTION public.generate_scheduled_lesson_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_min_time TIMESTAMPTZ := v_now - INTERVAL '48 hours';
  v_max_time TIMESTAMPTZ := v_now + INTERVAL '4 hours';
  v_inserted_count integer := 0;
BEGIN
  -- 1. Teacher overdue/start reminders (lesson started within last 48h, teacher status not yet recorded)
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    action_intent,
    dedupe_key
  )
  SELECT
    l.teacher_id,
    'lesson_reminder',
    'Teacher class check',
    COALESCE(l.subject, 'Aulas de Inglês') || ' is due now. Record what happened.',
    'lesson',
    l.id,
    '/reminder?lessonId=' || l.id::text,
    'happened',
    l.teacher_id::text || '-' || l.id::text || '-teacher-start'
  FROM public.lessons l
  WHERE l.teacher_id IS NOT NULL
    AND l.starts_at <= v_now
    AND l.starts_at >= v_min_time
    AND l.teacher_lesson_status IS NULL
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  -- 2. Teacher upcoming reminders (starts in <= 4 hours)
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    action_intent,
    dedupe_key
  )
  SELECT
    l.teacher_id,
    'lesson_reminder',
    'Upcoming lesson reminder',
    COALESCE(p.full_name, 'Student') || ' has ' || COALESCE(l.student_attendance, 'not replied') || ' for ' || COALESCE(l.subject, 'class') || '.',
    'lesson',
    l.id,
    '/reminder?lessonId=' || l.id::text,
    NULL,
    l.teacher_id::text || '-' || l.id::text || '-teacher-4h'
  FROM public.lessons l
  LEFT JOIN public.profiles p ON p.id = l.student_id
  WHERE l.teacher_id IS NOT NULL
    AND l.starts_at > v_now
    AND l.starts_at <= v_max_time
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  -- 3. Student overdue/start reminders (lesson started within last 48h, student status not yet recorded)
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    action_intent,
    dedupe_key
  )
  SELECT
    l.student_id,
    'lesson_reminder',
    'Class-time reminder',
    COALESCE(l.subject, 'Aulas de Inglês') || ' is due now. Confirm whether the class was done.',
    'lesson',
    l.id,
    '/reminder?lessonId=' || l.id::text,
    'done',
    l.student_id::text || '-' || l.id::text || '-student-start'
  FROM public.lessons l
  WHERE l.student_id IS NOT NULL
    AND l.starts_at <= v_now
    AND l.starts_at >= v_min_time
    AND l.student_lesson_status IS NULL
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  -- 4. Student upcoming reminders (starts in <= 4 hours and attendance is null)
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    entity_type,
    entity_id,
    action_url,
    action_intent,
    dedupe_key
  )
  SELECT
    l.student_id,
    'lesson_reminder',
    'Lesson reminder',
    COALESCE(l.subject, 'Aulas de Inglês') || ' starts soon.',
    'lesson',
    l.id,
    '/reminder?lessonId=' || l.id::text,
    'attend',
    l.student_id::text || '-' || l.id::text || '-student-4h'
  FROM public.lessons l
  WHERE l.student_id IS NOT NULL
    AND l.starts_at > v_now
    AND l.starts_at <= v_max_time
    AND l.student_attendance IS NULL
  ON CONFLICT (user_id, dedupe_key) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
  RETURN v_inserted_count;
END;
$$;

-- Safely schedule the 15-minute cron job if pg_cron is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('generate-lesson-reminders-15m');
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;

    PERFORM cron.schedule(
      'generate-lesson-reminders-15m',
      '*/15 * * * *',
      'SELECT public.generate_scheduled_lesson_reminders()'
    );
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron schedule notice: %', SQLERRM;
END $$;
