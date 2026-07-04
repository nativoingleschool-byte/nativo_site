-- Create table for tracking daily remessa sequence
CREATE TABLE IF NOT EXISTS public.barueri_remessa_seq (
  data_remessa DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  sequencia INT NOT NULL DEFAULT 1
);

-- RPC function to atomically increment and return the next sequence number for the current date
CREATE OR REPLACE FUNCTION public.get_next_barueri_remessa()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with high privileges so standard users or API calls can query it safely if needed
AS $$
DECLARE
  next_seq INT;
BEGIN
  INSERT INTO public.barueri_remessa_seq (data_remessa, sequencia)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (data_remessa)
  DO UPDATE SET sequencia = barueri_remessa_seq.sequencia + 1
  RETURNING sequencia INTO next_seq;
  
  RETURN next_seq;
END;
$$;
