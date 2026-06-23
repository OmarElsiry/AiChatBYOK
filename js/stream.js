import { store } from './store.js';
import { fetchWithRotation, getCurrentKeyLabel } from './api.js';
import { escapeHtml, getRoots } from './utils.js';

const PROVIDERS = {
  openai: {
    buildUrl(_, { apiRoot }) {
      return `${apiRoot}/chat/completions`;
    },
    buildBody(model, history, { temperature, maxTokens, reasoningEffort }) {
      const body = {
        model,
        messages: history,
        stream: true,
        temperature,
        max_completion_tokens: maxTokens,
      };
      if (reasoningEffort) body.reasoning_effort = reasoningEffort;
      return body;
    },
    parseChunk({ data }) {
      if (data === '[DONE]') return { done: true };
      try {
        const p = JSON.parse(data);
        const d = p.choices?.[0]?.delta || {};
        return {
          content: d.content || '',
          reasoning: (d.reasoning || d.reasoning_content) || '',
        };
      } catch (_) {
        return {};
      }
    },
  },

  anthropic: {
    buildUrl(_, { baseRoot }) {
      return `${baseRoot}/anthropic/v1/messages`;
    },
    buildBody(model, history, { temperature, maxTokens }) {
      const messages = [];
      for (const h of history) {
        if (h.role === 'system') continue;
        if (typeof h.content === 'string') {
          messages.push({ role: h.role, content: h.content });
        } else if (Array.isArray(h.content)) {
          const blocks = [];
          for (const part of h.content) {
            if (part.type === 'text') {
              blocks.push({ type: 'text', text: part.text });
            } else if (part.type === 'image_url') {
              const url = part.image_url.url;
              let data = url;
              let mediaType = 'image/png';
              if (url.startsWith('data:')) {
                const m = url.match(/data:([^;]+);/);
                if (m) mediaType = m[1];
                data = url.split(',')[1];
              }
              blocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
            }
          }
          messages.push({ role: h.role, content: blocks });
        }
      }
      return { model, messages, max_tokens: maxTokens, temperature, stream: true };
    },
    parseChunk({ event, data }) {
      if (event === 'message_stop') return { done: true };
      if (!data) return {};
      try {
        const p = JSON.parse(data);
        if (event === 'content_block_start') {
          if (p.content_block?.type === 'thinking') return { reasoning: p.content_block.thinking || '' };
          if (p.content_block?.type === 'text') return { content: p.content_block.text || '' };
        }
        if (event === 'content_block_delta') {
          if (p.delta?.type === 'text_delta') return { content: p.delta.text || '' };
          if (p.delta?.type === 'thinking_delta') return { reasoning: p.delta.thinking || '' };
        }
      } catch (_) {}
      return {};
    },
  },

  vertexai: {
    buildUrl(model, { baseRoot }) {
      const modelName = model.split('/').pop() || model;
      const provider = model.split('/')[0] || 'google';
      return `${baseRoot}/vertex-ai/v1/publishers/${provider}/models/${modelName}:streamGenerateContent`;
    },
    buildBody(model, history, { temperature, maxTokens }) {
      const contents = [];
      for (const h of history) {
        if (h.role === 'system') continue;
        const parts = [];
        if (typeof h.content === 'string') {
          parts.push({ text: h.content });
        } else if (Array.isArray(h.content)) {
          for (const part of h.content) {
            if (part.type === 'text') parts.push({ text: part.text });
            else if (part.type === 'image_url') {
              const url = part.image_url.url;
              if (url.startsWith('data:')) {
                const m = url.match(/data:([^;]+);base64,(.+)/);
                if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
              } else {
                parts.push({ fileData: { mimeType: 'image/jpeg', fileUri: url } });
              }
            }
          }
        }
        contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts });
      }
      return { contents, generationConfig: { temperature, maxOutputTokens: maxTokens } };
    },
    parseChunk({ data }) {
      if (!data) return {};
      try {
        const p = JSON.parse(data);
        const parts = p.candidates?.[0]?.content?.parts || [];
        let content = '';
        let reasoning = '';
        for (const part of parts) {
          if (part.text) content += part.text;
          if (part.thought) reasoning += part.text || '';
        }
        return { content, reasoning };
      } catch (_) {
        return {};
      }
    },
  },
};

async function* readSSE(reader, decoder, signal) {
  let buf = '';
  let chunkCount = 0;
  while (true) {
    if (signal?.aborted) break;
    const { done, value } = await reader.read();
    if (done) {
      console.log('[SSE] Stream complete. Total chunks:', chunkCount, 'Buffer remaining:', buf.length);
      break;
    }
    chunkCount++;
    if (chunkCount === 1) console.log('[SSE] First chunk received, size:', value.byteLength);
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      if (!part.trim()) continue;
      const lines = part.split('\n');
      let eventType = '';
      let dataStr = '';
      for (const l of lines) {
        if (l.startsWith('event: ')) eventType = l.slice(7);
        else if (l.startsWith('data: ')) dataStr = l.slice(6);
      }
      if (dataStr) yield { event: eventType || 'message', data: dataStr };
    }
  }
}

export async function streamChat(providerName, history, signal, formValues, callbacks) {
  const provider = PROVIDERS[providerName] || PROVIDERS.openai;
  const cfg = store.getActiveConfig();
  const roots = getRoots(cfg?.baseURL);

  const url = provider.buildUrl(store.get('model'), roots);
  const body = provider.buildBody(store.get('model'), history, formValues);

  console.log('[STREAM] POST', url, 'model:', store.get('model'), 'provider:', providerName);
  console.log('[STREAM] Body keys:', Object.keys(body).join(','));

  let res;
  try {
    res = await fetchWithRotation(url, {
      method: 'POST',
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name !== 'AbortError') {
      const model = store.get('models').find(m => m.id === store.get('model'));
      const name = model?.display_name || store.get('model') || 'selected model';
      if (/image|vision|visual/i.test(e.message) && /not support|not accept|unsupported|doesn't support|cannot .*process|cannot .*read|does not.*image|unable to/i.test(e.message)) {
        throw new Error(`The model "${escapeHtml(name)}" does not support image input. Select a vision-capable model (e.g. openai/gpt-5, anthropic/claude-sonnet-4.5, google/gemini-2.5-pro) then try again.`);
      }
    }
    throw e;
  }

  console.log('[STREAM] Response status:', res.status, 'type:', res.headers.get('content-type'));

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try { const p = JSON.parse(text); msg = p.error?.message || p.message || text; } catch (_) {}
    if (/image|vision|visual/i.test(msg) && /not support|not accept|unsupported|doesn't support|cannot .*process|cannot .*read|does not.*image|unable to/i.test(msg)) {
      const model = store.get('models').find(m => m.id === store.get('model'));
      const name = model?.display_name || store.get('model') || 'selected model';
      throw new Error(`The model "${escapeHtml(name)}" does not support image input. Select a vision-capable model (e.g. openai/gpt-5, anthropic/claude-sonnet-4.5, google/gemini-2.5-pro) then try again.`);
    }
    throw new Error(msg);
  }

  callbacks.onStart();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let content = '';
  let reasoning = '';

  try {
    for await (const event of readSSE(reader, decoder, signal)) {
      const result = provider.parseChunk(event);
      if (result.content) content += result.content;
      if (result.reasoning) reasoning += result.reasoning;
      if (result.done) break;
      callbacks.onChunk(content, reasoning);
    }
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('[STREAM ERROR]', e.message);
      throw e;
    }
  }

  console.log('[STREAM] Done. Content length:', content.length, 'Reasoning length:', reasoning.length);
  if (content.length === 0 && reasoning.length === 0) {
    console.warn('[STREAM] WARNING: Empty response from model - check API key balance or model access');
  }

  callbacks.onDone(content, reasoning);
}
