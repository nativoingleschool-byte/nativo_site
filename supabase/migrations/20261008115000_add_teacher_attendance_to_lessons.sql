alter table public.lessons
  add column if not exists teacher_attendance text null
  check (teacher_attendance in ('present', 'absent'));

comment on column public.lessons.teacher_attendance is 'Teacher-confirmed attendance for the student in this lesson';
