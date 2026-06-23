import { store } from './store.js';
import { escapeHtml, getEl } from './utils.js';

export function showKeyDashboard() {
  const d = getEl('platform-dashboard');
  d.innerHTML = renderDashboard();
  attachDashboardEvents(d);
}

function renderDashboard() {
  const entries = store.getAllKeyEntries();

  const totalAll = entries.reduce((s, e) => { const u = e.usage || {}; s.requests += u.requests || 0; s.tokens += u.totalTokens || 0; s.errors += u.errors || 0; return s; }, { requests: 0, tokens: 0, errors: 0 });

  let rowsHtml = '';
  if (entries.length === 0) {
    rowsHtml = '<tr><td colspan="7" class="dash-empty">No API keys configured. Add keys in Settings.</td></tr>';
  } else {
    entries.forEach((e, i) => {
      const u = e.usage || {};
      const statusIcon = e.status === 'rate_limited' ? '🔴' : '🟢';
      const statusText = e.status === 'rate_limited' ? 'Rate limited' : 'Active';
      const masked = e.label || '••••' + (e.key ? e.key.slice(-4) : '');
      const lastUsed = u.lastUsed ? new Date(u.lastUsed).toLocaleString() : 'Never';
      const pct = totalAll.requests > 0 ? ((u.requests || 0) / totalAll.requests * 100).toFixed(1) : '0';

      rowsHtml += `<tr class="dash-row${e.status === 'rate_limited' ? ' dash-rate-limited' : ''}">
        <td><span class="dash-config-name">${escapeHtml(e.configName)}</span></td>
        <td><span class="dash-key-label">${escapeHtml(masked)}</span></td>
        <td><span class="dash-status-badge${e.status === 'rate_limited' ? ' dash-status-error' : ''}">${statusIcon} ${statusText}</span></td>
        <td class="dash-num">${u.requests || 0}</td>
        <td class="dash-num">${(u.totalTokens || 0).toLocaleString()}</td>
        <td class="dash-num">${u.errors || 0}</td>
        <td class="dash-num">${lastUsed}</td>
        <td>
          <div class="dash-bar-bg"><div class="dash-bar-fill" style="width:${pct}%"></div></div>
          <span class="dash-bar-label">${pct}%</span>
        </td>
        <td><button class="dash-reset-btn" data-cfg-id="${escapeHtml(e.configId)}" data-key-idx="${e.keyIndex}" title="Reset usage">↺</button></td>
      </tr>`;
    });
  }

  return `
    <div class="platform-card">
      <div class="dash-header">
        <h3>Key Usage Dashboard</h3>
        <div class="dash-summary">
          <span class="dash-summary-item"><strong>${entries.length}</strong> key${entries.length !== 1 ? 's' : ''}</span>
          <span class="dash-summary-item"><strong>${totalAll.requests}</strong> total requests</span>
          <span class="dash-summary-item"><strong>${totalAll.tokens.toLocaleString()}</strong> total tokens</span>
          <span class="dash-summary-item"><strong>${totalAll.errors}</strong> total errors</span>
        </div>
      </div>
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead><tr>
            <th>Config</th>
            <th>Key</th>
            <th>Status</th>
            <th>Requests</th>
            <th>Tokens</th>
            <th>Errors</th>
            <th>Last Used</th>
            <th>Share</th>
            <th></th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div class="dash-actions">
        <button class="button-subtle" id="dash-reset-all">Reset All Usage</button>
        <button class="button-subtle" id="dash-refresh">Refresh</button>
      </div>
    </div>`;
}

function attachDashboardEvents(d) {
  const resetAll = d.querySelector('#dash-reset-all');
  if (resetAll) {
    resetAll.addEventListener('click', () => {
      store.resetAllUsage();
      showKeyDashboard();
    });
  }

  const refresh = d.querySelector('#dash-refresh');
  if (refresh) {
    refresh.addEventListener('click', () => showKeyDashboard());
  }

  d.querySelectorAll('.dash-reset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      store.resetKeyUsage(btn.dataset.cfgId, parseInt(btn.dataset.keyIdx, 10));
      showKeyDashboard();
    });
  });
}
