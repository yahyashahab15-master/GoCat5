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


-- Let clients already subscribed to GoCat Postgres Changes refresh displayed
-- follower totals immediately after an owner adjustment.
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (
          select 1
          from pg_publication_tables
          where pubname = 'supabase_realtime'
            and schemaname = 'public'
            and tablename = 'gocat_follower_overrides'
       ) then
        alter publication supabase_realtime add table public.gocat_follower_overrides;
    end if;
end;
$$;


-- Creator-owned visual channel theme.
alter table public.users
    add column if not exists channel_theme text not null default 'emerald';
alter table public.users
    drop constraint if exists users_channel_theme_check;
alter table public.users
    add constraint users_channel_theme_check
    check (channel_theme in ('emerald','ocean','sunset','violet','slate'));
grant select (channel_theme) on public.users to anon, authenticated;
grant update (channel_theme) on public.users to authenticated;

-- Public leaderboard uses aggregate video-view counts only. Viewer IDs are
-- never returned from this function.
create or replace function public.gocat_weekly_creator_leaderboard()
returns table (
    user_id text,
    username text,
    avatar_path text,
    weekly_views bigint,
    active_videos bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select u.id, u.username, u.avatar_path,
           count(*)::bigint as weekly_views,
           count(distinct v.id)::bigint as active_videos
    from public.video_views vv
    join public.videos v on v.id = vv.video_id
    join public.users u on u.id = v.owner_id
    where vv.created_at >= pg_catalog.now() - interval '7 days'
      and coalesce(u.is_banned, false) = false
    group by u.id, u.username, u.avatar_path
    order by count(*) desc, max(vv.created_at) desc, u.username asc
    limit 10;
$$;
revoke all on function public.gocat_weekly_creator_leaderboard() from public;
grant execute on function public.gocat_weekly_creator_leaderboard() to anon, authenticated;


-- Public creator channel themes; writes are restricted by the existing
-- users-table ownership/admin RLS policies and column-level grants.
alter table public.users
    add column if not exists channel_theme text not null default 'emerald';
alter table public.users
    drop constraint if exists users_channel_theme_check;
alter table public.users
    add constraint users_channel_theme_check
    check (channel_theme in ('emerald','ocean','sunset','violet','slate'));
grant select (channel_theme) on public.users to anon, authenticated;
grant update (channel_theme) on public.users to authenticated;

-- Aggregate-only weekly creator rankings. No viewer IDs are returned.
create or replace function public.gocat_weekly_creator_leaderboard()
returns table (
    user_id text,
    username text,
    avatar_path text,
    weekly_views bigint,
    active_videos bigint
)
language sql
stable
security definer
set search_path = ''
as $$
    select u.id, u.username, u.avatar_path,
           count(*)::bigint as weekly_views,
           count(distinct v.id)::bigint as active_videos
    from public.video_views vv
    join public.videos v on v.id = vv.video_id
    join public.users u on u.id = v.owner_id
    where vv.created_at >= pg_catalog.now() - interval '7 days'
      and coalesce(u.is_banned, false) = false
    group by u.id, u.username, u.avatar_path
    order by count(*) desc, max(vv.created_at) desc, u.username asc
    limit 10;
$$;
revoke all on function public.gocat_weekly_creator_leaderboard() from public;
grant execute on function public.gocat_weekly_creator_leaderboard() to anon, authenticated;
