-- 1. Create webhook_logs table for Cora Bank
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2. Create RPS sequence table
CREATE TABLE IF NOT EXISTS public.barueri_rps_seq (
  data_rps DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  sequencia INT NOT NULL DEFAULT 1
);

-- 3. Create RPC function to get YYYYMMDDxxx formatted RPS number
CREATE OR REPLACE FUNCTION get_next_barueri_rps()
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  today_date DATE := CURRENT_DATE;
  next_seq INT;
  formatted_rps BIGINT;
BEGIN
  INSERT INTO public.barueri_rps_seq (data_rps, sequencia)
  VALUES (today_date, 1)
  ON CONFLICT (data_rps)
  DO UPDATE SET sequencia = barueri_rps_seq.sequencia + 1
  RETURNING sequencia INTO next_seq;

  -- Format as YYYYMMDDxxx (e.g. 20260708001)
  formatted_rps := (to_char(today_date, 'YYYYMMDD') || lpad(next_seq::text, 3, '0'))::bigint;

  RETURN formatted_rps;
END;
$$;

-- 4. Add fields to existing invoices table
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS rps_number BIGINT,
ADD COLUMN IF NOT EXISTS nfs_e_pdf_link TEXT;
