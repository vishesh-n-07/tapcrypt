import * as SecureStore from 'expo-secure-store';

export type Session = { baseUrl: string; deviceId: string; token: string };

const STORE_KEY = 'tapcrypt_lock_session';

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session) {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(s));
}

export async function clearSession() {
  await SecureStore.deleteItemAsync(STORE_KEY);
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
    throw new Error("Can't reach the server. Check the address and that you're on the same Wi-Fi.");
  } finally {
    clearTimeout(timer);
  }
}

export async function pairLock(baseUrl: string, name: string, code: string): Promise<Session> {
  const reg = await call(baseUrl, '/devices/register', {
    method: 'POST',
    body: { role: 'lock', name },
  });
  if (!reg.ok) throw new Error('Could not register this device.');

  const claim = await call(baseUrl, '/pair/claim', {
    method: 'POST',
    token: reg.data.token,
    body: { code },
  });
  if (!claim.ok) {
    throw new Error(typeof claim.data.detail === 'string' ? claim.data.detail : 'Pairing failed.');
  }

  const session = { baseUrl, deviceId: reg.data.device_id, token: reg.data.token };
  await saveSession(session);
  return session;
}
