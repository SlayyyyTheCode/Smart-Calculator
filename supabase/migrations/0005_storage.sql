-- Smart Planner :: receipt storage
--
-- Private bucket. Object keys are {user_id}/{transaction_id}/{filename}, and
-- the policies below match on that leading path segment, so one user can never
-- read or write another user's receipts. Files are served through signed URLs
-- created server-side, never by making the bucket public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- Dropped first so a push that failed part way through can be retried. Creating
-- policies on storage.objects needs ownership of that table; if these four fail
-- with "must be owner of relation objects", add them from the dashboard under
-- Storage -> Policies with the same expressions.
drop policy if exists "receipts: read own"   on storage.objects;
drop policy if exists "receipts: upload own" on storage.objects;
drop policy if exists "receipts: update own" on storage.objects;
drop policy if exists "receipts: delete own" on storage.objects;

create policy "receipts: read own"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "receipts: upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The with check clause is what stops an update from renaming an object into
-- somebody else's folder. Postgres would fall back to the using clause here,
-- but a security boundary should not rest on a default.
create policy "receipts: update own"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "receipts: delete own"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
