begin;
create table public.profiles(id uuid primary key references auth.users on delete cascade, display_name text not null default '');
create table public.rooms(id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null);
create table public.devices(id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms on delete cascade, name text not null, last_seen timestamptz);
create table public.relays(id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices on delete cascade, channel int not null check(channel in (1,2)), name text not null, actual_state boolean, updated_at timestamptz, unique(device_id,channel));
create table public.device_settings(device_id uuid primary key references public.devices on delete cascade, gesture_enabled boolean not null default true, mode text not null default 'wave' check(mode in ('wave','presence','toggle')), distance_cm int not null default 15 check(distance_cm between 2 and 100), hold_ms int not null default 3000 check(hold_ms between 500 and 10000));
create table public.device_commands(id uuid primary key default gen_random_uuid(), relay_id uuid not null references public.relays on delete cascade, desired_state boolean not null, status text not null default 'pending' check(status in ('pending','applied','failed','expired')), created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '30 seconds'));
create table public.schedules(id uuid primary key default gen_random_uuid(), relay_id uuid not null references public.relays on delete cascade, desired_state boolean not null, run_at timestamptz not null, enabled boolean not null default true);
create table public.activity_logs(id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices on delete cascade, message text not null, created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade, message text not null, created_at timestamptz not null default now());
-- Explicit privileges: clients cannot report physical states or device heartbeats.
do $$ declare t text; begin foreach t in array array['profiles','rooms','devices','relays','device_settings','device_commands','schedules','activity_logs','notifications'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant select on public.%I to authenticated',t); end loop; end $$;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy own_room on public.rooms for select to authenticated using(owner_id=auth.uid());
create policy own_device on public.devices for select to authenticated using(exists(select 1 from public.rooms r where r.id=room_id and r.owner_id=auth.uid()));
create policy own_relay on public.relays for select to authenticated using(exists(select 1 from public.devices d where d.id=device_id));
create policy own_settings on public.device_settings for select to authenticated using(exists(select 1 from public.devices d where d.id=device_id));
create policy own_commands on public.device_commands for select to authenticated using(exists(select 1 from public.relays r where r.id=relay_id));
create policy own_schedules on public.schedules for select to authenticated using(exists(select 1 from public.relays r where r.id=relay_id));
create policy own_logs on public.activity_logs for select to authenticated using(exists(select 1 from public.devices d where d.id=device_id));
create policy own_notifications on public.notifications for select to authenticated using(owner_id=auth.uid());
grant update(gesture_enabled,mode,distance_cm,hold_ms) on public.device_settings to authenticated;
create policy edit_settings on public.device_settings for update to authenticated using(exists(select 1 from public.devices d where d.id=device_id)) with check(exists(select 1 from public.devices d where d.id=device_id));
create function public.setup_room() returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); r uuid; d uuid; begin
if u is null then raise exception 'Login required'; end if;
perform pg_advisory_xact_lock(hashtextextended(u::text,0));
insert into public.profiles(id) values(u) on conflict do nothing;
select id into r from public.rooms where owner_id=u order by id limit 1;
if r is null then
insert into public.rooms(owner_id,name) values(u,'My Room') returning id into r;
insert into public.devices(room_id,name) values(r,'ESP8266') returning id into d;
insert into public.relays(device_id,channel,name) values(d,1,'Light 1'),(d,2,'Light 2');
insert into public.device_settings(device_id) values(d);
end if; return r; end $$;
revoke all on function public.setup_room() from public,anon,authenticated;
grant execute on function public.setup_room() to authenticated;
commit;
