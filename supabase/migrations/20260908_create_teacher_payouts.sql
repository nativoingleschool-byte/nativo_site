-- Migration: 20260908_create_teacher_payouts.sql
-- Description: Create teacher_payouts table to persist teacher paid months and history across devices, and reload schema cache.

CREATE TABLE IF NOT EXISTS public.teacher_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month_key TEXT NOT NULL,
    hours_count NUMERIC(6,2) DEFAULT 0,
    amount NUMERIC(10,2) DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pago',
    paid_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (teacher_id, month_key)
);

ALTER TABLE public.teacher_payouts ENABLE ROW LEVEL SECURITY;

-- Admin full access
DROP POLICY IF EXISTS "teacher_payouts_admin_all" ON public.teacher_payouts;
CREATE POLICY "teacher_payouts_admin_all"
ON public.teacher_payouts
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Teachers can view their own payout history
DROP POLICY IF EXISTS "teacher_payouts_teacher_select" ON public.teacher_payouts;
CREATE POLICY "teacher_payouts_teacher_select"
ON public.teacher_payouts
FOR SELECT
TO authenticated
USING (teacher_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_teacher_payouts_teacher_id ON public.teacher_payouts(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_payouts_month_key ON public.teacher_payouts(month_key);

-- Reload PostgREST schema cache immediately
NOTIFY pgrst, 'reload schema';
