import { store } from './store.js';
import { escapeHtml, getEl, getProtocol, supportsImageInput, getRoots } from './utils.js';
import { buildHeaders } from './api.js';
import * as render from './render.js';

export async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!store.get('model') || !supportsImageInput(store.get('model'), store.get('models'))) {
    const model = store.get('models').find(m => m.id === store.get('model'));
    const name = model?.display_name || store.get('model') || 'None selected';
    render.appendMessage('assistant', `The current model **${escapeHtml(name)}** does not support image input. Please select a vision-capable model (e.g. \`openai/gpt-5\`, \`anthropic/claude-sonnet-4.5\`, \`google/gemini-2.5-pro\`) from the model dropdown first.`);
    e.target.value = '';
    return;
  }

  try {
    await store.attachImage(file);
    render.updateImagePreview();
    render.updateSendButton();
  } catch (err) {
    render.appendMessage('assistant', `<span class="error-message">Error: ${escapeHtml(err.message)}</span>`);
  }
  e.target.value = '';
}

export function handlePaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      if (!store.get('model') || !supportsImageInput(store.get('model'), store.get('models'))) {
        const model = store.get('models').find(m => m.id === store.get('model'));
        const name = model?.display_name || store.get('model') || 'None selected';
        render.appendMessage('assistant', `The current model **${escapeHtml(name)}** does not support image input. Please select a vision-capable model (e.g. \`openai/gpt-5\`, \`anthropic/claude-sonnet-4.5\`, \`google/gemini-2.5-pro\`) from the model dropdown first.`);
        return;
      }
      const file = item.getAsFile();
      if (file) store.attachImage(file).then(() => { render.updateImagePreview(); render.updateSendButton(); }).catch(err => { render.appendMessage('assistant', `<span class="error-message">Error: ${escapeHtml(err.message)}</span>`); });
      break;
    }
  }
}

export function handleDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file || !file.type.startsWith('image/')) return;
  if (!store.get('model') || !supportsImageInput(store.get('model'), store.get('models'))) {
    const model = store.get('models').find(m => m.id === store.get('model'));
    const name = model?.display_name || store.get('model') || 'None selected';
    render.appendMessage('assistant', `The current model **${escapeHtml(name)}** does not support image input. Please select a vision-capable model (e.g. \`openai/gpt-5\`, \`anthropic/claude-sonnet-4.5\`, \`google/gemini-2.5-pro\`) from the model dropdown first.`);
    return;
  }
  store.attachImage(file).then(() => { render.updateImagePreview(); render.updateSendButton(); }).catch(err => { render.appendMessage('assistant', `<span class="error-message">Error: ${escapeHtml(err.message)}</span>`); });
}

export function removeImage() {
  store.removeImage();
  render.updateImagePreview();
  render.updateSendButton();
}

export async function generateImage() {
  const prompt = getEl('img-prompt').value.trim();
  if (!prompt) return;

  const model = getEl('img-model').value;
  if (!model) return;

  const count = parseInt(getEl('img-count').value, 10) || 1;
  const gallery = getEl('image-gallery');
  const proto = getProtocol(model);
  let images = [];

  try {
    gallery.innerHTML = '<div class="gen-spinner"><div class="spinner"></div> Generating...</div>';

    const { apiRoot, baseRoot } = getRoots(store.get('baseURL'));

    if (proto === 'openai') {
      const size = getEl('img-size').value;
      const quality = getEl('img-quality').value;
      const res = await fetch(`${apiRoot}/images/generations`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ model, prompt, n: count, size, quality }),
        signal: store.get('abortController')?.signal,
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Generation failed');
      const d = await res.json();
      images = d.data.map(img => img.b64_json ? `data:image/png;base64,${img.b64_json}` : img.url);
    } else if (proto === 'vertexai') {
      const w = parseInt(getEl('img-width').value, 10) || 1024;
      const h = parseInt(getEl('img-height').value, 10) || 1024;
      const provider = model.split('/')[0] || 'google';
      const mName = model.split('/').pop() || model;
      const body = {
        instances: [{ prompt }],
        parameters: { sampleCount: count, imageSize: `${w}x${h}` },
      };
      const res = await fetch(`${baseRoot}/vertex-ai/v1/publishers/${provider}/models/${mName}:predict`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.text()) || 'Generation failed');
      const d = await res.json();
      images = (d.predictions || []).map(p => `data:${p.mimeType || 'image/png'};base64,${p.bytesBase64Encoded}`);
    } else {
      const res = await fetch(`${apiRoot}/images/generations`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ model, prompt, n: count }),
        signal: store.get('abortController')?.signal,
      });
      if (!res.ok) throw new Error('Generation failed');
      const d = await res.json();
      images = d.data.map(img => img.b64_json ? `data:image/png;base64,${img.b64_json}` : img.url);
    }
  } catch (e) {
    gallery.innerHTML = `<p style="color:#e53935">Error: ${escapeHtml(e.message)}</p>`;
    return;
  }

  gallery.innerHTML = images.map((src, i) =>
    `<div class="image-gallery-item"><img src="${src}" alt="Generated ${i + 1}"><button class="download-btn" data-src="${src}" data-index="${i}">Save</button></div>`
  ).join('');
}

export function downloadImage(src, index) {
  const a = document.createElement('a');
  a.href = src;
  a.download = `generated-${index + 1}.png`;
  a.click();
}
