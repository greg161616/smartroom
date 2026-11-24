import React from 'react';
import {useLocalSearchParams} from 'expo-router';
import {useDevice} from '../../contexts/DeviceContext';
import {Screen} from '../../components/Screen';
import {Schedules} from '../../components/Schedules';
export default function Page(){
 const {data,busy,cloudReady,mutate,now}=useDevice();
 const {preset,seed}=useLocalSearchParams<{preset?:string;seed?:string}>();
 return <Screen title="Schedules">{data?<Schedules data={data} busy={busy||!cloudReady} mutate={mutate} now={now} preset={preset} seed={seed}/>:null}</Screen>;
}
