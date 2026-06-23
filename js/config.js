import { store } from './store.js';
import { getEl, escapeHtml } from './utils.js';
import { fetchAllModels, getCurrentKeyLabel } from './api.js';
import { populateSelects, setStatus, removeModelError } from './render.js';

let _modal = null;
let _lastFocus = null;
let _expandedConfigId = null;

export function showConfigManager() {
  _lastFocus = document.activeElement;
  renderModal();
  _modal.classList.add('active');
}

export function closeConfigManager() {
  if (_modal) _modal.classList.remove('active');
  if (_lastFocus) _lastFocus.focus();
}

function renderModal() {
  if (!_modal) {
    _modal = document.createElement('div');
    _modal.className = 'modal-overlay';
    _modal.id = 'config-modal';
    _modal.addEventListener('click', (e) => {
      if (e.target === _modal) closeConfigManager();
    });
    document.body.appendChild(_modal);
  }
  _modal.innerHTML = `
    <div class="modal-card config-modal-card">
      <div class="config-modal-header">
        <h2>API Configurations</h2>
        <button class="config-close-btn" id="config-close-btn">&times;</button>
      </div>
      <div class="config-list" id="config-list"></div>
      <div class="config-form" id="config-form">
        <input type="text" id="cfg-name" placeholder="Name (e.g. Primary, Work)" class="config-input">
        <input type="password" id="cfg-apikey" placeholder="API Key" class="config-input">
        <input type="text" id="cfg-baseurl" placeholder="API Base URL (default: https://zenmux.ai/api/v1)" class="config-input">
        <button class="button-primary" id="cfg-add-btn" style="width:100%">Add Configuration</button>
      </div>
      <div class="config-actions">
        <button class="button-subtle" id="config-done-btn">Done</button>
      </div>
    </div>
  `;

  getEl('config-close-btn').addEventListener('click', closeConfigManager);
  getEl('config-done-btn').addEventListener('click', () => {
    closeConfigManager();
    loadAllConfigs();
  });
  getEl('cfg-add-btn').addEventListener('click', addConfigFromForm);
  getEl('cfg-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') addConfigFromForm(); });
  getEl('cfg-apikey').addEventListener('keydown', (e) => { if (e.key === 'Enter') addConfigFromForm(); });

  renderConfigList();
}

function toggleConfigExpand(id) {
  _expandedConfigId = _expandedConfigId === id ? null : id;
  renderConfigList();
}

function renderKeyList(cfg) {
  if (_expandedConfigId !== cfg.id) return '';
  const keys = cfg.apiKeys || [];
  if (keys.length === 0) return '<div class="cfg-keys-empty">No keys in this configuration.</div>';

  let html = '<div class="cfg-keys-list">';
  keys.forEach((k, i) => {
    const isActive = i === (cfg.currentKeyIndex || 0);
    const statusDot = k.status === 'rate_limited' ? '🔴' : (k.status === 'active' ? '🟢' : '⚪');
    const usage = k.usage || {};
    html += `
      <div class="cfg-key-item${isActive ? ' active-key' : ''}">
        <div class="cfg-key-header">
          <span class="cfg-key-dot">${statusDot}</span>
          <span class="cfg-key-masked">${k.label || '••••' + k.key.slice(-4)}</span>
          <span class="cfg-key-status">${k.status === 'rate_limited' ? 'Rate limited' : 'Active'}</span>
        </div>
        <div class="cfg-key-usage">
          <span>${usage.requests || 0} req</span>
          <span>${usage.totalTokens || 0} tok</span>
          <span>${usage.errors || 0} err</span>
          ${usage.lastUsed ? '<span>' + new Date(usage.lastUsed).toLocaleTimeString() + '</span>' : ''}
        </div>
        <div class="cfg-key-actions">
          ${isActive ? '<span class="cfg-rotating-badge">In rotation</span>' : ''}
          <input type="text" class="cfg-key-label-input" value="${escapeHtml(k.label || '')}" placeholder="Label" data-cfg-id="${escapeHtml(cfg.id)}" data-key-idx="${i}">
          <button class="cfg-key-reset-btn" data-cfg-id="${escapeHtml(cfg.id)}" data-key-idx="${i}" title="Reset usage">↺</button>
          <button class="cfg-key-remove-btn" data-cfg-id="${escapeHtml(cfg.id)}" data-key-idx="${i}" title="Remove key">&times;</button>
        </div>
      </div>`;
  });
  html += '</div>';

  html += `
    <div class="cfg-add-key-form">
      <input type="password" class="cfg-new-key-input" placeholder="Add another API key..." data-cfg-id="${escapeHtml(cfg.id)}">
      <button class="cfg-add-key-btn" data-cfg-id="${escapeHtml(cfg.id)}">+ Key</button>
    </div>`;

  return html;
}

function renderConfigList() {
  const list = getEl('config-list');
  if (!list) return;
  const configs = store.get('configs');
  const activeId = store.get('activeConfigId');

  if (!configs.length) {
    list.innerHTML = '<div class="config-empty">No configurations yet. Add one below.</div>';
    return;
  }

  list.innerHTML = configs.map(c => {
    const totalKeys = c.apiKeys?.length || 0;
    const activeKeys = c.apiKeys?.filter(k => k.status === 'active').length || 0;
    const expanded = _expandedConfigId === c.id ? ' expanded' : '';
    return `
    <div class="config-item${c.id === activeId ? ' active' : ''}${expanded}" data-id="${escapeHtml(c.id)}">
      <div class="config-item-main" data-toggle-expand="${escapeHtml(c.id)}">
        <div class="config-item-info">
          <div class="config-item-name">${escapeHtml(c.name)}</div>
          <div class="config-item-detail">${escapeHtml(c.baseURL || 'https://zenmux.ai/api/v1')}</div>
          <div class="config-item-detail">${totalKeys} key${totalKeys !== 1 ? 's' : ''} (${activeKeys} active)</div>
        </div>
        <div class="config-item-actions">
          ${c.id !== activeId ? `<button class="config-activate-btn" data-id="${escapeHtml(c.id)}">Activate</button>` : '<span class="config-active-badge">Active</span>'}
          <button class="config-delete-btn" data-id="${escapeHtml(c.id)}" title="Remove">&times;</button>
        </div>
      </div>
      ${renderKeyList(c)}
    </div>`;
  }).join('');

  list.querySelectorAll('.config-activate-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.setActiveConfig(btn.dataset.id);
      renderConfigList();
    });
  });

  list.querySelectorAll('.config-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.removeConfig(btn.dataset.id);
      renderConfigList();
    });
  });

  list.querySelectorAll('[data-toggle-expand]').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.config-item-actions')) return;
      toggleConfigExpand(el.dataset.toggleExpand);
    });
  });

  list.querySelectorAll('.cfg-key-remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.removeKeyFromConfig(btn.dataset.cfgId, parseInt(btn.dataset.keyIdx, 10));
      renderConfigList();
    });
  });

  list.querySelectorAll('.cfg-key-reset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.resetKeyUsage(btn.dataset.cfgId, parseInt(btn.dataset.keyIdx, 10));
      renderConfigList();
    });
  });

  list.querySelectorAll('.cfg-key-label-input').forEach(inp => {
    inp.addEventListener('change', (e) => {
      e.stopPropagation();
      store.updateKeyLabel(inp.dataset.cfgId, parseInt(inp.dataset.keyIdx, 10), inp.value.trim());
    });
  });

  list.querySelectorAll('.cfg-add-key-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cfgId = btn.dataset.cfgId;
      const input = document.querySelector(`.cfg-new-key-input[data-cfg-id="${cfgId}"]`);
      if (!input || !input.value.trim()) return;
      store.addKeyToConfig(cfgId, input.value.trim());
      input.value = '';
      renderConfigList();
    });
  });

  list.querySelectorAll('.cfg-new-key-input').forEach(inp => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.stopPropagation();
        const cfgId = inp.dataset.cfgId;
        if (!inp.value.trim()) return;
        store.addKeyToConfig(cfgId, inp.value.trim());
        inp.value = '';
        renderConfigList();
      }
    });
  });
}

function addConfigFromForm() {
  const name = getEl('cfg-name').value.trim();
  const apiKey = getEl('cfg-apikey').value.trim();
  const baseURL = getEl('cfg-baseurl').value.trim() || 'https://zenmux.ai/api/v1';

  if (!apiKey) {
    getEl('cfg-apikey').focus();
    return;
  }

  store.addConfig({ name: name || apiKey.slice(0, 12), apiKey, mgmtKey: '', baseURL });

  getEl('cfg-name').value = '';
  getEl('cfg-apikey').value = '';
  getEl('cfg-baseurl').value = '';
  getEl('cfg-name').focus();
  renderConfigList();
}

async function loadAllConfigs() {
  const configs = store.get('configs');
  if (!configs.length) return;

  setStatus('connected', 'Loading models...');
  removeModelError();

  try {
    const { models, errors } = await fetchAllModels();
    store.set('models', models);
    store.set('imageModels', models.filter(m => m.output_modalities?.includes('image')));
    populateSelects();
    if (!store.get('model') && models.length > 0) {
      store.set('model', models[0].id);
    }
    const statusText = models.length
      ? `Connected (${models.length} models${errors.length ? `, ${errors.length} failed` : ''})`
      : 'No models found';
    setStatus(models.length ? 'connected' : 'disconnected', statusText);
  } catch (e) {
    setStatus('disconnected', 'Connection failed');
  }
}
