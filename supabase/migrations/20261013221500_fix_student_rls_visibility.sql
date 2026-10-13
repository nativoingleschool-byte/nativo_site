CREATE OR REPLACE FUNCTION public.is_active_registered_student(target_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = target_id AND p.role = 'student'
    AND COALESCE(p.archived,false) = false
) $$;
REVOKE ALL ON FUNCTION public.is_active_registered_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_registered_student(uuid) TO authenticated;
DROP POLICY IF EXISTS lessons_insert_teacher_own ON public.lessons;
CREATE POLICY lessons_insert_teacher_own ON public.lessons FOR INSERT TO authenticated
WITH CHECK (
  teacher_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid()) AND actor.role = 'teacher'
      AND COALESCE(actor.archived,false) = false
  )
  AND (SELECT public.is_active_registered_student(student_id))
);