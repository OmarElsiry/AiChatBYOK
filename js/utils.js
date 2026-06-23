export function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

export function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

export function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getEl(id) {
  return document.getElementById(id);
}

export function getRoots(baseURL) {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const defaultRoot = isLocal ? '/api/v1' : 'https://zenmux.ai/api/v1';
  const apiRoot = (baseURL || defaultRoot).replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '/');
  const baseRoot = apiRoot.replace(/\/v1\/?$/, '');
  return { apiRoot, baseRoot };
}

export function getProtocol(modelId) {
  if (!modelId) return 'openai';
  if (modelId.startsWith('anthropic/')) return 'anthropic';
  if (modelId.startsWith('google/')) return 'vertexai';
  return 'openai';
}

export function supportsImageInput(modelId, models) {
  const m = models.find(x => x.id === modelId);
  if (!m || !m.input_modalities) return false;
  return m.input_modalities.includes('image');
}

export function groupModels(models) {
  const groups = {};
  models.forEach(m => {
    const p = m.id.split('/')[0] || 'other';
    if (!groups[p]) groups[p] = [];
    groups[p].push(m);
  });
  return groups;
}
