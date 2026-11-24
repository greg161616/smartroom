import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import Animated, {ReduceMotion, interpolateColor, useAnimatedStyle, useDerivedValue, withSpring} from 'react-native-reanimated';
import {useAuth} from '../contexts/AppContext';
import type {Relay} from '../lib/types';
import {MotionButton, useTheme} from './ui';

const spring = {damping: 18, stiffness: 260, overshootClamping: true, reduceMotion: ReduceMotion.System};

export function LampSwitch({on}: {on: boolean}) {
  const {isDark} = useAuth();
  const off = isDark ? '#475569' : '#64748B';
  const progress = useDerivedValue(() => withSpring(on ? 1 : 0, spring));
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [off, '#EAB308']),
  }));
  const thumb = useAnimatedStyle(() => ({transform: [{translateX: progress.get() * 16}]}));

  return (
    <Animated.View style={[local.track, track]}>
      <Animated.View style={[local.thumb, thumb]}/>
    </Animated.View>
  );
}

export const RelayCard = React.memo(function RelayCard({relay, isOn, pending, online, disabled, command, control}: {
  relay: Relay;
  isOn: boolean;
  pending: boolean;
  online: boolean;
  disabled: boolean;
  command: string;
  control: (channel: number, state: boolean) => void;
}) {
  const t = useTheme();
  const {isDark} = useAuth();
  const active = isDark ? '#FACC15' : '#854D0E';
  const surface = isDark ? '#393018' : '#FEF3C7';
  const progress = useDerivedValue(() => withSpring(isOn ? 1 : 0, spring));
  const background = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [t.card, surface]),
  }));
  const state = pending ? (isOn ? 'Turning on…' : 'Turning off…')
    : relay.actual_state === null ? 'State unknown'
    : online ? (isOn ? 'Powered on' : 'Powered off')
    : (isOn ? 'Last reported on' : 'Last reported off');

  return (
    <Animated.View style={[local.tile, background]}>
      <MotionButton
        accessibilityLabel={`${relay.name}, ${state}. Turn ${isOn ? 'off' : 'on'}`}
        disabled={disabled}
        onPress={() => control(relay.channel, !isOn)}
        style={local.button}
      >
        <View style={local.top}>
          <Ionicons name="bulb-outline" color={isOn ? active : t.muted} size={25}/>
          <LampSwitch on={isOn}/>
        </View>
        <Text style={{color: t.text, fontSize: 15, fontWeight: '700'}}>{relay.name}</Text>
        <Text style={{color: isOn ? active : t.muted, fontSize: 12}}>{state}</Text>
        {command && !pending ? <Text style={{color: t.muted, fontSize: 11}}>{command}</Text> : null}
      </MotionButton>
    </Animated.View>
  );
});

const local = StyleSheet.create({
  tile: {flexBasis: '46%', flexGrow: 1, borderRadius: 14},
  button: {flex: 1, minHeight: 100, padding: 12, gap: 6},
  top: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4},
  track: {width: 38, height: 22, padding: 3, borderRadius: 11, direction: 'ltr'},
  thumb: {width: 16, height: 16, borderRadius: 8, backgroundColor: '#FFF'},
});
