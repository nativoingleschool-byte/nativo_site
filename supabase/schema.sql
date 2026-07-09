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
  ends_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  status text not null default 'agendada' check (status in ('agendada', 'concluida', 'cancelada', 'proposta_pendente')),
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
  billing_period varchar(7) null
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

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.lessons enable row level security;
alter table public.invoices enable row level security;
alter table public.invitations enable row level security;

-- Policies for Profiles
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
for select
using (auth.uid() = id or public.is_admin());

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

drop policy if exists "invitations_select_anon" on public.invitations;
create policy "invitations_select_anon" on public.invitations
for select
using (true);

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
