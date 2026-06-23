import { store } from './store.js';
import { getEl, escapeHtml, groupModels } from './utils.js';

const GROUP_LABELS = {
  openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google', deepseek: 'DeepSeek',
  mistral: 'Mistral', meta: 'Meta', cohere: 'Cohere', xai: 'xAI',
};
const GROUP_ORDER = ['openai', 'anthropic', 'google', 'deepseek', 'mistral', 'meta', 'cohere', 'xai'];
let openDropdown = null;
let expandedGroups = {};

function hasCap(m, cap) {
  if (cap === 'reasoning') {
    const id = m.id.toLowerCase();
    const name = (m.display_name || '').toLowerCase();
    return id.includes('reasoning') || name.includes('reasoning') ||
      /r1|thinking|o1|o3|deepseek-reasoner/i.test(m.id) || m.reasoning === true;
  }
  if (cap === 'vision') return m.input_modalities?.includes('image');
  if (cap === 'imggen') return m.output_modalities?.includes('image');
  if (cap === 'free') return m.pricing?.free === true;
  return m.input_modalities?.includes(cap) || m.output_modalities?.includes(cap);
}

function getCaps(m) {
  const caps = [];
  if (m.input_modalities?.includes('image')) caps.push('Vision');
  if (m.output_modalities?.includes('image')) caps.push('Image Gen');
  if (m.input_modalities?.includes('audio') || m.output_modalities?.includes('audio')) caps.push('Audio');
  if (m.input_modalities?.includes('video') || m.output_modalities?.includes('video')) caps.push('Video');
  return caps;
}

function getPricing(m) {
  if (!m.pricing) return '';
  if (m.pricing.free) return 'Free';
  const p = [];
  if (m.pricing.prompt) p.push(`$${+m.pricing.prompt}/1M in`);
  if (m.pricing.completion) p.push(`$${+m.pricing.completion}/1M out`);
  return p.join(' · ') || '';
}

function closeAll() {
  if (openDropdown) {
    openDropdown._panel.style.display = 'none';
    openDropdown = null;
  }
}

function buildGroupHTML(models, currentModel, filterCaps, searchQuery, label) {
  let html = '';
  const key = label.toLowerCase();

  const filtered = models.filter(m => {
    if (filterCaps.length) {
      for (const cap of filterCaps) {
        if (!hasCap(m, cap)) return false;
      }
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return m.id.toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  if (!filtered.length) return '';

  const isExpanded = expandedGroups[key];

  html += `<div class="dd-group" data-group="${escapeHtml(key)}">
    <div class="dd-group-header">
      <span class="dd-group-name">${escapeHtml(label)}</span>
      <span class="dd-group-count">${filtered.length}</span>
      <svg class="dd-group-arrow${isExpanded ? ' expanded' : ''}" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 2l4 4-4 4"/></svg>
    </div>
    <div class="dd-group-items" style="display:${isExpanded ? 'block' : 'none'}">`;

  filtered.forEach(m => {
    const caps = getCaps(m);
    const pricing = getPricing(m);
    const sel = m.id === currentModel;
    html += `<div class="dd-item${sel ? ' selected' : ''}" data-id="${escapeHtml(m.id)}">
      <div class="dd-item-row">
        <span class="dd-item-name">${escapeHtml(m.display_name || m.id)}</span>
        ${sel ? '<span class="dd-item-check">✓</span>' : ''}
      </div>
      <div class="dd-item-id">${escapeHtml(m.id)}</div>
      <div class="dd-item-meta">
        ${caps.length ? `<span class="dd-caps">${caps.map(c => `<span class="dd-cap">${c}</span>`).join('')}</span>` : ''}
        ${pricing ? `<span class="dd-pricing">${escapeHtml(pricing)}</span>` : ''}
      </div>
    </div>`;
  });

  html += `</div></div>`;
  return html;
}

function buildPanelHTML(models, currentModel, filterCaps, searchQuery) {
  const groups = groupModels(models);

  const sortedKeys = [...new Set([...GROUP_ORDER, ...Object.keys(groups)])].filter(k => groups[k]);

  let bodyHTML = '';
  sortedKeys.forEach(k => {
    bodyHTML += buildGroupHTML(groups[k], currentModel, filterCaps, searchQuery, GROUP_LABELS[k] || k);
  });

  if (!bodyHTML) {
    bodyHTML = '<div class="dd-empty">No models match</div>';
  }

  return bodyHTML;
}

function createDropdown(selectEl, opts = {}) {
  const isImg = opts.isImg;
  const wrapper = document.createElement('div');
  wrapper.className = 'dd-wrapper';

  const trigger = document.createElement('button');
  trigger.className = 'dd-trigger';
  trigger.type = 'button';
  trigger.innerHTML = '<span class="dd-trigger-text"></span><svg class="dd-chevron" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 5l3 3 3-3"/></svg>';

  const panel = document.createElement('div');
  panel.className = 'dd-panel';
  panel.style.display = 'none';

  panel.innerHTML = `
    <div class="dd-search-row">
      <div class="dd-search-wrap">
        <svg class="dd-search-icon" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="6" cy="6" r="4.5"/><path d="M9.5 9.5L13 13"/></svg>
        <input type="text" class="dd-search" placeholder="Search..." spellcheck="false">
      </div>
      <button class="dd-filter-btn" title="Filters">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M4 8h8M6 12h4"/><circle cx="4" cy="4" r="1.5" fill="currentColor"/><circle cx="12" cy="8" r="1.5" fill="currentColor"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="dd-filter-chips" style="display:none">
      <button class="dd-chip" data-filter="vision">Vision</button>
      <button class="dd-chip" data-filter="imggen">Image Gen</button>
      <button class="dd-chip" data-filter="audio">Audio</button>
      <button class="dd-chip" data-filter="video">Video</button>
      <button class="dd-chip" data-filter="reasoning">Reasoning</button>
      <button class="dd-chip" data-filter="free">Free</button>
    </div>
    <div class="dd-body"></div>
  `;

  selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
  wrapper.appendChild(trigger);
  wrapper.appendChild(panel);
  wrapper._panel = panel;

  let filterCaps = [];
  let searchValue = '';

  function renderBody() {
    const models = isImg ? (store.get('imageModels') || []) : (store.get('models') || []);
    const currentModel = store.get('model');
    panel.querySelector('.dd-body').innerHTML = buildPanelHTML(models, currentModel, filterCaps, searchValue);
    updateTriggerText(currentModel, models);
  }

  function updateTriggerText(modelId, models) {
    const m = (models || []).find(x => x.id === modelId);
    trigger.querySelector('.dd-trigger-text').textContent = m?.display_name || modelId || (isImg ? 'Select image model' : 'Select model');
  }

  function togglePanel(e) {
    e.stopPropagation();
    if (openDropdown === wrapper) {
      closeAll();
      return;
    }
    closeAll();
    openDropdown = wrapper;
    renderBody();
    panel.style.display = 'flex';
    panel.querySelector('.dd-search')?.focus();
  }

  function selectModel(id) {
    selectEl.value = id;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    closeAll();
  }

  trigger.addEventListener('click', togglePanel);

  panel.addEventListener('click', (e) => {
    const item = e.target.closest('.dd-item');
    if (item) {
      e.preventDefault();
      selectModel(item.dataset.id);
      return;
    }
    const header = e.target.closest('.dd-group-header');
    if (header) {
      const group = header.closest('.dd-group');
      const key = group.dataset.group;
      const items = group.querySelector('.dd-group-items');
      const arrow = group.querySelector('.dd-group-arrow');
      const isOpen = items.style.display !== 'none';
      items.style.display = isOpen ? 'none' : 'block';
      arrow.classList.toggle('expanded', isOpen);
      expandedGroups[key] = !isOpen;
      return;
    }
  });

  panel.querySelector('.dd-search').addEventListener('input', (e) => {
    searchValue = e.target.value;
    renderBody();
  });

  let chipsVisible = false;
  panel.querySelector('.dd-filter-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    chipsVisible = !chipsVisible;
    panel.querySelector('.dd-filter-chips').style.display = chipsVisible ? 'flex' : 'none';
  });

  panel.querySelector('.dd-filter-chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.dd-chip');
    if (!chip) return;
    chip.classList.toggle('active');
    const cap = chip.dataset.filter;
    if (chip.classList.contains('active')) {
      if (!filterCaps.includes(cap)) filterCaps.push(cap);
    } else {
      filterCaps = filterCaps.filter(c => c !== cap);
    }
    renderBody();
  });

  document.addEventListener('click', (e) => {
    if (openDropdown === wrapper && !wrapper.contains(e.target)) {
      closeAll();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openDropdown === wrapper) {
      closeAll();
    }
  });

  return {
    wrapper,
    refresh() {
      if (openDropdown === wrapper) renderBody();
      else {
        const models = isImg ? (store.get('imageModels') || []) : (store.get('models') || []);
        updateTriggerText(selectEl.value, models);
      }
    },
  };
}

let dropdowns = [];

export function initDropdowns() {
  const ids = ['header-model', 'default-model-select', 'img-model'];

  dropdowns.forEach(d => {
    if (d.wrapper && d.wrapper.parentNode) d.wrapper.remove();
  });
  dropdowns = [];
  expandedGroups = {};

  ids.forEach(id => {
    const el = getEl(id);
    if (!el) return;
    const existing = el.nextElementSibling;
    if (existing && existing.classList.contains('dd-wrapper')) existing.remove();
    el.style.display = 'none';
    const isImg = id === 'img-model';
    const dd = createDropdown(el, { isImg });
    dropdowns.push(dd);
  });
}

export function refreshDropdowns() {
  dropdowns.forEach(d => d.refresh());
}
