import React,{useEffect,useState,useRef,useCallback,createContext,useContext} from 'react';
import {View,Text,TextInput,Pressable,ScrollView,Switch,Alert,AppState,StatusBar,StyleSheet,RefreshControl,ActivityIndicator,KeyboardAvoidingView,Platform} from 'react-native';
import * as api from '../lib/api';
import type {Snapshot} from '../lib/api';
import type {Settings,Relay} from '../lib/types';
import {useTheme,Txt,Card,Button,Field,styles,dateText,err} from './ui';
export function CommandLabel({relay,data,now}:{relay:Relay;data:Snapshot;now:number}){const c=data.commands.find(x=>x.relay_id===relay.id);if(!c)return null;const status=c.status==='pending'&&Date.parse(c.expires_at)<=now?'expired (local estimate)':c.status;return <Txt muted>Request {c.desired_state?'ON':'OFF'} · {status}</Txt>}
