create extension if not exists pgcrypto;

-- 1. Profiles Table (Holds authentication and role-based details)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'teacher', 'student')),
  timezone text not null default 'UTC',
  class_name text not null default '',
  speciality text not null default '',
  push_enabled boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  
  -- Student specific fields
  cpf text null,
  data_pagamento_preferencial integer null check (data_pagamento_preferencial between 1 and 31),
  status_pagamento text null check (status_pagamento in ('em_dia', 'atrasado', 'pendente')),
  cep text null,
  logradouro text null,
  bairro text null,
  cidade text null,
  uf text null,
  tuition_fee numeric(10,2) null,
  
  -- Teacher specific fields
  chave_pix text null,
  cnpj text null,
  status_nota_fiscal text null check (status_nota_fiscal in ('enviada', 'pendente', 'nao_se_aplica')),
  taxa_hora_aula numeric(10,2) not null default 56.00,
  moeda_taxa text not null default 'BRL',
  status_pagamento_professor text null check (status_pagamento_professor in ('pago', 'pendente')) default 'pendente'
);

-- 2. Lessons Table (Class schedule and tracking)
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  class_name text not null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  recurrence text not null default 'none',
  student_attendance text null check (student_attendance in ('attend', 'cancel')),
  student_lesson_status text null check (student_lesson_status in ('done', 'not_done')),
  teacher_lesson_status text null check (teacher_lesson_status in ('happened', 'not_happened', 'student_no_show')),
  created_at timestamptz not null default timezone('utc', now())
);

-- 3. Invoices Table (NFS-e and payments tracking)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  boleto_url text null,
  status text not null check (status in ('pendente', 'pago', 'atrasado', 'falha_emissao')),
  nfse_url text null,
  created_at timestamptz not null default timezone('utc', now()),
  rps_number bigint null,
  nfs_e_pdf_link text null,
  billing_period varchar(7) null,
  protocolo_recebimento text null
);

-- 4. Invitations Table (Magic invitation links)
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default timezone('utc', now()),
  used boolean not null default false,
  is_global boolean not null default false
);

-- Helper function to check if active user is an admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- Helper function to archive a student safely
create or replace function public.archive_student(student_id_param uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Mark profile as archived
  update public.profiles
  set archived = true
  where id = student_id_param;

  -- 2. Delete all future lessons
  delete from public.lessons
  where student_id = student_id_param
    and starts_at > now();
end;
$$;

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.invoices enable row level security;
alter table public.invitations enable row level security;

-- Policies for Profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select
using (
  auth.uid() = id
  or public.is_admin()
  or exists (
    select 1 from public.profiles where id = auth.uid() and role = 'teacher'
  )
);

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin" on public.profiles
for insert
with check (public.is_admin());

-- Policies for Lessons
drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons
for select
using (
  public.is_admin()
  or student_id = auth.uid()
  or teacher_id = auth.uid()
);

drop policy if exists "lessons_insert_admin" on public.lessons;
create policy "lessons_insert_admin" on public.lessons
for insert
with check (public.is_admin());

drop policy if exists "lessons_update" on public.lessons;
create policy "lessons_update" on public.lessons
for update
using (
  public.is_admin()
  or student_id = auth.uid()
  or teacher_id = auth.uid()
)
with check (
  public.is_admin()
  or student_id = auth.uid()
  or teacher_id = auth.uid()
);

-- Policies for Invoices
drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
for select
to authenticated
using (
  public.is_admin()
  or student_id = auth.uid()
);

drop policy if exists "invoices_all_admin" on public.invoices;
create policy "invoices_all_admin" on public.invoices
for all
using (public.is_admin())
with check (public.is_admin());

-- Policies for Invitations
drop policy if exists "invitations_all_admin" on public.invitations;
create policy "invitations_all_admin" on public.invitations
for all
using (public.is_admin())
with check (public.is_admin());


-- 5. Barueri Remessa Sequence tracking
CREATE TABLE IF NOT EXISTS public.barueri_remessa_seq (
  data_remessa DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  sequencia INT NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION public.get_next_barueri_remessa()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_seq INT;
BEGIN
  INSERT INTO public.barueri_remessa_seq (data_remessa, sequencia)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (data_remessa)
  DO UPDATE SET sequencia = barueri_remessa_seq.sequencia + 1
  RETURNING sequencia INTO next_seq;
  
END;
$$;

-- 7. Barueri RPS Sequence tracking
CREATE TABLE IF NOT EXISTS public.barueri_rps_seq (
  data_rps DATE PRIMARY KEY DEFAULT CURRENT_DATE,
  sequencia INT NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION public.get_next_barueri_rps()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
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

  formatted_rps := (to_char(today_date, 'YYYYMMDD') || lpad(next_seq::text, 3, '0'))::bigint;

  RETURN formatted_rps;
END;
$$;

-- 8. Bank Transactions Table (Statement reconciliation and NFS-e emission)
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

CREATE INDEX IF NOT EXISTS idx_bank_transactions_fitid ON public.bank_transactions(fitid);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_student_id ON public.bank_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON public.bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON public.bank_transactions(transaction_date);

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_transactions_all_admin" ON public.bank_transactions;
CREATE POLICY "bank_transactions_all_admin" ON public.bank_transactions
FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 9. Teacher Notes Table (Notes & justifications sent to Admin)
CREATE TABLE IF NOT EXISTS public.teacher_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  month_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_teacher_notes_teacher_id ON public.teacher_notes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_notes_created_at ON public.teacher_notes(created_at);

ALTER TABLE public.teacher_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_notes_select" ON public.teacher_notes;
CREATE POLICY "teacher_notes_select" ON public.teacher_notes
FOR SELECT
USING (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_notes_insert" ON public.teacher_notes;
CREATE POLICY "teacher_notes_insert" ON public.teacher_notes
FOR INSERT
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_notes_delete" ON public.teacher_notes;
CREATE POLICY "teacher_notes_delete" ON public.teacher_notes
FOR DELETE
USING (public.is_admin() OR teacher_id = auth.uid());

-- 10. Teacher Availability Table (Slots when teachers can teach classes)
CREATE TABLE IF NOT EXISTS public.teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  series_id UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher_id ON public.teacher_availability(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_starts_at ON public.teacher_availability(starts_at);
CREATE INDEX IF NOT EXISTS idx_teacher_availability_series_id ON public.teacher_availability(series_id);

ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_availability_select" ON public.teacher_availability;
CREATE POLICY "teacher_availability_select" ON public.teacher_availability
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "teacher_availability_insert" ON public.teacher_availability;
CREATE POLICY "teacher_availability_insert" ON public.teacher_availability
FOR INSERT
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_availability_update" ON public.teacher_availability;
CREATE POLICY "teacher_availability_update" ON public.teacher_availability
FOR UPDATE
USING (public.is_admin() OR teacher_id = auth.uid())
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_availability_delete" ON public.teacher_availability;
CREATE POLICY "teacher_availability_delete" ON public.teacher_availability
FOR DELETE
USING (public.is_admin() OR teacher_id = auth.uid());

-- 11. Teacher Invoices / Nota Fiscal History Table
CREATE TABLE IF NOT EXISTS public.teacher_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month_key TEXT NOT NULL,
  amount NUMERIC NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NULL,
  status TEXT NOT NULL DEFAULT 'enviada',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_teacher_invoices_teacher_id ON public.teacher_invoices(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_invoices_month_key ON public.teacher_invoices(month_key);

ALTER TABLE public.teacher_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teacher_invoices_select" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_select" ON public.teacher_invoices
FOR SELECT
USING (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_invoices_insert" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_insert" ON public.teacher_invoices
FOR INSERT
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_invoices_update" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_update" ON public.teacher_invoices
FOR UPDATE
USING (public.is_admin() OR teacher_id = auth.uid())
WITH CHECK (public.is_admin() OR teacher_id = auth.uid());

DROP POLICY IF EXISTS "teacher_invoices_delete" ON public.teacher_invoices;
CREATE POLICY "teacher_invoices_delete" ON public.teacher_invoices
FOR DELETE
USING (public.is_admin() OR teacher_id = auth.uid());




