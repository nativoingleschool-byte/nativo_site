-- Align live lessons schema with the fields used by teacher create/edit and attendance flows.
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS meeting_url text;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS teacher_attendance text;
NOTIFY pgrst, 'reload schema';
