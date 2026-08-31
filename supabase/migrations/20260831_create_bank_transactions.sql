-- Migration: 20260831_create_bank_transactions.sql
-- Description: Creates the bank_transactions table for bank statement reconciliation (.ofx / .csv) and NFS-e emission

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fitid TEXT UNIQUE NULL,
  transaction_date TIMESTAMPTZ NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  memo TEXT NOT NULL,
  student_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  nfse_id UUID NULL REFERENCES public.invoices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'issued', 'failed', 'ignored')),
  raw_data JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- Indexes for performant lookup and filtering
CREATE INDEX IF NOT EXISTS idx_bank_transactions_fitid ON public.bank_transactions(fitid);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_student_id ON public.bank_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON public.bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON public.bank_transactions(transaction_date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Only administrators can view and manage bank transactions
DROP POLICY IF EXISTS "bank_transactions_all_admin" ON public.bank_transactions;
CREATE POLICY "bank_transactions_all_admin" ON public.bank_transactions
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());
