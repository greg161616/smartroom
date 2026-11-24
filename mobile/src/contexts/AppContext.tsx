import React,{useEffect,useState,useRef,useCallback,createContext,useContext} from 'react';
import {View,Text,TextInput,Pressable,ScrollView,Switch,Alert,AppState,StatusBar,StyleSheet,RefreshControl,ActivityIndicator,KeyboardAvoidingView,Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';
import {dark,light} from '../lib/theme';
import {ThemeContext,err} from '../components/ui';
const AuthContext=createContext<{session:Session|null;ready:boolean;isDark:boolean;theme:(v:boolean)=>void}>({session:null,ready:false,isDark:true,theme:()=>{}});
export const useAuth=()=>useContext(AuthContext);
export function AppProvider({children}:{children:React.ReactNode}){const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false),[isDark,setDark]=useState(true);const t=isDark?dark:light;
 useEffect(()=>{let live=true;AsyncStorage.getItem('smartroom-theme').then(v=>{if(live&&v)setDark(v==='dark')}).catch(()=>{});supabase.auth.getSession().then(({data,error})=>{if(live){setSession(data.session);setReady(true);if(error)Alert.alert('Session',error.message)}}).catch(e=>{if(live){setReady(true);Alert.alert('Session',err(e))}});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);setReady(true)});const sync=(s:string)=>s==='active'?supabase.auth.startAutoRefresh():supabase.auth.stopAutoRefresh();sync(AppState.currentState);const a=AppState.addEventListener('change',sync);return()=>{live=false;subscription.unsubscribe();a.remove();supabase.auth.stopAutoRefresh()}},[]);
 function theme(v:boolean){setDark(v);AsyncStorage.setItem('smartroom-theme',v?'dark':'light').catch(()=>{})}
return <AuthContext.Provider value={{session,ready,isDark,theme}}><ThemeContext.Provider value={t}>{children}</ThemeContext.Provider></AuthContext.Provider>;
}
