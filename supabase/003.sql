begin;
-- Requires Phase 1 (001.sql) and Phase 2 (002.sql).
-- Credential hashes are inaccessible to mobile users and the REST public roles.
create schema if not exists smartroom_private;
revoke all on schema smartroom_private from public, anon, authenticated;
create table if not exists smartroom_private.device_keys (
 device_id uuid primary key references public.devices(id) on delete cascade,
 token_hash bytea not null,
 rotated_at timestamptz not null default now()
);
revoke all on smartroom_private.device_keys from public, anon, authenticated;

-- Run from SQL Editor as postgres; returns a new token ONCE. Rotation invalidates old token.
create or replace function public.smartroom_issue_device_token(p_device uuid)
returns text language plpgsql security definer set search_path='' as $$
declare tok text := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
begin
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 insert into smartroom_private.device_keys(device_id,token_hash) values(p_device,sha256(convert_to(tok,'UTF8')))
 on conflict(device_id) do update set token_hash=excluded.token_hash,rotated_at=now();
 update public.devices set last_seen=null where id=p_device;
 update public.device_commands c set status='expired' from public.relays r where c.relay_id=r.id and r.device_id=p_device and c.status='pending';
 return tok;
end $$;
revoke all on function public.smartroom_issue_device_token(uuid) from public,anon,authenticated,service_role;

-- One atomic sync: authenticate device, confirm previous commands, report outputs,
-- discard stale commands and return latest valid command per channel.
create or replace function public.smartroom_device_sync(p_device uuid,p_token text,p_state1 boolean,p_state2 boolean,p_ack uuid[],p_reset boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prev_seen timestamptz; rr record; state_now boolean; settings jsonb; cmds jsonb; stamp timestamptz; 
begin
 if p_device is null or p_token is null or length(p_token)<>64 or p_state1 is null or p_state2 is null or p_reset is null or p_ack is null or cardinality(p_ack)>2 then raise exception 'Invalid sync' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 if not exists(select 1 from smartroom_private.device_keys k where k.device_id=p_device and k.token_hash=sha256(convert_to(p_token,'UTF8'))) then
   raise exception 'Device authentication failed' using errcode='28000';
 end if;
 stamp:=clock_timestamp();
 select last_seen into prev_seen from public.devices where id=p_device;
 -- Acknowledge before expiring; retries are harmless. IDs are scoped to this device.
 update public.device_commands c set status='applied' from public.relays r
 where c.relay_id=r.id and r.device_id=p_device and c.id=any(p_ack) and c.status='pending';
 update public.device_commands c set status='expired' from public.relays r
 where c.relay_id=r.id and r.device_id=p_device and c.status='pending'
 and (c.expires_at<=stamp or p_reset or prev_seen is null or prev_seen<stamp-interval '25 seconds');
 -- Keep only latest outstanding request per relay; older requests must never undo it.
 with ranked as (select c.id,row_number() over(partition by c.relay_id order by c.created_at desc,c.id desc) as n
 from public.device_commands c join public.relays r on r.id=c.relay_id where r.device_id=p_device and c.status='pending')
 update public.device_commands c set status='expired' from ranked x where c.id=x.id and x.n>1;
 for rr in select id,channel,name,actual_state from public.relays where device_id=p_device loop
   state_now:=case when rr.channel=1 then p_state1 else p_state2 end;
   if rr.actual_state is distinct from state_now then
     insert into public.activity_logs(device_id,message) values(p_device,rr.name||' output reported '||case when state_now then 'ON' else 'OFF' end);
   end if;
   update public.relays set actual_state=state_now,updated_at=stamp where id=rr.id;
 end loop;
 if p_reset or prev_seen is null or prev_seen<stamp-interval '25 seconds' then
   insert into public.activity_logs(device_id,message) values(p_device,'Controller connected / resynchronized');
 end if;
 update public.devices set last_seen=stamp where id=p_device;
 select to_jsonb(s)-'device_id' into settings from public.device_settings s where s.device_id=p_device;
 if settings is null then raise exception 'Device settings missing'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'channel',r.channel,'state',c.desired_state,'ttl_ms',greatest(0,floor(extract(epoch from (c.expires_at-clock_timestamp()))*1000)::int)) order by r.channel),'[]'::jsonb)
 into cmds from public.device_commands c join public.relays r on r.id=c.relay_id where r.device_id=p_device and c.status='pending' and c.expires_at>clock_timestamp();
 return jsonb_build_object('settings',settings,'commands',cmds);
end $$;
revoke all on function public.smartroom_device_sync(uuid,text,boolean,boolean,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.smartroom_device_sync(uuid,text,boolean,boolean,uuid[],boolean) to service_role;

-- Align Phase 2 command submission with the 25-second heartbeat window.
create or replace function public.request_lights(p_device uuid,p_channel integer,p_state boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare n integer; seen timestamptz;
begin
 if auth.uid() is null or p_state is null or p_channel is null or p_channel not in (0,1,2) then raise exception 'Invalid request'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_device::text,0));
 select d.last_seen into seen from public.devices d join public.rooms r on r.id=d.room_id where d.id=p_device and r.owner_id=auth.uid();
 if not found then raise exception 'Device not found'; end if;
 if seen is null or seen<clock_timestamp()-interval '25 seconds' then raise exception 'Controller is offline'; end if;
 -- Latest request wins. Commands are absolute ON/OFF, not toggle.
 update public.device_commands c set status='expired' from public.relays r where c.relay_id=r.id and r.device_id=p_device and (p_channel=0 or r.channel=p_channel) and c.status='pending';
 insert into public.device_commands(relay_id,desired_state,created_at,expires_at)
 select id,p_state,clock_timestamp(),clock_timestamp()+interval '30 seconds' from public.relays where device_id=p_device and (p_channel=0 or channel=p_channel);
 get diagnostics n=row_count;
 if n<>(case when p_channel=0 then 2 else 1 end) then raise exception 'Relay configuration incomplete'; end if;
 return n;
end $$;
revoke all on function public.request_lights(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.request_lights(uuid,integer,boolean) to authenticated;
commit;
