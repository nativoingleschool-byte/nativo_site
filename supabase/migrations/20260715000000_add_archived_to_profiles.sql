-- Add archived column to profiles
ALTER TABLE public.profiles ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;

-- Create an RPC to safely archive a student and delete their future lessons
CREATE OR REPLACE FUNCTION public.archive_student(student_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Mark profile as archived
  UPDATE public.profiles
  SET archived = true
  WHERE id = student_id_param;

  -- 2. Delete all future lessons
  DELETE FROM public.lessons
  WHERE student_id = student_id_param
    AND starts_at > now();
END;
$$;
