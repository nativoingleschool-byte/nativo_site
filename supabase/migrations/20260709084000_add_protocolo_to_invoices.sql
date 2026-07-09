-- Add column to store asynchronous reception protocol
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS protocolo_recebimento text;
