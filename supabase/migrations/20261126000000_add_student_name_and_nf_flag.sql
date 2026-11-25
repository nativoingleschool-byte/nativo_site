-- Add student_name and nf_issued_to_student flag to profiles so payer/NF recipient
-- and actual student can differ without modifying existing records.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nf_issued_to_student BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS student_name TEXT NULL;

-- Update teacher student directory RPC to expose the actual student name when
-- nf_issued_to_student is false and student_name is provided.
CREATE OR REPLACE FUNCTION public.list_active_students_for_teachers()
RETURNS TABLE(id uuid, full_name text, role text, class_name text, archived boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT
    p.id,
    CASE
      WHEN COALESCE(p.nf_issued_to_student, true) = false AND NULLIF(TRIM(p.student_name), '') IS NOT NULL
        THEN TRIM(p.student_name)
      ELSE p.full_name
    END::text AS full_name,
    p.role::text,
    p.class_name::text,
    COALESCE(p.archived, false)
  FROM public.profiles p
  WHERE p.role = 'student'
    AND COALESCE(p.archived, false) = false
    AND EXISTS (
      SELECT 1 FROM public.profiles caller
      WHERE caller.id = (SELECT auth.uid())
        AND caller.role IN ('teacher', 'admin')
        AND COALESCE(caller.archived, false) = false
    )
  ORDER BY
    CASE
      WHEN COALESCE(p.nf_issued_to_student, true) = false AND NULLIF(TRIM(p.student_name), '') IS NOT NULL
        THEN TRIM(p.student_name)
      ELSE p.full_name
    END;
$$;

REVOKE ALL ON FUNCTION public.list_active_students_for_teachers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_students_for_teachers() TO authenticated;
