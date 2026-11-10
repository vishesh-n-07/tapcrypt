import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { clearSession, loadSession, Session } from './src/api';
import HomeScreen from './src/HomeScreen';
import SetupScreen from './src/SetupScreen';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    loadSession().then(setSession);
  }, []);

  if (session === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#4ade80" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      {session === null ? (
        <SetupScreen onDone={setSession} />
      ) : (
        <HomeScreen
          session={session}
          onUnregister={async () => {
            await clearSession();
            setSession(null);
          }}
        />
      )}
    </>
  );
}
