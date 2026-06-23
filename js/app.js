import { store } from './store.js';
import { getEl, autoResize, debounce } from './utils.js';
import { fetchAllModels } from './api.js';
import * as render from './render.js';
import * as chat from './chat.js';
import * as platform from './platform.js';
import { showConfigManager } from './config.js';

// ---- Init ----
store.loadState();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const configs = store.get('configs');
if (configs.length) {
  loadAllModels();
} else {
  render.setStatus('disconnected', 'No API config');
  setTimeout(showConfigManager, 300);
}

// ---- Store subscribers ----
store.on('model', (model) => {
  ['header-model', 'default-model-select'].forEach(id => {
    const el = getEl(id);
    if (el) el.value = model || '';
  });
  render.updateModelStatus();
  store.saveConfig();
});

store.on('conversations', () => {
  const searchEl = getEl('history-search');
  render.renderConversations(searchEl?.value);
});

// ---- Sidebar toggle ----
getEl('sidebar-toggle').addEventListener('click', () => {
  document.querySelector('.sidebar').classList.toggle('collapsed');
});

// ---- Navigation ----
getEl('btn-settings').addEventListener('click', showConfigManager);
getEl('nav-new-btn').addEventListener('click', chat.newChat);

// ---- Model selects ----
['header-model', 'default-model-select'].forEach(id => {
  const el = getEl(id);
  if (el) {
    el.addEventListener('change', (e) => {
      if (e.target.value) store.set('model', e.target.value);
    });
  }
});

// ---- Send message ----
getEl('send-btn').addEventListener('click', chat.sendMessage);
getEl('message-input').addEventListener('input', (e) => {
  autoResize(e.target);
  render.updateSendButton();
});
getEl('message-input').addEventListener('keydown', chat.handleKeyDown);
getEl('stop-btn').addEventListener('click', chat.stopGeneration);

// ---- File attachment ----
getEl('file-input').addEventListener('change', (e) => {
  import('./image.js').then(img => img.handleFileSelect(e));
});
getEl('attach-btn').addEventListener('click', () => getEl('file-input').click());
getEl('btn-remove-image').addEventListener('click', () => {
  import('./image.js').then(img => img.removeImage());
});
getEl('message-input').addEventListener('paste', (e) => {
  import('./image.js').then(img => img.handlePaste(e));
});
getEl('message-input').addEventListener('dragover', e => e.preventDefault());
getEl('message-input').addEventListener('drop', (e) => {
  import('./image.js').then(img => img.handleDrop(e));
});

// ---- Suggestion chips ----
getEl('welcome-screen').addEventListener('click', (e) => {
  const chip = e.target.closest('.suggestion-chip');
  if (chip) chat.sendSuggestion(chip.dataset.text);
});

// ---- Conversation list ----
getEl('conversation-list').addEventListener('click', (e) => {
  const item = e.target.closest('.conversation-item');
  if (item) chat.loadConversation(item.dataset.convId);
});

// ---- History search ----
const searchInput = getEl('history-search');
if (searchInput) {
  searchInput.addEventListener('input', debounce((e) => {
    render.renderConversations(e.target.value);
  }, 150));
}

// ---- Platform buttons ----
function showPlatform(fn) {
  return (...args) => {
    render.showPlatformView();
    fn(...args);
  };
}
getEl('btn-key-usage').addEventListener('click', showPlatform(platform.showKeyUsage));

// ---- Messages container (delegated thinking toggle) ----
getEl('messages-container').addEventListener('click', (e) => {
  const toggle = e.target.closest('.thinking-toggle');
  if (toggle) {
    const block = toggle.nextElementSibling;
    if (block) block.style.display = block.style.display === 'none' ? 'block' : 'none';
  }
});

async function loadAllModels() {
  render.setStatus('connected', 'Loading models...');
  render.removeModelError();
  try {
    const { models, errors } = await fetchAllModels();
    store.set('models', models);
    store.set('imageModels', models.filter(m => m.output_modalities?.includes('image')));
    render.populateSelects();
    if (!store.get('model') && models.length > 0) {
      store.set('model', models[0].id);
    }
    const statusText = models.length
      ? `Connected (${models.length} models${errors.length ? `, ${errors.length} errors` : ''})`
      : 'No models returned';
    render.setStatus(models.length ? 'connected' : 'disconnected', statusText);
  } catch (e) {
    console.error('Failed to load models:', e);
    render.setStatus('disconnected', 'Check config');
    const isCors = location.protocol === 'file:' || (e instanceof TypeError && /fetch|NetworkError|CORS/i.test(e.message));
    render.renderModelError(isCors);
  }
}

// Retry button in sidebar
document.querySelector('.sidebar-content').addEventListener('click', (e) => {
  if (e.target.classList.contains('retry-btn')) {
    e.preventDefault();
    store.set('models', []);
    store.set('imageModels', []);
    loadAllModels();
  }
});
