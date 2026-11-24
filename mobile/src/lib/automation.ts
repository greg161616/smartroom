import type {Schedule, ScheduleKind} from './types';
export const MANILA_OFFSET_MS=8*60*60*1000;
export const validTime=(s:string)=>/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s);
const two=(n:number)=>String(n).padStart(2,'0');
export function manilaDateTime(ms:number){const d=new Date(ms+MANILA_OFFSET_MS);return `${d.getUTCFullYear()}-${two(d.getUTCMonth()+1)}-${two(d.getUTCDate())} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;}
export function parseManila(value:string):string|null{
 const s=value.trim();if(!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s))return null;
 const ms=Date.parse(s.replace(' ','T')+':00+08:00');
 return Number.isFinite(ms)&&manilaDateTime(ms)===s?new Date(ms).toISOString():null;
}
export const kindName=(kind:ScheduleKind)=>kind==='daily'?'Daily':kind==='countdown'?'Countdown':'One-time';
export function remaining(ms:number){const seconds=Math.max(0,Math.ceil(ms/1000));return `${two(Math.floor(seconds/3600))}:${two(Math.floor(seconds%3600/60))}:${two(seconds%60)}`;}
export function scheduleStatus(s:Schedule,now:number){
 if(s.last_outcome==='queued'){
  const c=s.last_command;
  if(c?.status==='applied')return 'Applied by controller';
  if(c?.status==='expired'||(c?.status==='pending'&&Date.parse(c.expires_at)<=now))return 'Command expired / unconfirmed';
  if(c?.status==='failed')return 'Command failed';
  return c?.status==='pending'?'Queued · awaiting confirmation':'Queued · confirmation unavailable';
 }
 if(s.last_outcome==='missed')return 'Missed · outside execution window';
 if(s.last_outcome==='busy')return 'Skipped · another command had priority';
 if(s.last_outcome==='presence')return 'Skipped · presence mode active';
 return 'Not executed yet';
}

// Presentation helpers: all calendar values are explicitly in Asia/Manila.
export const MANILA_ZONE = 'Asia/Manila';
export function displayTime12(time:string){
 if(!validTime(time)) return '—';
 const [hour,minute]=time.split(':').map(Number);
 return `${hour%12||12}:${two(minute)} ${hour<12?'AM':'PM'}`;
}
export function displayDate(date:string){
 const iso=parseManila(`${date} 00:00`);
 if(!iso) return '—';
 const d=new Date(Date.parse(iso)+MANILA_OFFSET_MS);
 const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
 return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
export function displayManila(ms:number){
 if(!Number.isFinite(ms)) return '—';
 const value=manilaDateTime(ms);
 return `${displayDate(value.slice(0,10))} · ${displayTime12(value.slice(11))}`;
}
export function pickerValue(date:string,time:string){
 const iso=parseManila(`${date} ${time}`);
 if(!iso) throw new Error('Invalid Philippine date or time');
 return new Date(iso);
}
export function pickerSelection(date:Date){
 const value=manilaDateTime(date.getTime());
 return {date:value.slice(0,10),time:value.slice(11)};
}
export function clampMinutes(value:number){
 return Number.isFinite(value)?Math.max(1,Math.min(1440,Math.round(value))):30;
}
export function durationText(value:number){
 const minutes=clampMinutes(value),hours=Math.floor(minutes/60),rest=minutes%60;
 return hours ? `${hours} hr${rest?` ${rest} min`:''}` : `${rest} min`;
}
