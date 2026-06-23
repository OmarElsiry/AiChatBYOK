const MAX_CONVERSATIONS = 50;
const STORAGE_KEY = 'zmx-config';
const CONV_KEY = 'zmx-convs';

let _idCounter = Date.now();

function genId() {
  return 'cfg_' + (++_idCounter);
}

function makeKeyEntry(key, mgmtKey) {
  return {
    key: key || '',
    mgmtKey: mgmtKey || '',
    label: '',
    status: 'active',
    rateLimitedUntil: null,
    usage: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0, lastUsed: null },
  };
}

function migrateConfig(cfg) {
  if (cfg.apiKey && (!cfg.apiKeys || cfg.apiKeys.length === 0)) {
    cfg.apiKeys = [makeKeyEntry(cfg.apiKey, cfg.mgmtKey || '')];
    delete cfg.apiKey;
    delete cfg.mgmtKey;
  }
  if (cfg.apiKeys) {
    cfg.apiKeys.forEach(k => {
      if (!k.usage) k.usage = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0, lastUsed: null };
      if (!k.status) k.status = 'active';
    });
  }
  if (cfg.currentKeyIndex == null) cfg.currentKeyIndex = 0;
  return cfg;
}

const _state = {
  configs: [],
  activeConfigId: null,
  model: '',
  models: [],
  imageModels: [],
  conversations: [],
  currentConversationId: null,
  isStreaming: false,
  abortController: null,
  attachedImage: null,
};

const _listeners = {};

function _notify(key, value, old) {
  const fns = _listeners[key];
  if (fns) fns.forEach(fn => fn(value, old));
}

export const store = {
  get(key) {
    if (key === 'apiKey') {
      const cfg = this.getActiveConfig();
      return cfg?.apiKeys?.[0]?.key || '';
    }
    if (key === 'mgmtKey') {
      const cfg = this.getActiveConfig();
      return cfg?.apiKeys?.[0]?.mgmtKey || '';
    }
    if (key === 'baseURL') {
      const cfg = this.getActiveConfig();
      return cfg?.baseURL || '';
    }
    return _state[key];
  },

  set(key, value) {
    if (key === 'apiKey' || key === 'mgmtKey' || key === 'baseURL') {
      const cfg = this.getActiveConfig();
      if (cfg) {
        if (key === 'apiKey' || key === 'mgmtKey') {
          if (cfg.apiKeys && cfg.apiKeys.length > 0) {
            cfg.apiKeys[0][key] = value;
          } else {
            cfg.apiKeys = [{ key: key === 'apiKey' ? value : '', mgmtKey: key === 'mgmtKey' ? value : '', label: '', status: 'active', rateLimitedUntil: null, usage: { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0, lastUsed: null } }];
          }
        } else {
          cfg.baseURL = value;
        }
        _saveConfigs();
        _notify('configs', _state.configs);
      }
      return;
    }
    const old = _state[key];
    if (old === value) return;
    _state[key] = value;
    _notify(key, value, old);
  },

  on(key, fn) {
    if (!_listeners[key]) _listeners[key] = [];
    _listeners[key].push(fn);
    return () => {
      _listeners[key] = _listeners[key].filter(f => f !== fn);
    };
  },

  getActiveConfig() {
    return _state.configs.find(c => c.id === _state.activeConfigId) || _state.configs[0] || null;
  },

  addConfig({ name, apiKey, mgmtKey, baseURL, apiKeys }) {
    const id = genId();
    let keys;
    if (apiKeys && apiKeys.length > 0) {
      keys = apiKeys.map(k => typeof k === 'string' ? makeKeyEntry(k) : k);
    } else {
      keys = [makeKeyEntry(apiKey || '', mgmtKey || '')];
    }
    const config = { id, name: name || 'Unnamed', baseURL: baseURL || '', apiKeys: keys, currentKeyIndex: 0 };
    _state.configs.push(config);
    if (!_state.activeConfigId) _state.activeConfigId = id;
    _saveConfigs();
    _notify('configs', _state.configs);
    return id;
  },

  removeConfig(id) {
    _state.configs = _state.configs.filter(c => c.id !== id);
    if (_state.activeConfigId === id) {
      _state.activeConfigId = _state.configs[0]?.id || null;
    }
    _saveConfigs();
    _notify('configs', _state.configs);
  },

  setActiveConfig(id) {
    if (_state.configs.find(c => c.id === id)) {
      _state.activeConfigId = id;
      _saveConfigs();
      _notify('configs', _state.configs);
    }
  },

  getConfig(id) {
    return _state.configs.find(c => c.id === id) || null;
  },

  addKeyToConfig(configId, key, mgmtKey, label) {
    const cfg = _state.configs.find(c => c.id === configId);
    if (!cfg) return;
    const entry = makeKeyEntry(key, mgmtKey);
    if (label) entry.label = label;
    cfg.apiKeys.push(entry);
    _saveConfigs();
    _notify('configs', _state.configs);
  },

  removeKeyFromConfig(configId, keyIndex) {
    const cfg = _state.configs.find(c => c.id === configId);
    if (!cfg || keyIndex < 0 || keyIndex >= cfg.apiKeys.length) return;
    cfg.apiKeys.splice(keyIndex, 1);
    if (cfg.currentKeyIndex >= cfg.apiKeys.length) cfg.currentKeyIndex = 0;
    _saveConfigs();
    _notify('configs', _state.configs);
  },

  updateKeyLabel(configId, keyIndex, label) {
    const cfg = _state.configs.find(c => c.id === configId);
    if (!cfg || !cfg.apiKeys[keyIndex]) return;
    cfg.apiKeys[keyIndex].label = label;
    _saveConfigs();
    _notify('configs', _state.configs);
  },

  resetKeyUsage(configId, keyIndex) {
    const cfg = _state.configs.find(c => c.id === configId);
    if (!cfg || !cfg.apiKeys[keyIndex]) return;
    cfg.apiKeys[keyIndex].usage = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0, lastUsed: null };
    cfg.apiKeys[keyIndex].status = 'active';
    cfg.apiKeys[keyIndex].rateLimitedUntil = null;
    _saveConfigs();
    _notify('configs', _state.configs);
  },

  resetAllUsage() {
    _state.configs.forEach(cfg => {
      cfg.apiKeys.forEach(k => {
        k.usage = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0, lastUsed: null };
        k.status = 'active';
        k.rateLimitedUntil = null;
      });
      cfg.currentKeyIndex = 0;
    });
    _saveConfigs();
    _notify('configs', _state.configs);
  },

  getAllKeyEntries() {
    const entries = [];
    _state.configs.forEach(cfg => {
      cfg.apiKeys.forEach((k, i) => {
        entries.push({ configId: cfg.id, configName: cfg.name, keyIndex: i, ...k });
      });
    });
    return entries;
  },

  loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (raw.configs && Array.isArray(raw.configs)) {
        _state.configs = raw.configs.map(migrateConfig);
        _state.activeConfigId = raw.activeConfigId || _state.configs[0]?.id || null;
      } else if (raw.apiKey) {
        const id = genId();
        _state.configs = [{
          id,
          name: 'Default',
          baseURL: raw.baseURL || (location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? '/api/v1' : 'https://zenmux.ai/api/v1'),
          apiKeys: [makeKeyEntry(raw.apiKey || '', raw.mgmtKey || '')],
          currentKeyIndex: 0,
        }];
        _state.activeConfigId = id;
      }
      _state.model = raw.model || '';
    } catch (_) {}

    try {
      _state.conversations = JSON.parse(localStorage.getItem(CONV_KEY) || '[]');
    } catch (_) {
      _state.conversations = [];
    }
  },

  saveConfig() {
    _saveConfigs();
  },

  saveConversations() {
    localStorage.setItem(CONV_KEY, JSON.stringify(_state.conversations));
  },

  getConversation(id) {
    return _state.conversations.find(c => c.id === id) || null;
  },

  getCurrentConversation() {
    if (!_state.currentConversationId) return null;
    return _state.conversations.find(c => c.id === _state.currentConversationId) || null;
  },

  getMessages() {
    const conv = this.getCurrentConversation();
    return conv ? [...conv.messages] : [];
  },

  addMessage(message) {
    let conv = this.getCurrentConversation();
    if (!conv) {
      const title = message.role === 'user' && typeof message.content === 'string'
        ? message.content.slice(0, 50) : 'New Chat';
      conv = {
        id: Date.now().toString(),
        title,
        messages: [],
        model: _state.model,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      _state.conversations.unshift(conv);
      _state.currentConversationId = conv.id;
      this._evictIfNeeded();
    }
    conv.messages.push(message);
    conv.updatedAt = Date.now();
    if (conv.title === 'New Chat' && message.role === 'user' && typeof message.content === 'string') {
      conv.title = message.content.slice(0, 50);
    }
    _notify('conversations', _state.conversations);
  },

  _evictIfNeeded() {
    while (_state.conversations.length > MAX_CONVERSATIONS) {
      _state.conversations.pop();
    }
  },

  startStreaming() {
    _state.isStreaming = true;
    _state.abortController = new AbortController();
  },

  stopStreaming() {
    _state.isStreaming = false;
    if (_state.abortController) {
      _state.abortController.abort();
    }
    _state.abortController = null;
  },

  getStreamSignal() {
    return _state.abortController?.signal;
  },

  attachImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        _state.attachedImage = {
          data: ev.target.result,
          name: file.name,
          type: file.type,
        };
        _notify('attachedImage', _state.attachedImage);
        resolve(_state.attachedImage);
      };
      reader.onerror = () => reject(new Error(`Cannot read "${file.name}" — file may be too large, corrupted, or an unsupported format. Use a smaller PNG/JPEG/WebP image.`));
      reader.readAsDataURL(file);
    });
  },

  removeImage() {
    _state.attachedImage = null;
    _notify('attachedImage', null);
  },
};

function _saveConfigs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    configs: _state.configs,
    activeConfigId: _state.activeConfigId,
    model: _state.model,
  }));
}
