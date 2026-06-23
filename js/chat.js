import { store } from './store.js';
import { streamChat } from './stream.js';
import { escapeHtml, getEl, autoResize, getProtocol, supportsImageInput } from './utils.js';
import * as render from './render.js';
import { showSettings } from './settings.js';

export function stopGeneration() {
  store.stopStreaming();
  getEl('stop-btn').classList.remove('active');
}

export function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

export function sendSuggestion(text) {
  getEl('message-input').value = text;
  autoResize(getEl('message-input'));
  sendMessage();
}

export function newChat() {
  if (store.get('isStreaming')) stopGeneration();
  store.set('currentConversationId', null);
  getEl('messages-container').innerHTML = '';
  render.showWelcome();
  getEl('token-count').textContent = '';
  getEl('message-input').value = '';
  autoResize(getEl('message-input'));
  render.updateSendButton();
}

export function loadConversation(id) {
  const conv = store.getConversation(id);
  if (!conv) return;
  store.set('currentConversationId', conv.id);
  if (conv.model) store.set('model', conv.model);
  getEl('chat-title').textContent = conv.title;
  getEl('messages-container').innerHTML = '';
  render.showChat();
  (conv.messages || []).forEach(m => render.appendMessage(m.role, m.content || '', m.reasoning || ''));
  render.renderConversations();
}

export async function sendMessage() {
  const input = getEl('message-input');
  const text = input.value.trim();
  const imageData = store.get('attachedImage');

  if ((!text && !imageData) || store.get('isStreaming')) return;
  if (!store.get('apiKey')) { showSettings(); return; }
  if (!store.get('model')) {
    render.appendMessage('assistant', 'No model selected. Open Settings and select a model, or pick one from the dropdown in the sidebar header.');
    return;
  }

  if (imageData && !supportsImageInput(store.get('model'), store.get('models'))) {
    const model = store.get('models').find(m => m.id === store.get('model'));
    const name = model?.display_name || store.get('model');
    render.appendMessage('assistant', `The current model **${escapeHtml(name)}** does not support image input. Please select a vision-capable model (e.g. \`openai/gpt-5\`, \`anthropic/claude-sonnet-4.5\`, \`google/gemini-2.5-pro\`) from the model dropdown first.`);
    return;
  }

  input.value = '';
  autoResize(input);

  const history = store.getMessages();
  let userContent;
  if (imageData) {
    userContent = [
      { type: 'text', text: text || 'Describe this image.' },
      { type: 'image_url', image_url: { url: imageData.data, detail: 'auto' } },
    ];
  } else {
    userContent = text;
  }
  const apiHistory = [...history, { role: 'user', content: userContent }];

  render.appendMessage('user', text || '[Image]', null, imageData?.data);
  store.removeImage();
  render.updateImagePreview();
  render.showTyping();
  getEl('send-btn').disabled = true;
  getEl('stop-btn').classList.add('active');
  store.startStreaming();

  const provider = getProtocol(store.get('model'));
  const formValues = {
    temperature: parseFloat(getEl('temperature').value || '0.7'),
    maxTokens: parseInt(getEl('max-tokens').value, 10) || 4096,
    reasoningEffort: getEl('reasoning-effort').value,
  };

  store.addMessage({ role: 'user', content: text || '[Image]' });

  let streamContainer;
  let assistantContent = '';
  let assistantReasoning = '';
  let assistantSaved = false;

  try {
    await streamChat(provider, apiHistory, store.getStreamSignal(), formValues, {
      onStart() {
        render.removeTyping();
        streamContainer = render.createStreamingMessage();
      },
      onChunk(content, reasoning) {
        assistantContent = content;
        assistantReasoning = reasoning;
        render.updateStreamingMessage(streamContainer, content, reasoning);
      },
      onDone(content, reasoning) {
        assistantContent = content;
        assistantReasoning = reasoning;
        render.finalizeStreamingMessage(streamContainer, content, reasoning);
        store.addMessage({ role: 'assistant', content, reasoning });
        assistantSaved = true;
      },
    });
  } catch (e) {
    if (e.name !== 'AbortError') {
      render.removeTyping();
      const c = getEl('messages-container');
      const msgs = c.querySelectorAll('.message.assistant');
      const lastAssistant = msgs[msgs.length - 1];
      if (lastAssistant && lastAssistant.dataset.streaming === 'true') {
        const mc = lastAssistant.querySelector('.message-content');
        if (mc) {
          mc.innerHTML = `<p class="error-message">Error: ${escapeHtml(e.message)}</p>`;
          lastAssistant.dataset.streaming = 'false';
        }
      } else {
        render.appendMessage('assistant', `<span class="error-message">Error: ${e.message}</span>`);
      }
      store.addMessage({ role: 'assistant', content: `Error: ${e.message}` });
      assistantSaved = true;
    }
  } finally {
    if (!assistantSaved && (assistantContent || assistantReasoning)) {
      store.addMessage({ role: 'assistant', content: assistantContent, reasoning: assistantReasoning });
    }
    store.set('isStreaming', false);
    store.set('abortController', null);
    getEl('send-btn').disabled = false;
    getEl('stop-btn').classList.remove('active');
    input.focus();
    store.saveConversations();
    render.renderConversations();
  }
}
