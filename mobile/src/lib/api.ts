import {supabase} from './supabase';
import type {Device,Relay,Settings,Command,Schedule,ScheduleKind,Log,Room} from './types';
import {parseSignal,type Section} from './liveModel';
function unwrap<T>(r:{data:T|null;error:{message:string}|null}):T {if(r.error)throw Error(r.error.message);if(r.data===null)throw Error('No data returned');return r.data;}
export async function setup(){return unwrap(await supabase.rpc('setup_room')) as string;}
export async function discover(){const roomId=await setup();const device=unwrap(await supabase.from('devices').select('id').eq('room_id',roomId).order('id').limit(1).single());return {roomId,deviceId:device.id as string};}
export type Snapshot={room:Room;device:Device;relays:Relay[];settings:Settings;logs:Log[];commands:Command[];schedules:Schedule[]};
export async function saveRoomNames(roomId:string,roomName:string|null,lightNames:Record<string,string>){
 const {error}=await supabase.rpc('save_room_names',{p_room:roomId,p_room_name:roomName,p_light_names:lightNames});
 if(error)throw Error(error.message);
}
const readRelays=async(id:string)=>unwrap(await supabase.from('relays').select('*').eq('device_id',id).order('channel')) as Relay[];
const readSettings=async(id:string)=>unwrap(await supabase.from('device_settings').select('*').eq('device_id',id).single()) as Settings;
const readLogs=async(id:string)=>unwrap(await supabase.from('activity_logs').select('*').eq('device_id',id).order('created_at',{ascending:false}).limit(100)) as Log[];
const readCommands=async(ids:string[])=>ids.length?unwrap(await supabase.from('device_commands').select('*').in('relay_id',ids).order('created_at',{ascending:false}).limit(100)) as Command[]:[];
const readSchedules=async(ids:string[])=>ids.length?unwrap(await supabase.from('schedules').select('*,last_command:device_commands!smartroom_schedule_last_command_fk(status,expires_at)').in('relay_id',ids).order('enabled',{ascending:false}).order('run_at',{ascending:false}).limit(200)) as Schedule[]:[];
export async function fetchRoom(roomId:string,deviceId:string):Promise<Snapshot>{
 const [room,device,relays,settings,logs]=await Promise.all([
  supabase.from('rooms').select('id,name').eq('id',roomId).single().then(r=>unwrap(r) as Room),
  supabase.from('devices').select('id,name,last_seen').eq('id',deviceId).eq('room_id',roomId).single().then(r=>unwrap(r) as Device),
  readRelays(deviceId),readSettings(deviceId),readLogs(deviceId)]);
 const ids=relays.map(r=>r.id);const [commands,schedules]=await Promise.all([readCommands(ids),readSchedules(ids)]);
 return {room,device,relays,settings,logs,commands,schedules};
}
export async function fetchLive(id:string){return parseSignal(unwrap(await supabase.from('smartroom_live').select('*').eq('device_id',id).single()));}
export async function fetchParts(current:Snapshot,sections:Section[]):Promise<Partial<Snapshot>>{
 const dirty=new Set(sections);const result:Partial<Snapshot>={};const id=current.device.id;
 const relays=dirty.has('relays')?await readRelays(id):current.relays;
 if(dirty.has('relays'))result.relays=relays;
 const ids=relays.map(r=>r.id);
 if(ids.join(',')!==current.relays.map(r=>r.id).join(',')){dirty.add('commands');dirty.add('schedules');}
 if(dirty.has('commands'))dirty.add('schedules');
 const jobs:Promise<void>[]=[];
 if(dirty.has('settings'))jobs.push(readSettings(id).then(x=>{result.settings=x;}));
 if(dirty.has('logs'))jobs.push(readLogs(id).then(x=>{result.logs=x;}));
 if(dirty.has('commands'))jobs.push(readCommands(ids).then(x=>{result.commands=x;}));
 if(dirty.has('schedules'))jobs.push(readSchedules(ids).then(x=>{result.schedules=x;}));
 await Promise.all(jobs);return result;
}
export async function requestLights(id:string,channel:number,state:boolean){unwrap(await supabase.rpc('request_lights',{p_device:id,p_channel:channel,p_state:state}));}
export async function saveSettings(id:string,patch:Partial<Omit<Settings,'device_id'>>){unwrap(await supabase.from('device_settings').update(patch).eq('device_id',id).select().single());}
export type AutomationInput={device:string;channel:number;state:boolean;kind:ScheduleKind;runAt:string|null;time:string|null;minutes:number|null;label:string};
export async function createAutomation(a:AutomationInput){return unwrap(await supabase.rpc('smartroom_create_automation',{p_device:a.device,p_channel:a.channel,p_state:a.state,p_kind:a.kind,p_run_at:a.runAt,p_time:a.time,p_minutes:a.minutes,p_label:a.label}));}
export async function manageAutomation(batch:string,action:'enable'|'disable'|'delete'){return unwrap(await supabase.rpc('smartroom_manage_automation',{p_batch:batch,p_action:action}));}
