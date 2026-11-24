import type {Snapshot} from './api';
import {SECTIONS,changedSections,mergeDevice,mergeSnapshot,parseSignal,type Section,type LiveSignal} from './liveModel';
export type Connection='connecting'|'live'|'reconnecting'|'paused';
export type LiveState={connection:Connection;error:string;loading:boolean};
type Identity={roomId:string;deviceId:string};
type Dependencies={
 discover:()=>Promise<Identity>;
 fetchLive:(id:string)=>Promise<LiveSignal>;
 fetchRoom:(room:string,device:string)=>Promise<Snapshot>;
 fetchParts:(snapshot:Snapshot,sections:Section[])=>Promise<Partial<Snapshot>>;
 subscribe:(id:string,onSignal:(value:unknown)=>void,onStatus:(status:string)=>void)=>()=>void;
 onSnapshot:(snapshot:Snapshot|null,heartbeatOnly:boolean)=>void;
 onState:(state:LiveState)=>void;
};
const DEFAULT_TIMING={debounce:160,joinTimeout:15000,retryMin:1000,retryMax:30000};
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
// The manager is independent of React; one active channel and one read pipeline.
// All async completions carry a generation so a stale response cannot cross a
// background transition, reconnect or sign-out.
export function createLiveSync(deps:Dependencies,timing:Partial<typeof DEFAULT_TIMING>={}){
 const config={...DEFAULT_TIMING,...timing};
 let state:LiveState={connection:'paused',error:'',loading:false};
 let active=false,disposed=false,epoch=0,joined=false,running=false,failures=0;
 let identity:Identity|null=null,snapshot:Snapshot|null=null,latest:LiveSignal|null=null;
 let close:(()=>void)|null=null;
 let retry:ReturnType<typeof setTimeout>|null=null,flush:ReturnType<typeof setTimeout>|null=null,joinTimer:ReturnType<typeof setTimeout>|null=null;
 let full=false,dirty=new Set<Section>();
 const valid=(g:number)=>active&&!disposed&&g===epoch;
 function update(patch:Partial<LiveState>){
  const next={...state,...patch};
  if(next.connection===state.connection&&next.error===state.error&&next.loading===state.loading)return;
  state=next;if(!disposed)deps.onState(state);
 }
 function publish(patch:Partial<Snapshot>,heartbeatOnly=false){
  const next=mergeSnapshot(snapshot,patch);
  if(next!==snapshot){snapshot=next;deps.onSnapshot(next,heartbeatOnly);}
 }
 function resetTransport(){
  epoch++;joined=false;running=false;full=false;dirty.clear();latest=null;
  if(retry!==null)clearTimeout(retry);if(flush!==null)clearTimeout(flush);if(joinTimer!==null)clearTimeout(joinTimer);
  retry=flush=joinTimer=null;
  const cancel=close;close=null;if(cancel)cancel();
 }
 function fail(g:number,error:unknown){
  if(!valid(g))return;
  resetTransport();
  update({connection:'reconnecting',error:message(error),loading:false});
  const delay=Math.min(config.retryMax,config.retryMin*2**Math.min(failures++,10));
  retry=setTimeout(()=>{retry=null;void boot(epoch);},delay);
 }
 function queue(sections:readonly Section[]=[],all=false,immediate=false){
  if(!active||!joined||disposed)return;
  if(all)full=true;
  sections.forEach(s=>dirty.add(s));
  if(running)return;
  if(flush!==null){if(!immediate)return;clearTimeout(flush);flush=null;}
  const g=epoch;
  flush=setTimeout(()=>{flush=null;void drain(g);},immediate?0:config.debounce);
 }
 function observe(signal:LiveSignal,fromRead=false){
  if(!identity||signal.device_id!==identity.deviceId||latest&&signal.revision<=latest.revision)return;
  const previous=latest;latest=signal;
  if(snapshot&&snapshot.device.id===signal.device_id){
   const device=mergeDevice(snapshot.device,signal);if(device!==snapshot.device)publish({device},true);
  }
  if(!fromRead){const changed=changedSections(previous,signal);if(changed.length)queue(changed);}
 }
 async function drain(g:number){
  if(!valid(g)||!joined||running||!identity||(!full&&!dirty.size))return;
  const all=full||!snapshot;const sections=[...dirty];full=false;dirty.clear();running=true;
  const {roomId,deviceId}=identity;
  try{
   if(all){
    // Read revision AFTER joining and BEFORE the snapshot. Any event arriving
    // during reads stays queued; the next targeted read closes that race.
    const baseline=await deps.fetchLive(deviceId);if(!valid(g))return;
    observe(baseline,true);
    const next=await deps.fetchRoom(roomId,deviceId);if(!valid(g))return;
    if(latest)next.device=mergeDevice(next.device,latest);
    publish(next);failures=0;update({connection:'live',error:'',loading:false});
   }else{
    const patch=await deps.fetchParts(snapshot!,sections);if(!valid(g))return;
    publish(patch);update({error:'',loading:false});
   }
  }catch(e){fail(g,e);}
  finally{if(valid(g)){running=false;if(full||dirty.size)queue([],false,true);}}
 }
 async function boot(g:number){
  if(!valid(g))return;
  try{
   const found=await deps.discover();if(!valid(g))return;
   if(snapshot&&snapshot.device.id!==found.deviceId){snapshot=null;deps.onSnapshot(null,false);}
   identity=found;
   joinTimer=setTimeout(()=>fail(g,Error('Realtime subscription timed out')),config.joinTimeout);
   const cancel=deps.subscribe(found.deviceId,value=>{
    if(!valid(g))return;
    try{observe(parseSignal(value));}catch(e){fail(g,e);}
   },status=>{
    if(!valid(g))return;
    if(status==='SUBSCRIBED'){
     if(joinTimer!==null)clearTimeout(joinTimer);joinTimer=null;
     joined=true;queue([],true,true);
    }else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED')fail(g,Error(`Realtime ${status.toLowerCase().replace('_',' ')}; retrying automatically`));
   });
   if(valid(g))close=cancel;else cancel();
  }catch(e){fail(g,e);}
 }
 function start(){
  if(active||disposed)return;
  active=true;resetTransport();failures=0;
  update({connection:snapshot?'reconnecting':'connecting',error:'',loading:!snapshot});
  void boot(epoch);
 }
 function pause(){
  if(!active)return;
  active=false;resetTransport();update({connection:'paused',error:'',loading:false});
 }
 function manual(){
  if(!active||disposed)return;
  update({loading:true});
  if(joined){queue([],true,true);return;}
  resetTransport();failures=0;update({connection:snapshot?'reconnecting':'connecting',error:'',loading:true});void boot(epoch);
 }
 return {
  start,pause,manual,
  invalidate:(sections:readonly Section[]=SECTIONS)=>queue(sections,false,true),
  canWrite:()=>active&&joined&&state.connection==='live'&&!state.error&&!!snapshot,
  dispose(){disposed=true;active=false;resetTransport();},
 };
}
