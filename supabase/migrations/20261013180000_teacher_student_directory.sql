-- Narrow, authenticated directory for selecting students in teacher lesson forms.
-- No email, tax ID, billing fields or other sensitive profile columns are exposed.
CREATE OR REPLACE FUNCTION public.list_active_students_for_teachers()
RETURNS TABLE(id uuid, full_name text, role text, class_name text, archived boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT p.id, p.full_name::text, p.role::text, p.class_name::text, COALESCE(p.archived, false)
  FROM public.profiles p
  WHERE p.role = 'student'
    AND COALESCE(p.archived, false) = false
    AND EXISTS (
      SELECT 1 FROM public.profiles caller
      WHERE caller.id = (SELECT auth.uid())
        AND caller.role IN ('teacher', 'admin')
        AND COALESCE(caller.archived, false) = false
    )
  ORDER BY p.full_name;
$$;
REVOKE ALL ON FUNCTION public.list_active_students_for_teachers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_students_for_teachers() TO authenticated;