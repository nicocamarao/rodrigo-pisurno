create table if not exists public.portfolio_content (
  id text primary key check (id = 'main'),
  content jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.portfolio_content enable row level security;
drop policy if exists "Portfolio is public" on public.portfolio_content;
create policy "Portfolio is public"
  on public.portfolio_content for select
  to anon, authenticated
  using (true);

grant select on public.portfolio_content to anon, authenticated;
revoke insert, update, delete on public.portfolio_content from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio-media',
  'portfolio-media',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/avif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Portfolio images are public" on storage.objects;
create policy "Portfolio images are public"
  on storage.objects for select
  to public
  using (bucket_id = 'portfolio-media');
