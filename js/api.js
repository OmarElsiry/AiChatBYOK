import { store } from './store.js';
import { getRoots } from './utils.js';

export function buildHeaders(useMgmt) {
  const key = useMgmt ? store.get('mgmtKey') : store.get('apiKey');
  return {
    'Content-Type': 'application/json',
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
  };
}

export async function fetchModels() {
  const { apiRoot } = getRoots(store.get('baseURL'));
  let url = `${apiRoot}/models`;
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && url.includes('zenmux.ai')) {
    url = url.replace(/^https?:\/\/[^/]+/i, location.origin).replace(/^\/+/, '/');
  }

  console.log('[API] fetchModels url:', url);
  let res;
  try {
    res = await fetch(url, { headers: buildHeaders() });
  } catch (e) {
    if (isLocal) {
      const fallback = `${location.origin}/api/v1/models`;
      console.log('[API] First fetch failed, trying fallback:', fallback, e.message);
      res = await fetch(fallback, { headers: buildHeaders() });
    } else {
      throw e;
    }
  }
  console.log('[API] response status:', res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  return d.data || [];
}

export async function apiPost(url, body, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const p = JSON.parse(text);
      msg = p.error?.message || p.message || text;
    } catch (_) {}
    throw new Error(msg);
  }
  return res;
}

export async function fetchManagement(endpoint) {
  const { apiRoot } = getRoots(store.get('baseURL'));
  const res = await fetch(`${apiRoot}/management/${endpoint}`, {
    headers: buildHeaders(true),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
