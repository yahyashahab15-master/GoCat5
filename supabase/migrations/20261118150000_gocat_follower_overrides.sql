-- Owner-only public follower display totals.
-- Real follows remain stored in public.follows and are never changed here.

create table if not exists public.gocat_follower_overrides (
    user_id text primary key references public.users(id) on delete cascade,
    follower_count bigint not null check (follower_count >= 0),
    updated_by uuid not null references auth.users(id),
    updated_at timestamptz not null default now()
);

alter table public.gocat_follower_overrides enable row level security;

drop policy if exists "Public can read follower display totals" on public.gocat_follower_overrides;
create policy "Public can read follower display totals"
    on public.gocat_follower_overrides for select
    to anon, authenticated using (true);

revoke all on table public.gocat_follower_overrides from anon, authenticated;
grant select on table public.gocat_follower_overrides to anon, authenticated;

create or replace function public.gocat_admin_set_follower_count(
    target_user_id text,
    target_count bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not exists (
        select 1 from public.gocat_admins a where a.user_id = auth.uid()
    ) then
        raise exception 'GoCat owner access required' using errcode = '42501';
    end if;

    if target_user_id is null or btrim(target_user_id) = '' then
        raise exception 'A creator must be selected' using errcode = '22023';
    end if;
    if target_count is null or target_count < 0 or target_count > 2147483647 then
        raise exception 'Follower total must be between 0 and 2,147,483,647' using errcode = '22023';
    end if;
    if not exists (select 1 from public.users u where u.id = target_user_id) then
        raise exception 'Creator was not found' using errcode = 'P0002';
    end if;

    insert into public.gocat_follower_overrides(user_id, follower_count, updated_by, updated_at)
    values (target_user_id, target_count, auth.uid(), now())
    on conflict (user_id) do update
        set follower_count = excluded.follower_count,
            updated_by = excluded.updated_by,
            updated_at = excluded.updated_at;

    return target_count;
end;
$$;

create or replace function public.gocat_admin_clear_follower_count(target_user_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
    if auth.uid() is null or not exists (
        select 1 from public.gocat_admins a where a.user_id = auth.uid()
    ) then
        raise exception 'GoCat owner access required' using errcode = '42501';
    end if;

    delete from public.gocat_follower_overrides where user_id = target_user_id;
end;
$$;

revoke all on function public.gocat_admin_set_follower_count(text, bigint) from public, anon;
grant execute on function public.gocat_admin_set_follower_count(text, bigint) to authenticated;
revoke all on function public.gocat_admin_clear_follower_count(text) from public, anon;
grant execute on function public.gocat_admin_clear_follower_count(text) to authenticated;
