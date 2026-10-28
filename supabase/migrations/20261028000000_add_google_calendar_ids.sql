-- Add Google Calendar Event IDs to lessons and teacher_availability for 1-to-1 sync with Central School Google Calendar.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS google_event_id TEXT NULL;
ALTER TABLE public.teacher_availability ADD COLUMN IF NOT EXISTS google_event_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_lessons_google_event_id
  ON public.lessons(google_event_id)
  WHERE google_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teacher_availability_google_event_id
  ON public.teacher_availability(google_event_id)
  WHERE google_event_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
