import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Animated, {FadeIn, FadeInDown, ReduceMotion} from 'react-native-reanimated';
import {router} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {useAuth} from '../../contexts/AppContext';
import {useDevice} from '../../contexts/DeviceContext';
import {MotionButton, useTheme} from '../../components/ui';
import {Screen} from '../../components/Screen';
import {LampSwitch, RelayCard} from '../../components/RelayCard';
import {displayTime12, kindName, manilaDateTime} from '../../lib/automation';
import {commandText} from '../../lib/liveModel';

const presets = [
  {id: 'bedtime', title: 'Bedtime', detail: 'All lights off', icon: 'moon-outline'},
  {id: 'morning', title: 'Morning', detail: 'Lights on', icon: 'sunny-outline'},
  {id: 'countdown', title: 'Countdown', detail: 'Set timer', icon: 'timer-outline'},
] as const;
const entrance = FadeInDown.duration(220).reduceMotion(ReduceMotion.System);
const statusEntrance = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

function openPreset(preset: (typeof presets)[number]['id']) {
  router.push({pathname: '/schedules', params: {preset, seed: String(Date.now())}});
}

export default function Home() {
  const t = useTheme();
  const {isDark, theme} = useAuth();
  const {data, online, disabled, loading, busy, load, control, now, cloudReady} = useDevice();
  const lights = data?.relays.map(relay => {
    const latest = data.commands.find(command => command.relay_id === relay.id);
    const pending = latest?.status === 'pending' && Date.parse(latest.expires_at) > now;
    const isOn = pending ? latest.desired_state : relay.actual_state === true;
    return {relay, pending, isOn, latest};
  }) ?? [];
  const anyLightOn = lights.some(({isOn}) => isOn);
  const next = data?.schedules
    .filter(schedule => schedule.enabled && Date.parse(schedule.run_at) > now)
    .sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at))[0];
  const room = data?.room.name ?? 'My Room';
  const status = !cloudReady ? 'Unknown' : online ? 'Online' : 'Offline';
  const card = {backgroundColor: t.card};
  const title = [home.title, {color: t.text}];
  const detail = [home.detail, {color: t.muted}];
  const groupDisabled = disabled || lights.length === 0;

  return (
    <Screen title={room} header={
      <View style={home.header}>
        <View style={home.grow}>
          <Text accessibilityRole="header" style={[home.room, {color: t.text}]}>{room}</Text>
          <Text style={detail}>Everything under your control</Text>
        </View>
        <MotionButton
          accessibilityLabel={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          onPress={() => theme(!isDark)}
          style={home.themeButton}
        >
          <Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} color={t.muted} size={20}/>
        </MotionButton>
      </View>
    }>
      {data ? (
        <Animated.View entering={entrance} style={home.dashboard}>
          <MotionButton
            accessibilityLabel={`Refresh room controller, status ${status.toLowerCase()}`}
            disabled={loading || busy}
            onPress={() => void load()}
            style={[home.row, card]}
          >
            <Ionicons name="hardware-chip-outline" color={t.accent} size={21}/>
            <View style={home.grow}>
              <Text style={title}>Room Controller</Text>
              <Text style={detail}>{data.device.name}</Text>
            </View>
            <Animated.View key={status} entering={statusEntrance} style={[home.badge, {backgroundColor: online ? (isDark ? '#123530' : '#DCFCE7') : t.soft}]}>
              <Text style={[home.badgeText, {color: online ? t.good : t.warn}]}>{status}</Text>
            </Animated.View>
          </MotionButton>

          <View style={home.grid}>
            {lights.map(({relay, isOn, pending, latest}) => (
              <RelayCard key={relay.id} relay={relay} isOn={isOn} pending={pending} online={online}
                disabled={disabled} command={commandText(latest, now)} control={control}/>
            ))}
          </View>

          <MotionButton
            disabled={groupDisabled}
            onPress={() => control(0, !anyLightOn)}
            style={[home.row, card, groupDisabled && home.disabled]}
          >
            <Ionicons name="power-outline" color={t.accent} size={19}/>
            <Text style={[title, home.grow]}>{anyLightOn ? 'Turn all off' : 'Turn all on'}</Text>
            <LampSwitch on={anyLightOn}/>
          </MotionButton>

          <View style={home.section}>
            <Text accessibilityRole="header" style={[home.heading, {color: t.muted}]}>QUICK AUTOMATIONS</Text>
            <View style={home.grid}>
              {presets.map(preset => (
                <MotionButton key={preset.id} onPress={() => openPreset(preset.id)} style={[home.tile, card]}>
                  <Ionicons name={preset.icon} size={19}
                    color={preset.id === 'morning' ? (isDark ? '#FACC15' : '#854D0E') : preset.id === 'bedtime' && isDark ? '#C4B5FD' : t.accent}/>
                  <Text style={title}>{preset.title}</Text>
                  <Text style={detail}>{preset.detail}</Text>
                </MotionButton>
              ))}
              <MotionButton onPress={() => router.push('/settings')} style={[home.tile, card]}>
                <Ionicons name="hand-left-outline" color={t.good} size={19}/>
                <Text style={title}>Gestures</Text>
                <Text style={[detail, home.capitalize]}>{data.settings.gesture_enabled ? `${data.settings.mode} mode` : 'Disabled'}</Text>
              </MotionButton>
            </View>
          </View>

          <MotionButton onPress={() => router.push('/schedules')} style={[home.row, card]}>
            <Ionicons name="calendar-outline" color={t.accent} size={20}/>
            <View style={home.grow}>
              <Text style={title}>Next schedule</Text>
              <Text style={detail}>{next ? `${next.label} · ${kindName(next.kind)}` : 'No upcoming runs'}</Text>
            </View>
            {next ? <Text style={[home.time, {color: t.text}]}>{displayTime12(manilaDateTime(Date.parse(next.run_at)).slice(11))} PHT</Text> : null}
          </MotionButton>

          <View style={[home.row, card]}>
            <Ionicons name="shield-checkmark-outline" color={t.good} size={19}/>
            <View style={home.grow}>
              <Text style={title}>Offline protection</Text>
              <Text style={detail}>{data.settings.gesture_enabled ? 'Local gestures available' : 'Local gestures are disabled'}</Text>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </Screen>
  );
}

const home = StyleSheet.create({
  header: {width: '100%', maxWidth: 600, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 8, gap: 12},
  themeButton: {width: 44, height: 44, alignItems: 'center', justifyContent: 'center'},
  room: {fontSize: 26, fontWeight: '700', letterSpacing: -0.6, marginBottom: 2},
  dashboard: {gap: 10, width: '100%', maxWidth: 564, alignSelf: 'center'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  tile: {flexBasis: '46%', flexGrow: 1, minHeight: 80, padding: 12, gap: 5, borderRadius: 14},
  badge: {paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20},
  badgeText: {fontSize: 11, fontWeight: '700'},
  section: {gap: 8},
  grow: {flex: 1, minWidth: 0, gap: 3},
  heading: {fontSize: 12, fontWeight: '600', letterSpacing: 0.5},
  title: {fontSize: 15, fontWeight: '700'},
  detail: {fontSize: 12, lineHeight: 16},
  time: {fontSize: 13, fontWeight: '700', flexShrink: 1},
  capitalize: {textTransform: 'capitalize'},
  disabled: {opacity: 0.55},
});
