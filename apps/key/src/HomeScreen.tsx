import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { call, Session } from './api';

type Req = {
  request_id: string;
  lock_name: string;
  status: 'pending' | 'failed';
  sequence: string | null;
  seconds_left: number;
};
type ReqView = Req & { deadline: number };
type LockInfo = { lock_id: string; name: string; waiting: boolean; locked_out_seconds: number };

function confirmAction(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Confirm', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Remove', style: 'destructive', onPress: () => resolve(true) },
    ])
  );
}

export default function HomeScreen({ session, onUnregister }: { session: Session; onUnregister: () => void }) {
  const { baseUrl, token } = session;
  const [reqs, setReqs] = useState<ReqView[]>([]);
  const [locks, setLocks] = useState<LockInfo[]>([]);
  const [now, setNow] = useState(Date.now());
  const [offline, setOffline] = useState(false);
  const [code, setCode] = useState<{ value: string; deadline: number } | null>(null);
  const [note, setNote] = useState(''); const [pairedMsg, setPairedMsg] = useState(''); const knownIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const [a, l] = await Promise.all([
          call(baseUrl, '/access/pending', { token }),
          call(baseUrl, '/locks', { token }),
        ]);
        if (!alive) return;
        setOffline(false);
        if (a.ok) {
          setReqs(a.data.requests.map((q: Req) => ({ ...q, deadline: Date.now() + q.seconds_left * 1000 })));
        } else if (a.status === 401) {
          setNote('This Key is no longer valid. Unregister and set up again.');
        }
        if (l.ok) { const added = knownIds.current ? l.data.locks.filter((x: LockInfo) => !knownIds.current!.has(x.lock_id)) : []; knownIds.current = new Set(l.data.locks.map((x: LockInfo) => x.lock_id)); if (added.length) { setCode(null); setPairedMsg('Lock paired successfully: ' + added.map((x: LockInfo) => x.name).join(', ')); setTimeout(() => setPairedMsg(''), 8000); } setLocks(l.data.locks); }
      } catch {
        if (alive) setOffline(true);
      }
    };
    poll();
    const p = setInterval(poll, 1500);
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => {
      alive = false;
      clearInterval(p);
      clearInterval(t);
    };
  }, [baseUrl, token]);

  const getCode = async () => {
    setNote('');
    try {
      const r = await call(baseUrl, '/pair/code', { method: 'POST', token });
      if (r.ok) { setPairedMsg(''); setCode({ value: r.data.code, deadline: Date.now() + 300000 }); }
      else setNote('Could not create a pairing code.');
    } catch (e: any) {
      setNote(e.message);
    }
  };

  const approveTest = async (id: string) => {
    setNote('');
    try {
      const r = await call(baseUrl, `/access/${id}/approve-biometric`, {
        method: 'POST',
        token,
        body: { biometric_verified: true },
      });
      setNote(r.ok && r.data.result === 'unlocked' ? 'Approved. The lock should open.' : 'Could not approve.');
    } catch (e: any) {
      setNote(e.message);
    }
  };

  const removeLock = async (l: LockInfo) => {
    if (!(await confirmAction(`Remove "${l.name}"? It will no longer be able to request access.`))) return;
    try {
      const r = await call(baseUrl, `/locks/${l.lock_id}`, { method: 'DELETE', token });
      if (r.ok) {
        setLocks((prev) => prev.filter((x) => x.lock_id !== l.lock_id));
        setNote(`${l.name} removed.`);
      } else {
        setNote('Could not remove that lock.');
      }
    } catch (e: any) {
      setNote(e.message);
    }
  };

  const codeLeft = code ? Math.max(0, Math.ceil((code.deadline - now) / 1000)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#0b0f14' }} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>TAPCRYPT Key</Text>
        <Text style={styles.sub}>{session.name}</Text>
        {offline ? <Text style={styles.offline}>Can't reach the server...</Text> : null}

        <Text style={styles.section}>Access requests</Text>
        {reqs.length === 0 ? (
          <View style={styles.box}>
            <Text style={styles.muted}>No pending requests</Text>
            <Text style={styles.mutedSmall}>When a lock asks to open, its code appears here.</Text>
          </View>
        ) : (
          reqs.map((r) => {
            const left = Math.max(0, Math.ceil((r.deadline - now) / 1000));
            return (
              <View key={r.request_id} style={[styles.box, { marginBottom: 12 }]}>
                <Text style={styles.lockName}>{r.lock_name}</Text>
                <Text style={styles.asking}>is asking to open</Text>
                {r.status === 'pending' && r.sequence ? (
                  <>
                    <Text style={styles.seq}>
                      {r.sequence.split('').map((c) => (c === '.' ? '•' : '▬')).join('  ')}
                    </Text>
                    <Text style={styles.words}>
                      {r.sequence.split('').map((c) => (c === '.' ? 'short' : 'LONG')).join(' · ')}
                    </Text>
                    <Text style={[styles.timer, left <= 10 && { color: '#f87171' }]}>{left}s left</Text>
                  </>
                ) : (
                  <Text style={styles.failed}>Too many wrong attempts on this lock.</Text>
                )}
                {Platform.OS === 'web' ? (
                  <Pressable style={styles.approve} onPress={() => approveTest(r.request_id)}>
                    <Text style={styles.approveText}>Approve (dev test, no biometrics on web)</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}

        {note ? <Text style={styles.note}>{note}</Text> : null}

        <Text style={styles.section}>My locks ({locks.length})</Text>
        {locks.length === 0 ? (
          <View style={styles.box}>
            <Text style={styles.muted}>No locks paired yet</Text>
          </View>
        ) : (
          locks.map((l) => (
            <View key={l.lock_id} style={styles.lockRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{l.name}</Text>
                {l.locked_out_seconds > 0 ? (
                  <Text style={[styles.chip, { color: '#f87171' }]}>Locked out ({l.locked_out_seconds}s)</Text>
                ) : l.waiting ? (
                  <Text style={[styles.chip, { color: '#fbbf24' }]}>Waiting for code</Text>
                ) : (
                  <Text style={[styles.chip, { color: '#64748b' }]}>Ready</Text>
                )}
              </View>
              <Pressable style={styles.remove} onPress={() => removeLock(l)}>
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))
        )}

        <Text style={styles.section}>Pair a new lock</Text>{pairedMsg ? <Text style={styles.success}>{pairedMsg}</Text> : null}
        <View style={styles.box}>
          {code && codeLeft > 0 ? (
            <>
              <Text style={styles.code}>{code.value}</Text>
              <Text style={styles.mutedSmall}>Type this on the lock. Expires in {codeLeft}s.</Text>
            </>
          ) : null}
          <Pressable style={styles.button} onPress={getCode}>
            <Text style={styles.buttonText}>{code && codeLeft > 0 ? 'New code' : 'Get pairing code'}</Text>
          </Pressable>
        </View>

        <Pressable style={styles.unreg} onPress={onUnregister}>
          <Text style={styles.unregText}>Unregister this Key</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', padding: 24, paddingTop: 48 },
  card: { width: '100%', maxWidth: 460 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  sub: { color: '#8b98a5', marginTop: 4, marginBottom: 8 },
  offline: { color: '#fbbf24', marginBottom: 8 },
  section: { color: '#94a3b8', fontSize: 14, marginTop: 22, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  box: { backgroundColor: '#111827', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#1f2937', alignItems: 'center' },
  muted: { color: '#cbd5e1', fontSize: 16 },
  mutedSmall: { color: '#64748b', marginTop: 6, textAlign: 'center' },
  lockName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  asking: { color: '#94a3b8', fontSize: 14, marginBottom: 12 },
  seq: { color: '#4ade80', fontSize: 34, letterSpacing: 2, textAlign: 'center' },
  words: { color: '#cbd5e1', marginTop: 10, textAlign: 'center' },
  timer: { color: '#4ade80', fontSize: 20, fontWeight: '700', marginTop: 14 },
  failed: { color: '#f87171', fontSize: 16, textAlign: 'center' },
  approve: { marginTop: 16, backgroundColor: '#1f2937', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  approveText: { color: '#cbd5e1', fontSize: 13 },
  note: { color: '#fbbf24', marginTop: 12 }, success: { color: '#4ade80', fontSize: 16, fontWeight: '600', marginBottom: 10 },
  lockRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1f2937', marginBottom: 8 },
  rowName: { color: '#fff', fontSize: 17, fontWeight: '600' },
  chip: { marginTop: 4, fontSize: 13 },
  remove: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#1f2937' },
  removeText: { color: '#f87171', fontSize: 14 },
  code: { color: '#fff', fontSize: 40, fontWeight: '700', letterSpacing: 8, marginBottom: 4 },
  button: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28, marginTop: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  unreg: { marginTop: 32, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 22, borderRadius: 20, backgroundColor: '#1f2937' },
  unregText: { color: '#94a3b8' },
});

