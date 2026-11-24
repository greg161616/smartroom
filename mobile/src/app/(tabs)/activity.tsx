import React,{useEffect,useState,useRef,useCallback,createContext,useContext} from 'react';
import {View,Text,TextInput,Pressable,ScrollView,Switch,Alert,AppState,StatusBar,StyleSheet,RefreshControl,ActivityIndicator,KeyboardAvoidingView,Platform} from 'react-native';
import {router} from 'expo-router';
import {useDevice} from '../../contexts/DeviceContext';
import {useAuth} from '../../contexts/AppContext';
import {useTheme,Txt,Card,Button,styles,dateText} from '../../components/ui';
import {Screen} from '../../components/Screen';
import {supabase} from '../../lib/supabase';
import {Activity} from '../../components/Activity';export default function Page(){const {data,busy,error,mutate,now}=useDevice();return <Screen title='Activity'>{data&&<Activity data={data} now={now}/>}</Screen>}
