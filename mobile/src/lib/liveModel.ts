import type {Snapshot} from './api';
import type {Command,Device,Relay} from './types';
export const SECTIONS=['relays','settings','commands','schedules','logs'] as const;
export type Section=typeof SECTIONS[number];
export type LiveSignal={device_id:string;device_name:string;last_seen:string|null;revision:number;relays_rev:number;settings_rev:number;commands_rev:number;schedules_rev:number;logs_rev:number};
export const HEARTBEAT_MS=25000;
export function parseSignal(value:unknown):LiveSignal {
 if(!value||typeof value!=='object')throw Error('Invalid live signal');
 const row=value as Record<string,unknown>;
 if(typeof row.device_id!=='string'||typeof row.device_name!=='string'||!(row.last_seen===null||(typeof row.last_seen==='string'&&Number.isFinite(Date.parse(row.last_seen)))))throw Error('Invalid live device');
 const out={device_id:row.device_id,device_name:row.device_name,last_seen:row.last_seen} as LiveSignal;
 for(const key of ['revision',...SECTIONS.map(s=>`${s}_rev`)] as (keyof LiveSignal)[]){
  const raw=row[key];const n=typeof raw==='number'||typeof raw==='string'&&/^\d+$/.test(raw)?Number(raw):NaN;
  if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid live revision');
  (out as unknown as Record<string,unknown>)[key]=n;
 }
 return out;
}
export function changedSections(previous:LiveSignal|null,next:LiveSignal):Section[]{
 if(!previous)return [...SECTIONS];
 if(next.revision<=previous.revision)return [];
 const changed=SECTIONS.filter(s=>next[`${s}_rev`]!==previous[`${s}_rev`]);
 if(changed.includes('commands')&&!changed.includes('schedules'))changed.push('schedules'); // joined last_command status
 return changed;
}
export function mergeDevice(device:Device,signal:LiveSignal):Device {
 return device.id===signal.device_id&&(device.last_seen!==signal.last_seen||device.name!==signal.device_name)?{...device,name:signal.device_name,last_seen:signal.last_seen}:device;
}
export function isDeviceOnline(lastSeen:string|null|undefined,now:number){
 const stamp=lastSeen?Date.parse(lastSeen):NaN;
 return Number.isFinite(stamp)&&now-stamp<HEARTBEAT_MS;
}
const equal=(a:unknown,b:unknown)=>a===b||JSON.stringify(a)===JSON.stringify(b);
function shareRows<T extends {id:string}>(old:T[],next:T[],same:(a:T,b:T)=>boolean=equal):T[]{
 const map=new Map(old.map(x=>[x.id,x]));
 const shared=next.map(x=>{const prev=map.get(x.id);return prev&&same(prev,x)?prev:x;});
 return old.length===shared.length&&old.every((x,i)=>x===shared[i])?old:shared;
}
function sameRelay(a:Relay,b:Relay){return a.id===b.id&&a.device_id===b.device_id&&a.name===b.name&&a.channel===b.channel&&a.actual_state===b.actual_state;}
// Retain references when UI-relevant fields have not changed. Relay updated_at is a
// report timestamp, not a transition timestamp; it is intentionally not a UI dependency.
export function mergeSnapshot(old:Snapshot|null,patch:Partial<Snapshot>):Snapshot {
 if(!old)return patch as Snapshot;
 const result={...old,...patch};
 if(patch.room&&equal(old.room,patch.room))result.room=old.room;
 if(patch.device&&equal(old.device,patch.device))result.device=old.device;
 if(patch.settings&&equal(old.settings,patch.settings))result.settings=old.settings;
 if(patch.relays)result.relays=shareRows(old.relays,patch.relays,sameRelay);
 if(patch.commands)result.commands=shareRows(old.commands,patch.commands);
 if(patch.schedules)result.schedules=shareRows(old.schedules,patch.schedules);
 if(patch.logs)result.logs=shareRows(old.logs,patch.logs);
 return Object.keys(result).every(k=>result[k as keyof Snapshot]===old[k as keyof Snapshot])?old:result;
}
export function commandText(command:Command|undefined,now:number){
 if(!command)return '';
 return `Request ${command.desired_state?'ON':'OFF'} · ${command.status==='pending'&&Date.parse(command.expires_at)<=now?'expired (local estimate)':command.status}`;
}
// No clock polling: a timeout is needed only at a visible deadline.
export function nextDeadline(snapshot:Snapshot|null,now:number):number|null{
 if(!snapshot)return null;
 const deadlines:number[]=[];
 if(snapshot.device.last_seen)deadlines.push(Date.parse(snapshot.device.last_seen)+HEARTBEAT_MS);
 for(const c of snapshot.commands)if(c.status==='pending')deadlines.push(Date.parse(c.expires_at));
 for(const s of snapshot.schedules){
  if(s.enabled){const due=Date.parse(s.run_at);deadlines.push(due,due+60001);}
  if(s.last_command?.status==='pending')deadlines.push(Date.parse(s.last_command.expires_at));
 }
 const future=deadlines.filter(x=>Number.isFinite(x)&&x>now);
 return future.length?Math.min(...future):null;
}
