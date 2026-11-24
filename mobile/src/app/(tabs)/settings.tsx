import React, {useState} from 'react';
import {Alert, Switch, Text, View} from 'react-native';
import {useDevice} from '../../contexts/DeviceContext';
import {useAuth} from '../../contexts/AppContext';
import {useTheme, Txt, Card, Button, Field, styles} from '../../components/ui';
import {Screen} from '../../components/Screen';
import {supabase} from '../../lib/supabase';
import {saveRoomNames, type Snapshot} from '../../lib/api';
import {Gesture} from '../../components/Gesture';

function NameEditor({data, disabled, onSave}: {
  data: Snapshot;
  disabled: boolean;
  onSave: (roomName: string | null, lightNames: Record<string, string>) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const fields = [
    {...data.room, label: 'Room name'},
    ...data.relays.map(relay => ({...relay, label: `Light ${relay.channel} name`})),
  ].map(field => ({...field, value: drafts[field.id] ?? field.name}));
  const [room, ...lights] = fields;
  const roomName = room.value.trim() === room.name ? null : room.value.trim();
  const changedLights = lights.filter(light => light.value.trim() !== light.name);
  const canSave = !disabled && fields.every(field => field.value.trim())
    && (roomName !== null || changedLights.length > 0);

  return (
    <Card>
      <Txt>Room and light names</Txt>
      {fields.map(({id, label, value}) => (
        <View key={id} style={{gap: 8}}>
          <Txt muted>{label}</Txt>
          <Field
            value={value}
            onChangeText={text => setDrafts(current => ({...current, [id]: text}))}
            placeholder={label}
            maxLength={60}
            editable={!disabled}
          />
        </View>
      ))}
      <Button
        label="Save names"
        disabled={!canSave}
        onPress={() => onSave(roomName, Object.fromEntries(changedLights.map(light => [light.id, light.value.trim()])))}
      />
    </Card>
  );
}

export default function Settings() {
  const t = useTheme();
  const {data, busy, cloudReady, loading, load, mutate} = useDevice();
  const {session, isDark, theme} = useAuth();
  const unavailable = busy || !cloudReady;

  return (
    <Screen title="Settings">
      {data ? (
        <>
          <NameEditor
            key={JSON.stringify([data.room, data.relays.map(({id, name}) => [id, name])])}
            data={data}
            disabled={unavailable || loading}
            onSave={(roomName, lightNames) => void mutate(async () => {
              await saveRoomNames(data.room.id, roomName, lightNames);
              await load();
            }, [])}
          />
          <Gesture settings={data.settings} busy={unavailable} mutate={mutate}/>
        </>
      ) : null}
      <Card>
        <View style={styles.row}>
          <View style={{flex: 1}}>
            <Txt>Dark appearance</Txt>
            <Txt muted>Saved on this phone</Txt>
          </View>
          <Switch value={isDark} onValueChange={theme}/>
        </View>
      </Card>
      <Card>
        <Txt>Account</Txt>
        <Txt muted>{session?.user.email ?? ''}</Txt>
        <Txt muted>Controller ID (for future firmware setup)</Txt>
        <Text selectable style={{color: t.muted}}>{data?.device.id ?? 'Unavailable'}</Text>
        <Button label="Sign out" secondary onPress={() => void supabase.auth.signOut().then(({error}) => {
          if (error) Alert.alert('Sign out', error.message);
        })}/>
      </Card>
    </Screen>
  );
}
