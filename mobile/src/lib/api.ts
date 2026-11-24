import {supabase} from './supabase';
import type {Device,Relay,Settings,Command,Schedule,Log,Room} from './types';
function unwrap<T>(r:{data:T|null;error:{message:string}|null}):T {if(r.error)throw Error(r.error.message);if(r.data===null)throw Error('No data returned');return r.data;}
export async function setup(){return unwrap(await supabase.rpc('setup_room')) as string;}
export async function fetchRoom(id:string){
 const room=unwrap(await supabase.from('rooms').select('id,name').eq('id',id).single()) as Room;
 const device=unwrap(await supabase.from('devices').select('id,name,last_seen').eq('room_id',id).order('id').limit(1).single()) as Device;
 const [r,s,l]=await Promise.all([supabase.from('relays').select('*').eq('device_id',device.id).order('channel'),supabase.from('device_settings').select('*').eq('device_id',device.id).single(),supabase.from('activity_logs').select('*').eq('device_id',device.id).order('created_at',{ascending:false}).limit(100)]);
 const relays=unwrap(r) as Relay[], settings=unwrap(s) as Settings, logs=unwrap(l) as Log[];
 const ids=relays.map(x=>x.id);
 const [c,q]=await Promise.all([supabase.from('device_commands').select('*').in('relay_id',ids).order('created_at',{ascending:false}).limit(100),supabase.from('schedules').select('*').in('relay_id',ids).order('run_at').limit(200)]);
 return {room,device,relays,settings,logs,commands:unwrap(c) as Command[],schedules:unwrap(q) as Schedule[]};
}
export type Snapshot=Awaited<ReturnType<typeof fetchRoom>>;
export async function requestLights(id:string,channel:number,state:boolean){unwrap(await supabase.rpc('request_lights',{p_device:id,p_channel:channel,p_state:state}));}
export async function saveSettings(id:string,patch:Partial<Omit<Settings,'device_id'>>){unwrap(await supabase.from('device_settings').update(patch).eq('device_id',id).select().single());}
export async function addSchedule(relay_id:string,desired_state:boolean,run_at:string){unwrap(await supabase.from('schedules').insert({relay_id,desired_state,run_at,enabled:true}).select().single());}
export async function toggleSchedule(id:string,enabled:boolean){unwrap(await supabase.from('schedules').update({enabled}).eq('id',id).select().single());}
export async function removeSchedule(id:string){unwrap(await supabase.from('schedules').delete().eq('id',id).select().single());}
