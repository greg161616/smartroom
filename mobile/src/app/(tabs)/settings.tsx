import React,{useEffect,useState,useRef,useCallback,createContext,useContext} from 'react';
import {View,Text,TextInput,Pressable,ScrollView,Switch,Alert,AppState,StatusBar,StyleSheet,RefreshControl,ActivityIndicator,KeyboardAvoidingView,Platform} from 'react-native';
import {router} from 'expo-router';
import {useDevice} from '../../contexts/DeviceContext';
import {useAuth} from '../../contexts/AppContext';
import {useTheme,Txt,Card,Button,styles,dateText} from '../../components/ui';
import {Screen} from '../../components/Screen';
import {supabase} from '../../lib/supabase';
import {Gesture} from '../../components/Gesture';export default function Settings(){const t=useTheme();const {data,busy,error,mutate}=useDevice();const {session,isDark,theme}=useAuth();const email=session?.user.email??'';return <Screen title='Settings'>{data&&<Gesture settings={data.settings} busy={busy||!!error} mutate={mutate}/>}<><Card><View style={styles.row}><View style={{flex:1}}><Txt>Dark appearance</Txt><Txt muted>Saved on this phone</Txt></View><Switch value={isDark} onValueChange={theme}/></View></Card><Card><Txt>Account</Txt><Txt muted>{email}</Txt><Txt muted>Controller ID (for future firmware setup)</Txt><Text selectable style={{color:t.muted}}>{data?.device.id??'Unavailable'}</Text><Button label="Sign out" secondary onPress={()=>void supabase.auth.signOut().then(({error})=>{if(error)Alert.alert('Sign out',error.message)})}/></Card></></Screen>}
