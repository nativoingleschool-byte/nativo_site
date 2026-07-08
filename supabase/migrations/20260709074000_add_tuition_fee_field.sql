-- Add tuition_fee field to public.profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS tuition_fee NUMERIC(10, 2);
