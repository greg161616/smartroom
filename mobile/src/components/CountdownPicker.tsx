import React,{useState} from 'react';
import {View,StyleSheet} from 'react-native';
import Slider from '@react-native-community/slider';
import {Ionicons} from '@expo/vector-icons';
import {clampMinutes,durationText} from '../lib/automation';
import {Button,Txt,useTheme,styles} from './ui';

type Props={value:number;onChange:(minutes:number)=>void;disabled:boolean};
export function CountdownPicker({value,onChange,disabled}:Props){
 const t=useTheme();
 const [extended,setExtended]=useState(false);
 const full=extended||value>120;
 const max=full?1440:120;
 const change=(v:number)=>onChange(clampMinutes(v));
 return <View style={[local.panel,{backgroundColor:t.soft,borderColor:t.line}]}>
  <View style={{alignItems:'center',gap:5}}>
   <Ionicons name="timer-outline" color={t.accent} size={28}/>
   <Txt big color={t.accent}>{durationText(value)}</Txt>
   <Txt muted>{value} total minutes</Txt>
  </View>
  <View style={styles.row}>
   <View style={{flex:1}}><Button label="1–120 min" secondary={full} disabled={disabled} onPress={()=>{setExtended(false);if(value>120)change(120);}}/></View>
   <View style={{flex:1}}><Button label="Up to 24 hr" secondary={!full} disabled={disabled} onPress={()=>setExtended(true)}/></View>
  </View>
  <Slider key={full?'full':'short'} accessibilityLabel="Countdown duration in minutes" style={{width:'100%',height:44}} minimumValue={1} maximumValue={max} step={1} value={value} disabled={disabled} minimumTrackTintColor={t.accent} maximumTrackTintColor={t.line} thumbTintColor={t.accent} onValueChange={change} onSlidingComplete={change}/>
  <View style={[styles.row,{justifyContent:'space-between'}]}><Txt muted>1 min</Txt><Txt muted>{full?'24 hr':'120 min'}</Txt></View>
  <View style={styles.row}>
   {[-15,-1,1,15].map(n=><View key={n} style={{flex:1}}><Button label={`${n>0?'+':''}${n}m`} secondary disabled={disabled||(n<0?value===1:value===1440)} onPress={()=>change(value+n)}/></View>)}
  </View>
  <Txt muted>QUICK DURATIONS</Txt>
  <View style={styles.row}>{[5,15,30,60].map(n=><View key={n} style={{flex:1}}><Button label={`${n}m`} secondary={value!==n} disabled={disabled} onPress={()=>change(n)}/></View>)}</View>
  <View style={styles.row}>{[120,360,720,1440].map(n=><View key={n} style={{flex:1}}><Button label={`${n/60}h`} secondary={value!==n} disabled={disabled} onPress={()=>change(n)}/></View>)}</View>
  <Txt muted>The countdown starts when saved to Supabase.</Txt>
 </View>;
}
const local=StyleSheet.create({panel:{padding:12,gap:10,borderRadius:14,borderWidth:1}});
