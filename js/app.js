import { store } from './store.js';
import { getEl, autoResize } from './utils.js';
import { fetchModels } from './api.js';
import * as render from './render.js';
import * as chat from './chat.js';
import * as image from './image.js';
import * as platform from './platform.js';
import { showSettings, closeSettings, saveSettings } from './settings.js';

// ---- Init ----
store.loadState();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

render.setStatus(store.get('apiKey') ? 'connected' : 'disconnected', store.get('apiKey') ? 'Ready' : 'No API key');
render.renderConversations();

function loadModels() {
  if (!store.get('apiKey')) {
    setTimeout(showSettings, 300);
    return;
  }
  const apiRoot = store.get('baseURL') || '/api/v1';
  console.log('[APP] Loading models from:', apiRoot + '/models', 'hostname:', location.hostname);
  fetchModels()
    .then(models => {
      store.set('models', models);
      store.set('imageModels', models.filter(m => m.output_modalities?.includes('image')));
      render.populateSelects();
      if (!store.get('model') && models.length > 0) {
        store.set('model', models[0].id);
      }
      render.removeModelError();
      render.setStatus('connected', 'Connected');
    })
    .catch(e => {
      console.error('Failed to load models:', e);
      render.setStatus('disconnected', 'Check API key');
      const isCors = location.protocol === 'file:' || (e instanceof TypeError && /fetch|NetworkError|CORS/i.test(e.message));
      render.renderModelError(isCors);
      if (!store.get('apiKey')) setTimeout(showSettings, 500);
    });
}

if (store.get('apiKey')) {
  loadModels();
} else {
  setTimeout(showSettings, 300);
}

// ---- Store subscribers ----
store.on('model', (model) => {
  ['header-model', 'sidebar-model', 'default-model-select'].forEach(id => {
    const el = getEl(id);
    if (el) el.value = model || '';
  });
  render.updateModelStatus();
  store.saveConfig();
});

store.on('conversations', () => {
  render.renderConversations();
});

// ---- Navigation ----
getEl('btn-settings').addEventListener('click', showSettings);
getEl('nav-new-btn').addEventListener('click', chat.newChat);

// ---- Model selects ----
['header-model', 'sidebar-model', 'default-model-select'].forEach(id => {
  const el = getEl(id);
  if (el) {
    el.addEventListener('change', (e) => {
      if (e.target.value) store.set('model', e.target.value);
    });
  }
});

// ---- Temperature slider ----
getEl('temperature').addEventListener('input', (e) => {
  getEl('temp-val').textContent = e.target.value;
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
getEl('file-input').addEventListener('change', image.handleFileSelect);
getEl('attach-btn').addEventListener('click', () => getEl('file-input').click());
getEl('btn-remove-image').addEventListener('click', image.removeImage);
getEl('message-input').addEventListener('paste', image.handlePaste);
getEl('message-input').addEventListener('dragover', e => e.preventDefault());
getEl('message-input').addEventListener('drop', image.handleDrop);

// ---- Settings modal ----
getEl('settings-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeSettings();
});
getEl('btn-settings-cancel').addEventListener('click', closeSettings);
getEl('btn-settings-save').addEventListener('click', saveSettings);

// ---- Sidebar tabs ----
document.querySelector('.sidebar-tabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.sidebar-tab');
  if (tab) render.switchPane(tab.dataset.pane);
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

// ---- Platform buttons ----
getEl('btn-flow-rate').addEventListener('click', platform.fetchFlowRate);
getEl('btn-balance').addEventListener('click', platform.fetchBalance);
getEl('btn-subscription-btn').addEventListener('click', platform.fetchSubscription);

// ---- Image generation ----
getEl('btn-generate-image').addEventListener('click', image.generateImage);
getEl('img-prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    image.generateImage();
  }
});

// ---- Image gallery (delegated download) ----
getEl('image-gallery').addEventListener('click', (e) => {
  const btn = e.target.closest('.download-btn');
  if (btn) image.downloadImage(btn.dataset.src, parseInt(btn.dataset.index, 10));
});

// ---- Messages container (delegated thinking toggle) ----
getEl('messages-container').addEventListener('click', (e) => {
  const toggle = e.target.closest('.thinking-toggle');
  if (toggle) {
    const block = toggle.nextElementSibling;
    if (block) block.style.display = block.style.display === 'none' ? 'block' : 'none';
  }
});

// ---- Retry button (delegated in sidebar) ----
document.querySelector('.sidebar-content').addEventListener('click', (e) => {
  if (e.target.classList.contains('retry-btn')) {
    e.preventDefault();
    store.set('models', []);
    store.set('imageModels', []);
    render.setStatus('connected', 'Loading models...');
    fetchModels()
      .then(models => {
        store.set('models', models);
        store.set('imageModels', models.filter(m => m.output_modalities?.includes('image')));
        render.populateSelects();
        if (!store.get('model') && models.length > 0) {
          store.set('model', models[0].id);
        }
        render.removeModelError();
        render.setStatus('connected', 'Connected');
      })
      .catch(e => {
        render.setStatus('disconnected', 'Check API key');
      });
  }
});
