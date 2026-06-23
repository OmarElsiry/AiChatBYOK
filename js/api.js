import { store } from './store.js';
import { getRoots } from './utils.js';

function makeDefaultHeaders() {
  return { 'Content-Type': 'application/json' };
}

function findUsableKey(config) {
  if (!config || !config.apiKeys || config.apiKeys.length === 0) return null;
  const keys = config.apiKeys;
  const start = config.currentKeyIndex || 0;
  for (let i = 0; i < keys.length; i++) {
    const idx = (start + i) % keys.length;
    const entry = keys[idx];
    if (entry.status === 'rate_limited' && entry.rateLimitedUntil) {
      if (Date.now() > entry.rateLimitedUntil) {
        entry.status = 'active';
        entry.rateLimitedUntil = null;
      }
    }
    if (entry.status !== 'rate_limited' && entry.key) {
      config.currentKeyIndex = (idx + 1) % keys.length;
      return { keyIndex: idx, entry };
    }
  }
  const fallback = keys.find(k => k.key);
  return fallback ? { keyIndex: keys.indexOf(fallback), entry: fallback } : null;
}

function getMgmtKey(config) {
  if (config.apiKeys && config.apiKeys.length > 0) {
    const active = config.apiKeys[config.currentKeyIndex] || config.apiKeys[0];
    return active.mgmtKey || '';
  }
  return '';
}

function recordKeyUsage(config, keyIndex, usageData) {
  if (!config || !config.apiKeys || keyIndex == null) return;
  const entry = config.apiKeys[keyIndex];
  if (!entry || !entry.usage) return;
  entry.usage.requests = (entry.usage.requests || 0) + 1;
  if (usageData) {
    entry.usage.promptTokens = (entry.usage.promptTokens || 0) + (usageData.promptTokens || 0);
    entry.usage.completionTokens = (entry.usage.completionTokens || 0) + (usageData.completionTokens || 0);
    entry.usage.totalTokens = (entry.usage.totalTokens || 0) + (usageData.totalTokens || 0);
  }
  entry.usage.lastUsed = Date.now();
  store.saveConfig();
}

function markKeyError(config, keyIndex) {
  if (!config || !config.apiKeys || keyIndex == null) return;
  const entry = config.apiKeys[keyIndex];
  if (!entry || !entry.usage) return;
  entry.usage.errors = (entry.usage.errors || 0) + 1;
  store.saveConfig();
}

function markKeyRateLimited(config, keyIndex) {
  if (!config || !config.apiKeys || keyIndex == null) return;
  const entry = config.apiKeys[keyIndex];
  if (!entry) return;
  entry.status = 'rate_limited';
  entry.rateLimitedUntil = Date.now() + 60000;
  store.saveConfig();
}

export function buildHeaders() {
  const cfg = store.getActiveConfig();
  const result = makeDefaultHeaders();
  const usable = findUsableKey(cfg);
  if (usable && usable.entry.key) {
    result.Authorization = `Bearer ${usable.entry.key}`;
  }
  return result;
}

export function getCurrentKeyLabel() {
  const cfg = store.getActiveConfig();
  if (!cfg || !cfg.apiKeys) return '';
  const idx = cfg.currentKeyIndex || 0;
  const prev = idx > 0 ? idx - 1 : cfg.apiKeys.length - 1;
  const entry = cfg.apiKeys[prev];
  if (!entry) return '';
  return entry.label || entry.key.slice(-4) || '';
}

export async function fetchWithRotation(url, options = {}) {
  const cfg = store.getActiveConfig();
  if (!cfg || !cfg.apiKeys || cfg.apiKeys.length === 0) {
    return fetch(url, { ...options, headers: { ...makeDefaultHeaders(), ...options.headers } });
  }

  const maxAttempts = Math.max(cfg.apiKeys.length, 1);
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const usable = findUsableKey(cfg);
    if (!usable) throw new Error('No usable API keys available');

    const headers = { ...makeDefaultHeaders(), ...options.headers };
    if (usable.entry.key) headers.Authorization = `Bearer ${usable.entry.key}`;

    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 429) {
        markKeyRateLimited(cfg, usable.keyIndex);
        continue;
      }
      if (!res.ok) {
        markKeyError(cfg, usable.keyIndex);
        const text = await res.text();
        let msg = text;
        try { const p = JSON.parse(text); msg = p.error?.message || p.message || text; } catch (_) {}
        throw new Error(msg);
      }
      recordKeyUsage(cfg, usable.keyIndex, {});
      return res;
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = e;
      markKeyError(cfg, usable.keyIndex);
    }
  }

  throw lastErr || new Error('All API keys exhausted or failed');
}

export async function fetchModelsForConfig(config) {
  if (!config || !config.apiKeys || !config.apiKeys.some(k => k.key)) return [];
  const { apiRoot } = getRoots(config.baseURL);
  let url = `${apiRoot}/models`;
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  if (isLocal && url.includes('zenmux.ai')) {
    url = url.replace(/^https?:\/\/[^/]+/i, location.origin).replace(/^\/+/, '/');
  }

  const usable = findUsableKey(config);
  const headers = makeDefaultHeaders();
  if (usable && usable.entry.key) headers.Authorization = `Bearer ${usable.entry.key}`;

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (e) {
    if (isLocal) {
      const fallback = `${location.origin}/api/v1/models`;
      const h2 = makeDefaultHeaders();
      const u2 = findUsableKey(config);
      if (u2 && u2.entry.key) h2.Authorization = `Bearer ${u2.entry.key}`;
      res = await fetch(fallback, { headers: h2 });
    } else {
      throw e;
    }
  }

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();
  const models = d.data || [];
  models.forEach(m => {
    m._configId = config.id;
    m._configName = config.name;
  });
  return models;
}

export async function fetchAllModels() {
  const configs = store.get('configs');
  const results = [];
  const errors = [];
  for (const cfg of configs) {
    try {
      const models = await fetchModelsForConfig(cfg);
      results.push(...models);
    } catch (e) {
      errors.push({ config: cfg.name, error: e.message });
    }
  }
  return { models: results, errors };
}

export async function fetchModels() {
  const cfg = store.getActiveConfig();
  return fetchModelsForConfig(cfg || {});
}

export async function apiPost(url, body, signal) {
  const res = await fetchWithRotation(url, {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });
  return res;
}

export async function fetchManagement(endpoint) {
  const cfg = store.getActiveConfig();
  const { apiRoot } = getRoots(cfg?.baseURL);
  const mgmtKey = getMgmtKey(cfg || {});
  const headers = makeDefaultHeaders();
  if (mgmtKey) headers.Authorization = `Bearer ${mgmtKey}`;
  const res = await fetch(`${apiRoot}/management/${endpoint}`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
