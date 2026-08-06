-- Migration: Add nota_fiscal_url column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nota_fiscal_url text;
