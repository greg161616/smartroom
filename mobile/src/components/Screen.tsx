import React from 'react';
import {View,ScrollView,RefreshControl,StyleSheet} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import Animated,{Easing,ReduceMotion,useAnimatedStyle,useSharedValue,withTiming} from 'react-native-reanimated';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useDevice} from '../contexts/DeviceContext';
import {useTheme,Txt,Card,Button,MotionButton,styles} from './ui';

function RefreshIcon({loading,busy,onRefresh}:{loading:boolean;busy:boolean;onRefresh:()=>void}){
 const t=useTheme();
 const turn=useSharedValue(0);
 const motion=useAnimatedStyle(()=>({transform:[{rotate:`${turn.get()}deg`}]}));
 return <MotionButton accessibilityLabel={loading?'Refreshing room':'Refresh room'} disabled={loading||busy}
  style={[local.refresh,{backgroundColor:t.soft,opacity:busy&&!loading?0.5:1}]}
  onPress={()=>{
   turn.set(0);
   turn.set(withTiming(360,{duration:620,easing:Easing.out(Easing.cubic),reduceMotion:ReduceMotion.System}));
   onRefresh();
  }}>
  <Animated.View style={motion}><Ionicons name="refresh-outline" size={23} color={loading?t.accent:t.text}/></Animated.View>
 </MotionButton>;
}

const local=StyleSheet.create({
 refresh:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'},
});

export function Screen({title,header,children}:{title:string;header?:React.ReactNode;children:React.ReactNode}){
 const t=useTheme();const {data,error,loading,busy,load,connection}=useDevice();
 return <SafeAreaView edges={['top','left','right']} style={{flex:1,backgroundColor:t.bg}}>
  {header??<View style={[styles.header,{borderColor:t.line}]}>
   <View style={{flex:1,gap:4}}><Txt muted>SMARTROOM · {connection==='live'?'LIVE':connection==='paused'?'PAUSED':'SYNCING'}</Txt><Txt big>{title}</Txt></View>
   <RefreshIcon loading={loading} busy={busy} onRefresh={()=>void load()}/>
  </View>}
  <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={()=>void load()} tintColor={t.accent}/>}>
   {error?<Card><Txt color={t.bad}>{error}</Txt><Txt muted>Last reported data may be outdated. Reconnecting automatically; cloud controls are temporarily disabled.</Txt><Button label="Retry now" secondary onPress={()=>void load()}/></Card>:null}
   {data&&connection!=='live'&&!error?<Txt muted>Restoring live connection and checking missed changes…</Txt>:null}
   {!data?<Txt muted>{loading?'Connecting to your room…':'Room unavailable. Pull down to refresh.'}</Txt>:null}
   {children}
  </ScrollView>
 </SafeAreaView>;
}
