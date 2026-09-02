-- Migration: Create teacher_notes, teacher_availability, and teacher_invoices tables

-- 1. Teacher Notes Table
CREATE TABLE IF NOT EXISTS public.teacher_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  month_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_teacher_notes_teacher_id ON public.teacher_notes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_notes_created_at ON public.teacher_notes(created_at);

ALTER TABLE public.teacher_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_notes_select" ON public.teacher_notes;
CREATE POLICY "teacher_notes_select" ON public.teacher_notes
FOR SELECT
USING (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_notes_insert" ON public.teacher_notes;
CREATE POLICY "teacher_notes_insert" ON public.teacher_notes
FOR INSERT
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_notes_delete" ON public.teacher_notes;
CREATE POLICY "teacher_notes_delete" ON public.teacher_notes
FOR DELETE
USING (public.is_admin() OR teacher_id = auth.uid());

-- 2. Teacher Availability Table
CREATE TABLE IF NOT EXISTS public.teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  series_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher_id ON public.teacher_availability(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_starts_at ON public.teacher_availability(starts_at);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_series_id ON public.teacher_availability(series_id);

ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_availability_select" ON public.teacher_availability;
CREATE POLICY "teacher_availability_select" ON public.teacher_availability
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "teacher_availability_insert" ON public.teacher_availability;
CREATE POLICY "teacher_availability_insert" ON public.teacher_availability
FOR INSERT
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_availability_update" ON public.teacher_availability;
CREATE POLICY "teacher_availability_update" ON public.teacher_availability
FOR UPDATE
USING (public.is_admin() OR teacher_id = auth.uid())
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_availability_delete" ON public.teacher_availability;
CREATE POLICY "teacher_availability_delete" ON public.teacher_availability
FOR DELETE
USING (public.is_admin() OR teacher_id = auth.uid());

-- 3. Teacher Invoices / Nota Fiscal History Table
CREATE TABLE IF NOT EXISTS public.teacher_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  amount NUMERIC NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'enviada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_teacher_invoices_teacher_id ON public.teacher_invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_month_key ON public.teacher_invoices(month_key);

ALTER TABLE public.teacher_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_invoices_select" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_select" ON public.teacher_invoices
FOR SELECT
USING (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_invoices_insert" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_insert" ON public.teacher_invoices
FOR INSERT
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_invoices_update" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_update" ON public.teacher_invoices
FOR UPDATE
USING (public.is_admin() OR teacher_id = auth.uid())
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_invoices_delete" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_delete" ON public.teacher_invoices
FOR DELETE
USING (public.is_admin() OR teacher_id = auth.uid());
