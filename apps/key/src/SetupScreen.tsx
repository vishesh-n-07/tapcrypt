import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { registerKey, Session } from './api';

export default function SetupScreen({ onDone }: { onDone: (s: Session) => void }) {
  const [baseUrl, setBaseUrl] = useState(
    Platform.OS === 'web' ? 'http://127.0.0.1:8000' : 'http://10.186.230.245:8000'
  );
  const [name, setName] = useState('My Key');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      onDone(await registerKey(baseUrl.trim().replace(/\/+$/, ''), name.trim() || 'Key'));
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>TAPCRYPT Key</Text>
        <Text style={styles.sub}>Set up this device as your Key</Text>

        <Text style={styles.label}>Server address</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Key name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Set up Key</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  sub: { color: '#8b98a5', marginTop: 6, marginBottom: 20 },
  label: { color: '#94a3b8', marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#1f2937', color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  error: { color: '#f87171', marginTop: 14 },
  button: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
