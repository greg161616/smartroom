import React from 'react';
import {Alert,Platform,Pressable,StyleSheet,View} from 'react-native';
import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import {Ionicons} from '@expo/vector-icons';
import {displayDate,displayTime12,manilaDateTime,MANILA_ZONE,pickerSelection,pickerValue} from '../lib/automation';
import {Txt,useTheme} from './ui';

type Props={date:string;time:string;showDate:boolean;disabled:boolean;onDate:(date:string)=>void;onTime:(time:string)=>void};

// Android uses native calendar and clock dialogs. Never interpret a selected
// timestamp using the phone's local timezone: the scheduler always uses PHT.
export function SchedulePickers({date,time,showDate,disabled,onDate,onTime}:Props){
 const t=useTheme();
 const today=manilaDateTime(Date.now()).slice(0,10);
 function open(mode:'date'|'time'){
  if(disabled)return;
  if(Platform.OS!=='android'){
   Alert.alert('Android required','Open SmartRoom on Android to use the native schedule pickers.');
   return;
  }
  try{
   const base=pickerValue(showDate?date:today,time);
   // onChange works on older Expo-pinned datetimepicker versions as well as newer ones.
   DateTimePickerAndroid.open({
    mode,
    value:mode==='date'&&date<today?pickerValue(today,time):base,
    display:mode==='date'?'calendar':'clock',
    timeZoneName:MANILA_ZONE,
    ...(mode==='date'?{minimumDate:pickerValue(today,'00:00')}:{is24Hour:false}),
    onChange:(event,selected)=>{
     if(event.type!=='set'||!selected||!Number.isFinite(selected.getTime()))return;
     const result=pickerSelection(selected);
     if(mode==='date')onDate(result.date);else onTime(result.time);
    },
    onError:()=>Alert.alert('Picker unavailable','Restart Expo or rebuild the Android app after installing the native dependencies.'),
   });
  }catch{
   Alert.alert('Picker unavailable','Check that the Android date/time picker is installed and restart the application.');
  }
 }
 return <View style={{gap:10}}>
  {showDate?<Pressable accessibilityRole="button" accessibilityLabel={`Select date, ${displayDate(date)}`} accessibilityState={{disabled}} disabled={disabled} onPress={()=>open('date')} style={({pressed})=>[local.field,{backgroundColor:t.soft,borderColor:t.line,opacity:disabled?0.5:pressed?0.75:1}]}>
   <Ionicons name="calendar-outline" size={26} color={t.accent}/>
   <View style={{flex:1,gap:3}}><Txt muted>DATE</Txt><Txt big>{displayDate(date)}</Txt></View>
   <Ionicons name="chevron-forward" size={20} color={t.muted}/>
  </Pressable>:null}
  <Pressable accessibilityRole="button" accessibilityLabel={`Select time, ${displayTime12(time)}`} accessibilityState={{disabled}} disabled={disabled} onPress={()=>open('time')} style={({pressed})=>[local.field,{backgroundColor:t.soft,borderColor:t.line,opacity:disabled?0.5:pressed?0.75:1}]}>
   <Ionicons name="time-outline" size={26} color={t.accent}/>
   <View style={{flex:1,gap:3}}><Txt muted>{showDate?'TIME':'EVERY DAY AT'}</Txt><Txt big>{displayTime12(time)}</Txt></View>
   <Ionicons name="chevron-forward" size={20} color={t.muted}/>
  </Pressable>
  <Txt muted>Philippine Standard Time (UTC+8)</Txt>
 </View>;
}
const local=StyleSheet.create({field:{flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderRadius:14,padding:14,minHeight:76}});
