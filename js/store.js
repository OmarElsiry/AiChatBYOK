const MAX_CONVERSATIONS = 50;
const STORAGE_KEY = 'zmx-config';
const CONV_KEY = 'zmx-convs';

const _state = {
  apiKey: '',
  mgmtKey: '',
  model: '',
  baseURL: 'https://zenmux.ai/api/v1',
  models: [],
  imageModels: [],
  conversations: [],
  currentConversationId: null,
  isStreaming: false,
  abortController: null,
  attachedImage: null,
  rememberKey: false,
};

const _listeners = {};

function _notify(key, value, old) {
  const fns = _listeners[key];
  if (fns) fns.forEach(fn => fn(value, old));
}

export const store = {
  get(key) {
    return _state[key];
  },

  set(key, value) {
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

  loadState() {
    try {
      const cfg = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      _state.apiKey = cfg.apiKey || '';
      _state.mgmtKey = cfg.mgmtKey || '';
      _state.model = cfg.model || '';
      _state.rememberKey = cfg.rememberKey || false;
      let baseURL = cfg.baseURL || 'https://zenmux.ai/api/v1';
      if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        baseURL = baseURL.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '/');
      }
      _state.baseURL = baseURL;
    } catch (_) {}

    try {
      _state.conversations = JSON.parse(localStorage.getItem(CONV_KEY) || '[]');
    } catch (_) {
      _state.conversations = [];
    }
  },

  saveConfig() {
    const cfg = {
      model: _state.model,
      baseURL: _state.baseURL,
      rememberKey: _state.rememberKey,
    };
    if (_state.rememberKey) {
      cfg.apiKey = _state.apiKey;
      cfg.mgmtKey = _state.mgmtKey;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
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
      reader.onerror = () => reject(new Error(`Cannot read "${file.name}" — file may be too large or corrupted`));
      reader.readAsDataURL(file);
    });
  },

  removeImage() {
    _state.attachedImage = null;
    _notify('attachedImage', null);
  },
};
