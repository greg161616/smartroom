import React from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDevice } from '../contexts/DeviceContext';
import { useTheme, Txt, Card, Button, styles } from './ui';

export function Screen({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const { data, error, loading, busy, load } = useDevice();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{
        flex: 1,
        backgroundColor: t.bg,
      }}
    >
      <View
        style={[
          styles.header,
          { borderColor: t.line },
        ]}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Txt muted>SMARTROOM</Txt>
          <Txt big>{title}</Txt>
        </View>

        <Button
          label="Refresh"
          secondary
          disabled={loading || busy}
          onPress={() => void load()}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading && !data}
            onRefresh={() => void load()}
            tintColor={t.accent}
          />
        }
      >
        {error ? (
          <Card>
            <Txt color={t.bad}>
              Cloud refresh failed: {error}
            </Txt>

            <Txt muted>
              Displayed data may be outdated.
              Controls are disabled until reconnection.
            </Txt>

            <Button
              label="Retry"
              onPress={() => void load()}
            />
          </Card>
        ) : null}

        {!data ? (
          <Txt muted>
            {loading
              ? 'Loading room…'
              : 'Room unavailable. Tap Refresh.'}
          </Txt>
        ) : null}

        {children}
      </ScrollView>
    </SafeAreaView>
  );
}