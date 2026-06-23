import { store } from './store.js';
import { escapeHtml, getEl, getProtocol, groupModels } from './utils.js';
import { renderMd } from './markdown.js';
import { initDropdowns, refreshDropdowns } from './dropdown.js';

export function showWelcome() {
  getEl('welcome-screen').style.display = 'flex';
  getEl('messages-container').style.display = 'none';
  getEl('chat-title').textContent = 'New Chat';
}

export function showChat() {
  getEl('welcome-screen').style.display = 'none';
  getEl('messages-container').style.display = 'flex';
}

export function appendMessage(role, content, reasoning, imageDataUrl) {
  showChat();
  const c = getEl('messages-container');
  const d = document.createElement('div');
  d.className = `message ${role}`;
  d.dataset.role = role;

  const a = document.createElement('div');
  a.className = 'message-avatar';
  a.textContent = role === 'assistant' ? 'AI' : 'U';

  const m = document.createElement('div');
  m.className = 'message-content';

  if (reasoning) {
    const tb = document.createElement('div');
    tb.className = 'thinking-block';
    const toggle = document.createElement('div');
    toggle.className = 'thinking-toggle';
    toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg> Reasoning';
    const contentDiv = document.createElement('div');
    contentDiv.style.display = 'none';
    contentDiv.textContent = reasoning;
    tb.appendChild(toggle);
    tb.appendChild(contentDiv);
    m.appendChild(tb);
  }

  if (imageDataUrl) {
    const img = document.createElement('img');
    img.src = imageDataUrl;
    m.appendChild(img);
  }

  const p = document.createElement('p');
  p.innerHTML = renderMd(content);
  m.appendChild(p);

  d.appendChild(a);
  d.appendChild(m);
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

export function createStreamingMessage() {
  showChat();
  const c = getEl('messages-container');

  const existing = c.querySelectorAll('.message.assistant');
  const last = existing[existing.length - 1];
  if (last && last.dataset.streaming === 'true') {
    return last.querySelector('.message-content');
  }

  const d = document.createElement('div');
  d.className = 'message assistant';
  d.dataset.role = 'assistant';
  d.dataset.streaming = 'true';

  const a = document.createElement('div');
  a.className = 'message-avatar';
  a.textContent = 'AI';

  const m = document.createElement('div');
  m.className = 'message-content';

  d.appendChild(a);
  d.appendChild(m);
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
  return m;
}

export function updateStreamingMessage(el, content, reasoning) {
  if (!el) return;
  if (reasoning) {
    let tb = el.querySelector('.thinking-block');
    if (!tb) {
      tb = document.createElement('div');
      tb.className = 'thinking-block';
      const toggle = document.createElement('div');
      toggle.className = 'thinking-toggle';
      toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg> Reasoning';
      const contentDiv = document.createElement('div');
      contentDiv.style.display = 'none';
      tb.appendChild(toggle);
      tb.appendChild(contentDiv);
      el.prepend(tb);
    }
    const contentDiv = tb.querySelector('div:last-child');
    if (contentDiv) contentDiv.textContent = reasoning;
  }
  const paragraphs = el.querySelectorAll('p');
  paragraphs.forEach(p => p.remove());
  const p = document.createElement('p');
  p.innerHTML = renderMd(content);
  el.appendChild(p);
  getEl('messages-container').scrollTop = getEl('messages-container').scrollHeight;
}

export function finalizeStreamingMessage(el, content, reasoning) {
  if (!el) return;
  el.closest('.message').dataset.streaming = 'false';
  el.innerHTML = '';
  if (reasoning) {
    const tb = document.createElement('div');
    tb.className = 'thinking-block';
    const toggle = document.createElement('div');
    toggle.className = 'thinking-toggle';
    toggle.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg> Reasoning';
    const contentDiv = document.createElement('div');
    contentDiv.style.display = 'none';
    contentDiv.textContent = reasoning;
    tb.appendChild(toggle);
    tb.appendChild(contentDiv);
    el.appendChild(tb);
  }
  const p = document.createElement('p');
  p.innerHTML = renderMd(content);
  el.appendChild(p);
}

export function showTyping() {
  const c = getEl('messages-container');
  if (c.querySelector('.typing-indicator')) return;
  const d = document.createElement('div');
  d.className = 'typing-indicator';
  d.innerHTML = '<span></span><span></span><span></span>';
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

export function removeTyping() {
  const e = getEl('messages-container').querySelector('.typing-indicator');
  if (e) e.remove();
}

export function setStatus(dot, text) {
  getEl('status-dot').className = `status-dot${dot === 'disconnected' ? ' disconnected' : ''}`;
  getEl('status-text').textContent = text;
}

export function updateSendButton() {
  const input = getEl('message-input');
  const image = store.get('attachedImage');
  getEl('send-btn').disabled = !(input.value.trim() || image);
}

export function updateModelStatus() {
  const model = store.get('model');
  const models = store.get('models');
  const m = models.find(x => x.id === model);
  const p = getProtocol(model);
  getEl('model-status').textContent = m ? m.display_name || m.id : '';
  getEl('protocol-badge').textContent = p;
  checkImageSupport();
  refreshDropdowns();
}

export function checkImageSupport() {
  const model = store.get('model');
  if (!model) return;
  const models = store.get('models');
  const m = models.find(x => x.id === model);
  const badge = getEl('img-support-badge');
  if (!badge) return;
  if (m && m.input_modalities && !m.input_modalities.includes('image')) {
    badge.textContent = 'No image support';
    badge.style.color = '';
    badge.style.display = 'inline';
  } else if (m && m.input_modalities && m.input_modalities.includes('image')) {
    badge.textContent = 'Image capable';
    badge.style.color = '#00c853';
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

export function switchPane(pane) {
  document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.pane === pane));
  document.querySelectorAll('.sidebar-pane').forEach(p => p.classList.toggle('active', p.id === `pane-${pane}`));
  getEl('chat-content').style.display = pane === 'chat' ? 'flex' : 'none';
  getEl('image-gen-area').classList.toggle('active', pane === 'images');
  getEl('platform-area').style.display = pane === 'platform' ? 'block' : 'none';
  getEl('nav-new-btn').textContent = pane === 'images' ? 'New Image' : 'New Chat';
}

export function populateSelects() {
  const models = store.get('models');
  const imageModels = store.get('imageModels');
  const currentModel = store.get('model');
  const ids = ['header-model', 'default-model-select', 'img-model'];

  ids.forEach(id => {
    const sel = getEl(id);
    if (!sel) return;
    const isImg = id === 'img-model';
    const filtered = isImg ? imageModels : models;

    sel.innerHTML = '';
    if (!filtered || filtered.length === 0) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = isImg ? 'No image models loaded' : 'No models loaded';
      o.disabled = true;
      sel.appendChild(o);
      return;
    }

    filtered.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id;
      o.textContent = m.display_name || m.id;
      if (m.id === currentModel) o.selected = true;
      sel.appendChild(o);
    });
  });

  initDropdowns();
}

export function renderConversations() {
  const list = getEl('conversation-list');
  const convs = store.get('conversations');
  const currentId = store.get('currentConversationId');
  list.innerHTML = convs.map(c =>
    `<div class="conversation-item${c.id === currentId ? ' active' : ''}" data-conv-id="${c.id}">${escapeHtml(c.title)}</div>`
  ).join('');
}

export function updateImagePreview() {
  const img = store.get('attachedImage');
  const preview = getEl('image-preview');
  const previewImg = getEl('preview-img');
  if (img) {
    previewImg.src = img.data;
    preview.style.display = 'flex';
  } else {
    preview.style.display = 'none';
    previewImg.src = '';
  }
}

export function renderModelError(isCors) {
  let banner = getEl('model-error');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'model-error';
    banner.style.cssText = 'background:#ffebee;color:#c62828;padding:10px 16px 12px;font-size:13px;border-radius:8px;margin:0 16px 8px';
    const sidebarContent = document.querySelector('.sidebar-content');
    if (sidebarContent) sidebarContent.prepend(banner);
  }
  if (isCors) {
    const origin = location.protocol === 'file:' ? 'http://localhost:3000' : location.origin;
    banner.innerHTML = `<strong>Blocked by browser CORS policy.</strong> Open this page via ${origin} instead of <code>${location.href}</code>.<br><small style="opacity:.7">Run: <code>npm run dev</code> in the project folder, then visit ${origin}</small>`;
  } else {
    banner.innerHTML = `<strong>Models failed to load.</strong> Check your API key or network connection.<div style="margin-top:6px"><button class="retry-btn" style="background:#c62828;color:#fff;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:12px">Retry</button></div>`;
  }
}

export function removeModelError() {
  const banner = getEl('model-error');
  if (banner) banner.remove();
}
