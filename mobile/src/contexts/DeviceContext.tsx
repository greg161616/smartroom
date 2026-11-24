import React,{useEffect,useState,useRef,useCallback,createContext,useContext} from 'react';
import {View,Text,TextInput,Pressable,ScrollView,Switch,Alert,AppState,StatusBar,StyleSheet,RefreshControl,ActivityIndicator,KeyboardAvoidingView,Platform} from 'react-native';
import * as api from '../lib/api';
import type {Snapshot} from '../lib/api';
import {err} from '../components/ui';
function useController(){const [data,D]=useState<Snapshot|null>(null),[error,X]=useState(''),[loading,L]=useState(false),[busy,B]=useState(false),[now,N]=useState(Date.now());const room=useRef<string|null>(null),lock=useRef(false),write=useRef(false),alive=useRef(true);
 const load=useCallback(async()=>{if(lock.current)return;lock.current=true;L(true);try{if(!room.current)room.current=await api.setup();const d=await api.fetchRoom(room.current);if(alive.current){D(d);X('');N(Date.now())}}catch(e){if(alive.current)X(err(e))}finally{lock.current=false;if(alive.current)L(false)}},[]);
 useEffect(()=>{alive.current=true;void load();const timer=setInterval(()=>{N(Date.now());if(AppState.currentState==='active'&&!write.current)void load()},15000);const a=AppState.addEventListener('change',s=>{if(s==='active')void load()});return()=>{alive.current=false;clearInterval(timer);a.remove()}},[load]);
 async function mutate(fn:()=>Promise<unknown>){if(write.current)return;write.current=true;B(true);try{await fn();while(lock.current&&alive.current)await new Promise(r=>setTimeout(r,50));if(alive.current)await load()}catch(e){Alert.alert('Operation failed',err(e))}finally{write.current=false;if(alive.current)B(false)}}
 const online=!!data?.device.last_seen&&!error&&now-Date.parse(data.device.last_seen)<25000;
 const control=(channel:number,state:boolean)=>{if(data&&online)void mutate(()=>api.requestLights(data.device.id,channel,state))};
 const disabled=busy||!online;
return {data,error,loading,busy,now,load,mutate,online,control,disabled};}
const DeviceContext=createContext<ReturnType<typeof useController>|null>(null);
export function DeviceProvider({children}:{children:React.ReactNode}){const value=useController();return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>}
export function useDevice(){const v=useContext(DeviceContext);if(!v)throw Error('DeviceProvider missing');return v;}
