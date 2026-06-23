import { store } from './store.js';
import { getEl } from './utils.js';
import { fetchModels } from './api.js';
import { populateSelects, setStatus, updateModelStatus, renderModelError, removeModelError } from './render.js';

export function showSettings() {
  getEl('api-key-input').value = store.get('apiKey');
  getEl('mgmt-key-input').value = store.get('mgmtKey');
  getEl('base-url-input').value = store.get('baseURL');
  const rememberCheck = getEl('remember-key');
  if (rememberCheck) rememberCheck.checked = store.get('rememberKey');
  getEl('settings-modal').classList.add('active');
}

export function closeSettings() {
  getEl('settings-modal').classList.remove('active');
}

export async function saveSettings() {
  store.set('apiKey', getEl('api-key-input').value.trim());
  store.set('mgmtKey', getEl('mgmt-key-input').value.trim());
  const bu = getEl('base-url-input').value.trim();
  if (bu) store.set('baseURL', bu.replace(/\/+$/, ''));
  const rememberCheck = getEl('remember-key');
  if (rememberCheck) store.set('rememberKey', rememberCheck.checked);

  const sel = getEl('default-model-select');
  if (sel.value) store.set('model', sel.value);

  store.saveConfig();
  closeSettings();
  setStatus('connected', 'Loading models...');
  removeModelError();

  const doFetch = async () => {
    try {
      const models = await fetchModels();
      store.set('models', models);
      store.set('imageModels', models.filter(m => m.output_modalities?.includes('image')));
      populateSelects();
      if (!store.get('model') && models.length > 0) {
        store.set('model', models[0].id);
      }
      setStatus('connected', 'Connected');
    } catch (e) {
      console.error('Failed to load models:', e);
      setStatus('disconnected', 'Check API key');
      const isCors = location.protocol === 'file:' || (e instanceof TypeError && /fetch|NetworkError|CORS/i.test(e.message));
      renderModelError(isCors);
      if (!store.get('apiKey')) setTimeout(showSettings, 500);
    }
  };

  if ('serviceWorker' in navigator && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.ready.then(doFetch);
  } else {
    doFetch();
  }
}
