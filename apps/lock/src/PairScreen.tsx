import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { pairLock, Session } from './api';

export default function PairScreen({ onPaired }: { onPaired: (s: Session) => void }) {
  const [baseUrl, setBaseUrl] = useState('http://10.186.230.245:8000');
  const [name, setName] = useState('Front Door');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (code.length !== 6) {
      setError('Enter the 6-digit code shown on your Key.');
      return;
    }
    setBusy(true);
    try {
      const s = await pairLock(baseUrl.trim().replace(/\/+$/, ''), name.trim() || 'Lock', code);
      onPaired(s);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Pair this Lock</Text>
      <Text style={styles.sub}>Get a code from your TAPCRYPT Key</Text>

      <Text style={styles.label}>Server address</Text>
      <TextInput
        style={styles.input}
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={styles.label}>Lock name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} />

      <Text style={styles.label}>Pairing code</Text>
      <TextInput
        style={[styles.input, styles.code]}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor="#475569"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Pair</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  sub: { color: '#8b98a5', marginTop: 6, marginBottom: 20 },
  label: { color: '#94a3b8', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#1f2937',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  code: { fontSize: 28, letterSpacing: 8, textAlign: 'center' },
  error: { color: '#f87171', marginTop: 14 },
  button: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
