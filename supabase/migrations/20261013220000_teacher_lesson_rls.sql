-- Teachers may manage only lessons assigned to themselves and only for existing active students.
-- Teachers cannot create user accounts or view private student profile fields.
DROP POLICY IF EXISTS lessons_insert_teacher_own ON public.lessons;
CREATE POLICY lessons_insert_teacher_own ON public.lessons FOR INSERT TO authenticated
WITH CHECK (
  teacher_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid()) AND actor.role = 'teacher'
      AND COALESCE(actor.archived,false) = false
  )
  AND EXISTS (
    SELECT 1 FROM public.profiles student
    WHERE student.id = lessons.student_id AND student.role = 'student'
      AND COALESCE(student.archived,false) = false
  )
);
DROP POLICY IF EXISTS lessons_delete_teacher_own ON public.lessons;
CREATE POLICY lessons_delete_teacher_own ON public.lessons FOR DELETE TO authenticated
USING (
  teacher_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = (SELECT auth.uid()) AND actor.role = 'teacher'
      AND COALESCE(actor.archived,false) = false
  )
);
