import React,{useCallback,useContext,useEffect,useMemo,useRef,useState,createContext} from 'react';
import {Alert,AppState} from 'react-native';
import * as api from '../lib/api';
import type {Snapshot} from '../lib/api';
import {supabase} from '../lib/supabase';
import {createLiveSync,type LiveState} from '../lib/liveSync';
import {isDeviceOnline,nextDeadline,SECTIONS,type Section} from '../lib/liveModel';
import {err} from '../components/ui';
let channelSequence=0;
export type Mutate=(fn:()=>Promise<unknown>,sections?:readonly Section[])=>Promise<void>;
function useController(){
 const [data,setData]=useState<Snapshot|null>(null);
 const [live,setLive]=useState<LiveState>({connection:'connecting',error:'',loading:true});
 const [busy,setBusy]=useState(false),[now,setNow]=useState(Date.now);
 const dataRef=useRef<Snapshot|null>(null),runtime=useRef<ReturnType<typeof createLiveSync>|null>(null),write=useRef(false);
 useEffect(()=>{
  const manager=createLiveSync({
   discover:api.discover,fetchLive:api.fetchLive,fetchRoom:api.fetchRoom,fetchParts:api.fetchParts,
   subscribe(id,onSignal,onStatus){
    // The filter restricts the device; RLS independently checks the signed-in owner.
    // Unique topic names prevent an old asynchronous channel removal affecting a new join.
    const channel=supabase.channel(`smartroom-live:${id}:${++channelSequence}`)
     .on('postgres_changes',{event:'UPDATE',schema:'public',table:'smartroom_live',filter:`device_id=eq.${id}`},payload=>onSignal(payload.new))
     .on('postgres_changes',{event:'INSERT',schema:'public',table:'smartroom_live',filter:`device_id=eq.${id}`},payload=>onSignal(payload.new))
     .subscribe(status=>onStatus(status));
    return ()=>{void supabase.removeChannel(channel).catch(()=>{});};
   },
   onSnapshot(snapshot,heartbeatOnly){dataRef.current=snapshot;setData(snapshot);if(!heartbeatOnly)setNow(Date.now());},
   onState:setLive,
  });
  runtime.current=manager;
  const onAppState=(state:string)=>{setNow(Date.now());if(state==='active')manager.start();else manager.pause();};
  onAppState(AppState.currentState??'active');
  const app=AppState.addEventListener('change',onAppState);
  return()=>{app.remove();runtime.current=null;manager.dispose();};
 },[]);
 // Deadline updates are local. No periodic REST request or global one-second clock.
 useEffect(()=>{
  if(live.connection==='paused')return;
  const current=Date.now();const deadline=nextDeadline(data,current);
  // If a deadline elapsed before this effect ran, catch the display up once.
  const previousDeadline=nextDeadline(data,now);
  if(previousDeadline!==null&&previousDeadline<=current){setNow(current);return;}
  if(deadline===null)return;
  const timer=setTimeout(()=>setNow(Date.now()),Math.min(2147483647,Math.max(1,deadline-current+5)));
  return()=>clearTimeout(timer);
 },[data,now,live.connection]);
 const load=useCallback(async()=>{runtime.current?.manual();},[]);
 const mutate:Mutate=useCallback(async(fn,sections=SECTIONS)=>{
  const manager=runtime.current;
  if(!manager||!manager.canWrite()||write.current)return;
  write.current=true;setBusy(true);
  try{await fn();if(runtime.current===manager)manager.invalidate(sections);}
  catch(e){if(runtime.current===manager)Alert.alert('Operation failed',err(e));}
  finally{write.current=false;if(runtime.current===manager)setBusy(false);}
 },[]);
 const cloudReady=live.connection==='live'&&!live.error;
 const online=cloudReady&&isDeviceOnline(data?.device.last_seen,Date.now());
 const control=useCallback((channel:number,state:boolean)=>{
  const snapshot=dataRef.current;
  if(snapshot&&runtime.current?.canWrite()&&isDeviceOnline(snapshot.device.last_seen,Date.now()))void mutate(()=>api.requestLights(snapshot.device.id,channel,state),['commands','schedules']);
 },[mutate]);
 return useMemo(()=>({data,error:live.error,loading:live.loading,busy,now,load,mutate,online,control,disabled:busy||!online,cloudReady,connection:live.connection}),[data,live,busy,now,load,mutate,online,control,cloudReady]);
}
const DeviceContext=createContext<ReturnType<typeof useController>|null>(null);
export function DeviceProvider({children}:{children:React.ReactNode}){const value=useController();return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;}
export function useDevice(){const v=useContext(DeviceContext);if(!v)throw Error('DeviceProvider missing');return v;}
