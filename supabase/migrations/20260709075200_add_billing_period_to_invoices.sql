-- Add billing_period column to public.invoices table
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS billing_period VARCHAR(7);

-- Recreate check constraint on public.invoices.status to allow 'falha_emissao'
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK (status IN ('pendente', 'pago', 'atrasado', 'falha_emissao'));
