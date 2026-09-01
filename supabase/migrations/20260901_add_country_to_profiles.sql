-- Add country column to profiles table
-- Defaults to 'BR' (Brazil) for backward compatibility with existing students
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT 'BR';
