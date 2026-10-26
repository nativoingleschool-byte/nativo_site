-- PREVIEW/STAGING MIGRATION ONLY: apply after verifying existing RLS and consumers.
-- An instructor may reserve or record a substitution lesson without identifying a student.
alter table public.lessons add column if not exists lesson_kind text not null default 'standard';
alter table public.lessons drop constraint if exists lessons_lesson_kind_check;
alter table public.lessons add constraint lessons_lesson_kind_check
  check (lesson_kind in ('standard','substitution'));
alter table public.lessons alter column student_id drop not null;
alter table public.lessons drop constraint if exists lessons_student_required_check;
alter table public.lessons add constraint lessons_student_required_check
  check (lesson_kind = 'substitution' or student_id is not null);
comment on column public.lessons.lesson_kind is 'substitution permits a teacher-only appointment; student_id must be null or valid UUID.';

-- Private device subscriptions. No public read/write, only authenticated server endpoints.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);

-- Durable dedupe across devices and scheduled runs; no client writes.
create table if not exists public.push_delivery_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  unique(user_id, dedupe_key)
);
alter table public.push_delivery_log enable row level security;
revoke all on public.push_delivery_log from anon, authenticated;
