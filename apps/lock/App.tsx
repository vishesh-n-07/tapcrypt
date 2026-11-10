import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { clearSession, loadSession, Session } from './src/api';
import LockScreen from './src/LockScreen';
import PairScreen from './src/PairScreen';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    loadSession().then(setSession);
  }, []);

  if (session === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#4ade80" />
      </View>
    );
  }

  if (session === null) {
    return <PairScreen onPaired={setSession} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <LockScreen session={session} />
      <Pressable
        style={styles.unpair}
        onPress={async () => {
          await clearSession();
          setSession(null);
        }}
      >
        <Text style={styles.unpairText}>Unpair</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center' },
  unpair: {
    position: 'absolute',
    top: 48,
    left: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#1f2937',
  },
  unpairText: { color: '#cbd5e1' },
});


