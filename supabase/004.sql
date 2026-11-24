begin;
-- Additive migration: run after 001, 002 and 003. Existing app and v3 RPC remain valid.
alter table public.activity_logs add column if not exists offline_event_id text;
create unique index if not exists smartroom_offline_event_once
 on public.activity_logs(device_id,offline_event_id);

create or replace function public.smartroom_device_sync_v4(
 p_device uuid,p_token text,p_state1 boolean,p_state2 boolean,p_ack uuid[],p_reset boolean,p_events jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; e jsonb; event_id text; ch integer; ts bigint; event_time timestamptz; stamp timestamptz; acks jsonb:='[]'::jsonb; msg text;
begin
 if p_events is null or jsonb_typeof(p_events)<>'array' then
   raise exception 'Invalid events' using errcode='22023';
 end if;
 if jsonb_array_length(p_events)>8 then raise exception 'Too many events' using errcode='22023'; end if;
 -- v3 authenticates, serializes per device, reports current state and handles stale commands.
 -- All changes below are part of the same transaction; any failure rolls back the sync.
 result:=public.smartroom_device_sync(p_device,p_token,p_state1,p_state2,p_ack,p_reset);
 stamp:=clock_timestamp();
 for e in select value from jsonb_array_elements(p_events) loop
   if jsonb_typeof(e) is distinct from 'object' or
      jsonb_typeof(e->'id') is distinct from 'string' or coalesce(e->>'id','') !~ '^[0-9a-f]{32}$' or
      jsonb_typeof(e->'channel') is distinct from 'number' or coalesce(e->>'channel','') not in ('1','2') or
      jsonb_typeof(e->'state') is distinct from 'boolean' or
      jsonb_typeof(e->'epoch') is distinct from 'number' or coalesce(e->>'epoch','') !~ '^[0-9]{1,10}$' then
     raise exception 'Invalid offline event' using errcode='22023';
   end if;
   event_id:=e->>'id'; ch:=(e->>'channel')::int; ts:=(e->>'epoch')::bigint;
   if ts>4102444800 then raise exception 'Invalid event time' using errcode='22023'; end if;
   msg:='Offline relay '||ch::text||' output '||case when (e->>'state')::boolean then 'ON' else 'OFF' end;
   if ts>=1700000000 and ts<=extract(epoch from stamp)+60 then
      event_time:=least(to_timestamp(ts::double precision),stamp);
      msg:=msg||' (synced later)';
   else
      event_time:=stamp;msg:=msg||' (event time unknown; upload time shown)';
   end if;
   insert into public.activity_logs(device_id,message,created_at,offline_event_id)
     values(p_device,msg,event_time,event_id)
     on conflict(device_id,offline_event_id) do nothing;
   acks:=acks||jsonb_build_array(event_id);
 end loop;
 return result||jsonb_build_object('event_acks',acks);
end $$;
revoke all on function public.smartroom_device_sync_v4(uuid,text,boolean,boolean,uuid[],boolean,jsonb) from public,anon,authenticated;
grant execute on function public.smartroom_device_sync_v4(uuid,text,boolean,boolean,uuid[],boolean,jsonb) to service_role;
commit;
