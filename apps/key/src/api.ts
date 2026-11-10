import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type Session = { baseUrl: string; deviceId: string; token: string; name: string };

const STORE_KEY = 'tapcrypt_key_session';

async function getItem(k: string) {
  if (Platform.OS === 'web') return localStorage.getItem(k);
  return SecureStore.getItemAsync(k);
}
async function setItem(k: string, v: string) {
  if (Platform.OS === 'web') return localStorage.setItem(k, v);
  return SecureStore.setItemAsync(k, v);
}
async function delItem(k: string) {
  if (Platform.OS === 'web') return localStorage.removeItem(k);
  return SecureStore.deleteItemAsync(k);
}

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function clearSession() {
  await delItem(STORE_KEY);
}

type CallOpts = { method?: string; token?: string; body?: unknown };

export async function call(baseUrl: string, path: string, opts: CallOpts = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(baseUrl + path, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    throw new Error("Can't reach the server. Check the address and that the backend is running.");
  } finally {
    clearTimeout(timer);
  }
}

export async function registerKey(baseUrl: string, name: string): Promise<Session> {
  const reg = await call(baseUrl, '/devices/register', {
    method: 'POST',
    body: { role: 'key', name },
  });
  if (!reg.ok) throw new Error('Could not register this device.');
  const session = { baseUrl, deviceId: reg.data.device_id, token: reg.data.token, name };
  await setItem(STORE_KEY, JSON.stringify(session));
  return session;
}
