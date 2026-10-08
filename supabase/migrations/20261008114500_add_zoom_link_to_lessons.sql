alter table public.lessons
  add column if not exists meeting_url text null;

comment on column public.lessons.meeting_url is 'Optional Zoom meeting URL used in lesson details and calendar invitations';
