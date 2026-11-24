import React,{createContext,useContext} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet} from 'react-native';
import type {PressableProps,StyleProp,ViewStyle} from 'react-native';
import Animated,{useAnimatedStyle,useReducedMotion,useSharedValue,withTiming} from 'react-native-reanimated';
import {dark,Theme} from '../lib/theme';
export const ThemeContext=createContext<Theme>(dark);export const useTheme=()=>useContext(ThemeContext);
export const err=(e:unknown)=>e instanceof Error?e.message:String(e);
export const dateText=(s:string)=>new Date(s).toLocaleString();
export function Txt({children,muted=false,big=false,color}:{children:React.ReactNode;muted?:boolean;big?:boolean;color?:string}){const t=useTheme();return <Text style={{color:color??(muted?t.muted:t.text),fontSize:big?24:muted?13:15,fontWeight:big?'700':'400'}}>{children}</Text>}
export function Card({children}:{children:React.ReactNode}){const t=useTheme();return <View style={[styles.card,{backgroundColor:t.card,borderColor:t.line}]}>{children}</View>}
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function MotionButton({style, disabled, ...props}: Pick<PressableProps, 'children' | 'accessibilityLabel' | 'onPress' | 'disabled'> & {style: StyleProp<ViewStyle>}) {
  const scale = useSharedValue(1);
  const reduceMotion = useReducedMotion();
  const motion = useAnimatedStyle(() => ({transform: [{scale: disabled ? 1 : scale.get()}]}));

  return (
    <AnimatedPressable
      {...props}
      accessibilityRole="button"
      accessibilityState={{disabled: !!disabled}}
      disabled={disabled}
      onPressIn={() => {
        if (!reduceMotion) scale.set(withTiming(0.96, {duration: 85}));
      }}
      onPressOut={() => scale.set(withTiming(1, {duration: 150}))}
      style={[style, motion]}
    />
  );
}

export function Button({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
  const t = useTheme();
  return (
    <MotionButton disabled={disabled} onPress={onPress} style={[styles.button,{backgroundColor:secondary?t.soft:t.primary,opacity:disabled?0.45:1}]}>
      <Text style={{color:secondary?t.text:'#fff',fontWeight:'600',textAlign:'center'}}>{label}</Text>
    </MotionButton>
  );
}

export function Field({value,onChangeText,placeholder,secure=false,numeric=false,maxLength,editable=true}:{value:string;onChangeText:(s:string)=>void;placeholder:string;secure?:boolean;numeric?:boolean;maxLength?:number;editable?:boolean}){const t=useTheme();return <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.muted} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} maxLength={maxLength} editable={editable} keyboardType={numeric?'number-pad':placeholder==='Email'?'email-address':'default'} style={[styles.field,{color:t.text,backgroundColor:t.soft,borderColor:t.line}]}/>}
export const styles=StyleSheet.create({content:{padding:18,gap:14,paddingBottom:28},header:{paddingHorizontal:18,paddingVertical:12,borderBottomWidth:1,flexDirection:'row',alignItems:'center',gap:10},card:{borderRadius:18,borderWidth:1,padding:14,gap:12},row:{flexDirection:'row',alignItems:'center',gap:10},button:{paddingVertical:12,paddingHorizontal:9,borderRadius:11,minHeight:44,justifyContent:'center'},field:{borderRadius:11,borderWidth:1,padding:13,fontSize:15,minHeight:48},nav:{flexDirection:'row',borderTopWidth:1}});
