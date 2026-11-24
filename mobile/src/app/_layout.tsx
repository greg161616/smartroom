import React from 'react';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {AppProvider,useAuth} from '../contexts/AppContext';
import {useTheme} from '../components/ui';
function Root(){const {isDark}=useAuth();const t=useTheme();return <><StatusBar style={isDark?'light':'dark'}/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:t.bg}}}/></>;}
export default function Layout(){return <AppProvider><Root/></AppProvider>}
