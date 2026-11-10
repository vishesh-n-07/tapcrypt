import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { call, Session } from './api';

type Phase = 'idle' | 'active' | 'unlocked' | 'locked_out' | 'expired';
type Timer = ReturnType<typeof setTimeout> | null;

export default function LockScreen({ session }: { session: Session }) {
  const { baseUrl, token } = session;

  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [pressing, setPressing] = useState(false);
  const [seqLen, setSeqLen] = useState(8);
  const [attemptsLeft, setAttemptsLeft] = useState(5);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [lockoutLeft, setLockoutLeft] = useState(0);

  const symbolsRef = useRef<string[]>([]);
  const submitting = useRef(false);
  const requestId = useRef('');
  const deadline = useRef(0);
  const longMs = useRef(250);
  const idleMs = useRef(5000);
  const pressStart = useRef(0);
  const longTimer = useRef<Timer>(null);
  const idleTimer = useRef<Timer>(null);

  const setSyms = (arr: string[]) => {
    symbolsRef.current = arr;
    setSymbols(arr);
  };

  const clearIdle = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
  };

  const startIdle = () => {
    clearIdle();
    idleTimer.current = setTimeout(() => {
      setSyms([]);
      setMessage('Timed out. Start the sequence again.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, idleMs.current);
  };

  const beginLockout = (seconds: number) => {
    clearIdle();
    setLockoutLeft(seconds);
    setPhase('locked_out');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  };

  const onUnlocked = () => {
    clearIdle();
    setPhase('unlocked');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const startRequest = async () => {
    setBusy(true);
    setMessage('');
    try {
      const st = await call(baseUrl, '/settings', { token });
      if (st.ok) {
        longMs.current = st.data.long_press_ms;
        idleMs.current = st.data.idle_timeout_seconds * 1000;
      }
      const r = await call(baseUrl, '/access/request', { method: 'POST', token });
      if (r.status === 201) {
        requestId.current = r.data.request_id;
        deadline.current = Date.now() + r.data.ttl_seconds * 1000;
        setSeqLen(r.data.sequence_length);
        setAttemptsLeft(r.data.max_attempts);
        setSecondsLeft(r.data.ttl_seconds);
        setSyms([]);
        submitting.current = false;
        setPhase('active');
      } else if (r.status === 423) {
        beginLockout(r.data?.detail?.retry_after ?? 60);
      } else if (r.status === 429) {
        setMessage('Too fast. Wait a moment and try again.');
      } else if (r.status === 409) {
        setMessage('This lock is not paired. Unpair and pair again.');
      } else if (r.status === 401) {
        setMessage('Session no longer valid. Unpair and pair again.');
      } else {
        setMessage('Something went wrong. Try again.');
      }
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  };

  // countdown + check if the Key approved (biometric) while waiting
  useEffect(() => {
    if (phase !== 'active') return;
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearIdle();
        setPhase('expired');
      }
    }, 500);
    const poll = setInterval(async () => {
      try {
        const r = await call(baseUrl, `/access/${requestId.current}/status`, { token });
        if (!r.ok) return;
        if (r.data.unlocked) onUnlocked();
        else if (['expired', 'superseded', 'cancelled'].includes(r.data.status)) setPhase('expired');
      } catch {}
    }, 1500);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [phase]);

  // lockout countdown
  useEffect(() => {
    if (phase !== 'locked_out') return;
    const t = setInterval(() => {
      setLockoutLeft((n) => {
        if (n <= 1) {
          setPhase('idle');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // return to start after unlock
  useEffect(() => {
    if (phase !== 'unlocked') return;
    const t = setTimeout(() => setPhase('idle'), 4000);
    return () => clearTimeout(t);
  }, [phase]);

  const submit = async (seq: string[]) => {
    submitting.current = true;
    clearIdle();
    try {
      const r = await call(baseUrl, `/access/${requestId.current}/verify`, {
        method: 'POST',
        token,
        body: { sequence: seq.join('') },
      });
      const res = r.data?.result;
      if (res === 'unlocked') {
        onUnlocked();
      } else if (res === 'wrong') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setAttemptsLeft(r.data.attempts_left);
        setMessage(`Wrong code. ${r.data.attempts_left} attempts left.`);
        setSyms([]);
      } else if (res === 'locked_out') {
        beginLockout(r.data.retry_after ?? 60);
      } else if (res === 'expired' || res === 'not_pending') {
        setPhase('expired');
      } else {
        setMessage('Could not verify. Try again.');
        setSyms([]);
      }
    } catch (e: any) {
      setMessage(e.message);
      setSyms([]);
    } finally {
      submitting.current = false;
    }
  };

  const onPressIn = () => {
    if (phase !== 'active' || submitting.current) return;
    clearIdle();
    setMessage('');
    pressStart.current = Date.now();
    setPressing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    longTimer.current = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, longMs.current);
  };

  const onPressOut = () => {
    if (!pressStart.current) return;
    if (longTimer.current) clearTimeout(longTimer.current);
    setPressing(false);
    const held = Date.now() - pressStart.current;
    pressStart.current = 0;
    const next = [...symbolsRef.current, held >= longMs.current ? '-' : '.'];
    setSyms(next);
    if (next.length >= seqLen) submit(next);
    else startIdle();
  };

  const goIdle = () => {
    clearIdle();
    setSyms([]);
    setMessage('');
    setPhase('idle');
  };

  if (phase === 'unlocked') {
    return (
      <View style={[styles.container, { backgroundColor: '#052e16' }]}>
        <StatusBar style="light" />
        <Text style={styles.bigIcon}>🔓</Text>
        <Text style={[styles.title, { color: '#4ade80' }]}>UNLOCKED</Text>
      </View>
    );
  }

  if (phase === 'locked_out') {
    return (
      <View style={[styles.container, { backgroundColor: '#450a0a' }]}>
        <StatusBar style="light" />
        <Text style={styles.bigIcon}>⛔</Text>
        <Text style={[styles.title, { color: '#f87171' }]}>LOCKED OUT</Text>
        <Text style={styles.sub}>Too many wrong attempts</Text>
        <Text style={styles.countdown}>{lockoutLeft}s</Text>
      </View>
    );
  }

  if (phase === 'expired') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.bigIcon}>⌛</Text>
        <Text style={[styles.title, { color: '#fbbf24' }]}>Code expired</Text>
        <Pressable style={styles.primary} onPress={startRequest} disabled={busy}>
          <Text style={styles.primaryText}>Request again</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={goIdle}>
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'idle') {
    return (
      <View style={styles.container}>
        <StatusBar style="light" />
        <Text style={styles.bigIcon}>🔒</Text>
        <Text style={styles.title}>TAPCRYPT Lock</Text>
        <Text style={styles.sub}>Locked</Text>
        {message ? <Text style={styles.error}>{message}</Text> : null}
        <Pressable style={[styles.primary, busy && { opacity: 0.6 }]} onPress={startRequest} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Request access</Text>}
        </Pressable>
      </View>
    );
  }

  // phase === 'active'
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>Enter your code</Text>
      <Text style={styles.sub}>Tap the sequence shown on your Key</Text>
      <Text style={[styles.timer, secondsLeft <= 10 && { color: '#f87171' }]}>{secondsLeft}s left</Text>

      <View style={styles.slots}>
        {Array.from({ length: seqLen }).map((_, i) => (
          <View key={i} style={[styles.slot, symbols[i] && styles.slotFilled]}>
            <Text style={styles.slotText}>{symbols[i] === '.' ? '•' : symbols[i] === '-' ? '▬' : ''}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.attempts}>Attempts left: {attemptsLeft}</Text>
      <Text style={styles.message}>{message || ' '}</Text>

      <Pressable onPressIn={onPressIn} onPressOut={onPressOut} style={[styles.pad, pressing && styles.padActive]}>
        <Text style={styles.padText}>{pressing ? 'HOLD...' : 'TAP'}</Text>
      </Pressable>

      <Pressable style={styles.secondary} onPress={goIdle}>
        <Text style={styles.secondaryText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b0f14', alignItems: 'center', justifyContent: 'center', padding: 24 },
  bigIcon: { fontSize: 72, marginBottom: 12 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  sub: { color: '#8b98a5', marginTop: 6, marginBottom: 12 },
  countdown: { color: '#fff', fontSize: 56, fontWeight: '700', marginTop: 16 },
  timer: { color: '#4ade80', fontSize: 18, fontWeight: '600', marginBottom: 16 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 12 },
  slot: { width: 34, height: 44, borderRadius: 8, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
  slotFilled: { borderColor: '#4ade80' },
  slotText: { color: '#4ade80', fontSize: 20 },
  attempts: { color: '#94a3b8', marginTop: 4 },
  message: { color: '#f87171', marginTop: 6, marginBottom: 18, minHeight: 20, textAlign: 'center' },
  error: { color: '#f87171', marginBottom: 12, textAlign: 'center' },
  pad: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#1f2937', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#334155' },
  padActive: { backgroundColor: '#166534', borderColor: '#4ade80' },
  padText: { color: '#fff', fontSize: 24, fontWeight: '700' },
  primary: { backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginTop: 20, minWidth: 220, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  secondary: { marginTop: 22, paddingVertical: 10, paddingHorizontal: 26, borderRadius: 22, backgroundColor: '#1f2937' },
  secondaryText: { color: '#cbd5e1', fontSize: 16 },
});
