-- Reviewed, not applied to production. Apply only after checking all lesson consumers.
alter table public.lessons alter column student_id drop not null;
alter table public.lessons add column if not exists is_substitution boolean not null default false;
alter table public.lessons add constraint substitution_student_integrity
  check (student_id is not null or is_substitution = true);

-- Existing teacher INSERT policy requires a registered student, so an explicit
-- exception is needed for a student-free substitution owned by this teacher.
alter policy lessons_insert_teacher_own on public.lessons
with check (
  teacher_id = (select auth.uid())
  and exists (
    select 1 from public.profiles actor
    where actor.id = (select auth.uid())
      and actor.role = 'teacher' and coalesce(actor.archived,false) = false
  )
  and (
    (student_id is not null and (select public.is_active_registered_student(student_id)))
    or (student_id is null and is_substitution = true)
  )
);

create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null,
 p256dh text not null,
 auth text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy "push_subscription_owner_select" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "push_subscription_owner_insert" on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push_subscription_owner_update" on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push_subscription_owner_delete" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));
