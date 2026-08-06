-- Security fix: Remove overly-permissive anonymous read policy on invitations.
-- All invitation lookups happen server-side via service role key (register-student.js, invite-link.js).
DROP POLICY IF EXISTS "invitations_select_anon" ON public.invitations;
