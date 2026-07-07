-- Add address columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS cep text,
ADD COLUMN IF NOT EXISTS logradouro text,
ADD COLUMN IF NOT EXISTS bairro text,
ADD COLUMN IF NOT EXISTS cidade text,
ADD COLUMN IF NOT EXISTS uf text;

-- Add is_global column to invitations table
ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS is_global boolean NOT NULL DEFAULT false;
