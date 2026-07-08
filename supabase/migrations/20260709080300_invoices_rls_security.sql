-- Ensure public.invoices SELECT policy is correctly configured for administrators and own students
DROP POLICY IF EXISTS "invoices_select" ON public.invoices;

CREATE POLICY "invoices_select" ON public.invoices
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR student_id = auth.uid()
);
