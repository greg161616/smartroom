import React,{useEffect,useState,useCallback,useMemo} from 'react';
import {useFocusEffect} from 'expo-router';
import type {Mutate} from '../contexts/DeviceContext';
import {Alert,View,StyleSheet,AppState} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import * as api from '../lib/api';
import type {Snapshot} from '../lib/api';
import type {Schedule,ScheduleKind} from '../lib/types';
import {kindName,manilaDateTime,parseManila,remaining,scheduleStatus,validTime,displayTime12,displayDate,displayManila,durationText} from '../lib/automation';
import {useTheme,Txt,Card,Button,styles} from './ui';

import {SchedulePickers} from './SchedulePickers';
import {CountdownPicker} from './CountdownPicker';

type Preset='custom'|'bedtime'|'morning'|'countdown';
const labels={custom:'Schedule',bedtime:'Bedtime',morning:'Morning',countdown:'Countdown'};
function SchedulesContent({data,busy,mutate,now,preset,seed}:{data:Snapshot;busy:boolean;mutate:Mutate;now:number;preset?:string;seed?:string}){
 const t=useTheme();
 const [selection,setSelection]=useState<Preset>('custom');
 const [kind,setKind]=useState<ScheduleKind>('once');
 const [channel,setChannel]=useState(0),[state,setState]=useState(false);
 const [when,setWhen]=useState(()=>manilaDateTime(Date.now()+3600000)),[time,setTime]=useState('22:00'),[minutes,setMinutes]=useState(30);
 const date=when.slice(0,10),onceTime=when.slice(11);
 const selectedTime=kind==='once'?onceTime:time;
 const [clock,setClock]=useState(Date.now());
 const hasCountdown=data.schedules.some(s=>s.enabled&&s.kind==='countdown'&&Date.parse(s.run_at)>now);
 useFocusEffect(useCallback(()=>{
  let id:ReturnType<typeof setInterval>|null=null;
  const sync=(state:string)=>{if(id!==null){clearInterval(id);id=null;}setClock(Date.now());if(state==='active'&&hasCountdown)id=setInterval(()=>setClock(Date.now()),1000);};
  sync(AppState.currentState??'active');const sub=AppState.addEventListener('change',sync);
  return()=>{sub.remove();if(id!==null)clearInterval(id);};
 },[hasCountdown]));
 const displayClock=Math.max(clock,now);
 function applyPreset(p:Preset){setSelection(p);setChannel(0);setState(p==='morning');setKind(p==='countdown'?'countdown':p==='custom'?'once':'daily');if(p==='bedtime')setTime('22:00');if(p==='morning')setTime('06:00');if(p==='countdown')setMinutes(30);if(p==='custom')setWhen(manilaDateTime(Date.now()+3600000));}
 useEffect(()=>{if(preset==='bedtime'||preset==='morning'||preset==='countdown')applyPreset(preset);},[preset,seed]);
 function save(){
  const iso=kind==='once'?parseManila(when):null;const mins=minutes;
  if(kind==='once'&&(!iso||Date.parse(iso)<=Date.now())){Alert.alert('Invalid date','Select a future Philippine date and time.');return;}
  if(kind==='daily'&&!validTime(time.trim())){Alert.alert('Invalid time','Select a valid time using the clock picker.');return;}
  if(kind==='countdown'&&(!Number.isInteger(mins)||mins<1||mins>1440)){Alert.alert('Invalid countdown','Choose 1 to 1440 minutes.');return;}
  const label=selection==='custom'?(kind==='countdown'?'Countdown':'Schedule'):labels[selection];
  void mutate(async()=>{await api.createAutomation({device:data.device.id,channel,state,kind,runAt:iso,time:kind==='daily'?time.trim():null,minutes:kind==='countdown'?mins:null,label});Alert.alert('Saved','Automation saved to your room. The controller must be connected when it is due.');},['schedules']);
 }
 const groups=useMemo(()=>Array.from(data.schedules.reduce((map,s)=>{const list=map.get(s.batch_id)??[];list.push(s);map.set(s.batch_id,list);return map;},new Map<string,Schedule[]>()).values()).sort((a,b)=>Number(b.some(x=>x.enabled))-Number(a.some(x=>x.enabled))||(a.some(x=>x.enabled)?Date.parse(a[0].run_at)-Date.parse(b[0].run_at):Date.parse(b[0].run_at)-Date.parse(a[0].run_at))),[data.schedules]);
 const active=groups.filter(g=>g.some(s=>s.enabled)).length;
 return <>
  <Card>
   <View style={styles.row}><Ionicons name="flash-outline" size={26} color={t.accent}/><View style={{flex:1}}><Txt big>Automations</Txt><Txt muted>{active} active · Philippine time (UTC+8)</Txt></View></View>
   <Txt muted>Schedules run on controller sync, even when the app is closed. A run more than 60 seconds overdue is missed. Presence mode skips scheduled commands.</Txt>
   {data.settings.gesture_enabled&&data.settings.mode==='presence'?<Txt color={t.warn}>Switch to wave or toggle mode for scheduled switching.</Txt>:null}
  </Card>
  <Txt muted>QUICK PRESETS</Txt>
  <View style={styles.row}>
   {([{key:'bedtime',icon:'moon-outline',title:'Bedtime',sub:'10 PM · off'},{key:'morning',icon:'sunny-outline',title:'Morning',sub:'6 AM · on'}] as const).map(p=><View key={p.key} style={{flex:1}}><Card><Ionicons name={p.icon} size={24} color={t.accent}/><Txt>{p.title}</Txt><Txt muted>{p.sub}</Txt><Button label="Configure" secondary={selection!==p.key} disabled={busy} onPress={()=>applyPreset(p.key)}/></Card></View>)}
  </View>
  <Card>
   <Txt big>{selection==='custom'?'New automation':labels[selection]}</Txt>
   <View style={styles.row}><View style={{flex:1}}><Button label="Custom" secondary={selection!=='custom'} disabled={busy} onPress={()=>applyPreset('custom')}/></View><View style={{flex:1}}><Button label="Countdown" secondary={selection!=='countdown'} disabled={busy} onPress={()=>applyPreset('countdown')}/></View></View>
   <Txt muted>REPEAT</Txt>
   <View style={styles.row}>{(['once','daily','countdown'] as const).map(k=><View key={k} style={{flex:1}}><Button label={kindName(k)} secondary={kind!==k} disabled={busy} onPress={()=>{setKind(k);setSelection('custom');}}/></View>)}</View>
   <Txt muted>LIGHTS</Txt>
   <View style={styles.row}>{[{channel:0,name:'Both'},...data.relays].map(r=><View key={r.channel} style={{flex:1}}><Button label={r.name} secondary={channel!==r.channel} disabled={busy} onPress={()=>setChannel(r.channel)}/></View>)}</View>
   <Txt muted>ACTION</Txt>
   <View style={styles.row}><View style={{flex:1}}><Button label="Turn on" secondary={!state} disabled={busy} onPress={()=>{setState(true);if(selection==='bedtime')setSelection('custom');}}/></View><View style={{flex:1}}><Button label="Turn off" secondary={state} disabled={busy} onPress={()=>{setState(false);if(selection==='morning')setSelection('custom');}}/></View></View>
   {kind==='countdown'?<CountdownPicker value={minutes} onChange={setMinutes} disabled={busy}/>:<SchedulePickers date={date} time={selectedTime} showDate={kind==='once'} disabled={busy} onDate={d=>setWhen(old=>`${d} ${old.slice(11)}`)} onTime={v=>{if(kind==='once')setWhen(old=>`${old.slice(0,10)} ${v}`);else setTime(v);}}/>}
   <View style={[local.summary,{backgroundColor:t.soft,borderColor:t.line}]}>
    <Txt muted>PREVIEW</Txt>
    <View style={styles.row}><Ionicons name={state?'bulb-outline':'moon-outline'} color={t.accent} size={24}/><View style={{flex:1,gap:3}}><Txt>{channel===0?'Both lights':data.relays.find(r=>r.channel===channel)?.name??'Light'} · Turn {state?'ON':'OFF'}</Txt><Txt muted>{kind==='countdown'?`After ${durationText(minutes)}`:kind==='daily'?`Every day at ${displayTime12(time)} PHT`:`${displayDate(date)} at ${displayTime12(onceTime)} PHT`}</Txt></View></View>
   </View>
   <Button label={kind==='countdown'?'Start countdown':'Save automation'} disabled={busy} onPress={save}/>
  </Card>
  <Txt muted>SAVED AUTOMATIONS</Txt>
  {groups.length===0?<Card><Txt muted>No automations yet. Create your first one above.</Txt></Card>:null}
  {groups.map(group=>{const s=group[0],enabled=group.some(x=>x.enabled),due=Date.parse(s.run_at),overdue=enabled&&due<=displayClock,canEnable=s.kind==='daily'||group.every(x=>!x.last_run_at&&Date.parse(x.run_at)>displayClock);const names=group.map(x=>data.relays.find(r=>r.id===x.relay_id)?.name??'Light').join(' + ');return <Card key={s.batch_id}>
   <View style={styles.row}><Ionicons name={s.kind==='countdown'?'timer-outline':s.kind==='daily'?'repeat-outline':'calendar-outline'} color={t.accent} size={24}/><View style={{flex:1}}><Txt>{s.label}</Txt><Txt muted>{kindName(s.kind)} · {names} · {s.desired_state?'ON':'OFF'}</Txt></View><Txt color={enabled?t.good:t.muted}>{enabled?(overdue?'Due':'Active'):'Inactive'}</Txt></View>
   <Txt big>{s.kind==='daily'?displayTime12(manilaDateTime(due).slice(11)):displayManila(due)}</Txt>
   {s.kind==='daily'?<Txt muted>Every day · PHT</Txt>:<Txt muted>Philippine time</Txt>}
   {s.kind==='countdown'&&enabled&&!overdue?<View style={[local.timer,{backgroundColor:t.soft}]}><Txt big color={t.accent}>{remaining(due-displayClock)}</Txt><Txt muted>Remaining (phone estimate)</Txt></View>:null}
   {overdue?<Txt color={t.warn}>{displayClock-due>60000?'Overdue · awaiting controller sync; old occurrences may be missed.':'Due · awaiting controller sync.'}</Txt>:null}
   {group.map(x=><Txt key={x.id} muted>{data.relays.find(r=>r.id===x.relay_id)?.name??'Light'}: {scheduleStatus(x,now)}</Txt>)}
   <View style={styles.row}><View style={{flex:1}}><Button label={enabled?'Pause':s.kind==='daily'?'Resume':'Enable'} secondary disabled={busy||(!enabled&&!canEnable)} onPress={()=>void mutate(()=>api.manageAutomation(s.batch_id,enabled?'disable':'enable'),['schedules'])}/></View><View style={{flex:1}}><Button label="Delete" secondary disabled={busy} onPress={()=>Alert.alert('Delete automation?','Future runs will be removed. Commands already sent to the controller are not undone.',[{text:'Cancel',style:'cancel'},{text:'Delete',style:'destructive',onPress:()=>void mutate(()=>api.manageAutomation(s.batch_id,'delete'),['schedules'])}])}/></View></View>
  </Card>;})}
 </>;
}
const local=StyleSheet.create({timer:{borderRadius:12,padding:12,alignItems:'center',gap:4},summary:{borderRadius:12,borderWidth:1,padding:12,gap:8}});

export const Schedules=React.memo(SchedulesContent,(a,b)=>a.data.device.id===b.data.device.id&&a.data.relays===b.data.relays&&a.data.settings===b.data.settings&&a.data.schedules===b.data.schedules&&a.busy===b.busy&&a.mutate===b.mutate&&a.now===b.now&&a.preset===b.preset&&a.seed===b.seed);
