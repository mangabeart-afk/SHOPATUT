drop policy if exists "articles_client_incoming" on public.articles;

create policy "articles_client_incoming"
on public.articles
for select
to authenticated
using (
  status = 'IN_ARRIVO'
  and deleted_at is null
);
