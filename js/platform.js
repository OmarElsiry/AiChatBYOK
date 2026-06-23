import { store } from './store.js';
import { escapeHtml, getEl } from './utils.js';
import { fetchManagement } from './api.js';
import { switchPane } from './render.js';
import { showSettings } from './settings.js';

async function loadManagement(endpoint, title, renderFn) {
  if (!store.get('mgmtKey')) {
    showSettings();
    return;
  }
  switchPane('platform');
  const d = getEl('platform-dashboard');
  d.innerHTML = '<div class="gen-spinner"><div class="spinner"></div> Loading...</div>';
  try {
    const j = await fetchManagement(endpoint);
    const data = j.data || j;
    renderFn(d, data);
  } catch (e) {
    d.innerHTML = `<p style="color:#e53935">Error: ${escapeHtml(e.message)}</p>`;
  }
}

export function fetchFlowRate() {
  loadManagement('flow_rate', 'Flow Rate', (d, data) => {
    d.innerHTML = `
      <div class="platform-card"><h3>Flow Rate</h3>
        <div class="stat-row"><span class="stat-label">Currency</span><span class="stat-value">${data.currency}</span></div>
        <div class="stat-row"><span class="stat-label">Base Rate</span><span class="stat-value">$${data.base_usd_per_flow} / Flow</span></div>
        <div class="stat-row"><span class="stat-label">Effective Rate</span><span class="stat-value">$${data.effective_usd_per_flow} / Flow</span></div>
      </div>`;
  });
}

export function fetchBalance() {
  loadManagement('payg/balance', 'PAYG Balance', (d, data) => {
    d.innerHTML = `
      <div class="platform-card"><h3>PAYG Balance</h3>
        <div class="stat-row"><span class="stat-label">Currency</span><span class="stat-value">${data.currency}</span></div>
        <div class="stat-row"><span class="stat-label">Total Credits</span><span class="stat-value">$${data.total_credits}</span></div>
        <div class="stat-row"><span class="stat-label">Top-up Credits</span><span class="stat-value">$${data.top_up_credits}</span></div>
        <div class="stat-row"><span class="stat-label">Bonus Credits</span><span class="stat-value">$${data.bonus_credits}</span></div>
      </div>`;
  });
}

export function fetchSubscription() {
  loadManagement('subscription/detail', 'Subscription', (d, data) => {
    const pct5 = ((data.quota_5_hour?.usage_percentage || 0) * 100).toFixed(1);
    const pct7 = ((data.quota_7_day?.usage_percentage || 0) * 100).toFixed(1);
    d.innerHTML = `
      <div class="platform-card"><h3>Subscription</h3>
        <div class="stat-row"><span class="stat-label">Plan</span><span class="stat-value">${data.plan?.tier || 'N/A'} ($${data.plan?.amount_usd || 0}/mo)</span></div>
        <div class="stat-row"><span class="stat-label">Status</span><span class="stat-value">${data.account_status || 'N/A'}</span></div>
        <div class="stat-row"><span class="stat-label">Expires</span><span class="stat-value">${data.plan?.expires_at ? new Date(data.plan.expires_at).toLocaleDateString() : 'N/A'}</span></div>
        <div class="stat-row"><span class="stat-label">Effective Rate</span><span class="stat-value">$${data.effective_usd_per_flow}/Flow</span></div>
      </div>
      <div class="platform-card"><h3>5-Hour Quota</h3>
        <div class="quota-bar"><div class="quota-fill" style="width:${pct5}%"></div></div>
        <div class="stat-row"><span class="stat-label">Used</span><span class="stat-value">${(data.quota_5_hour?.used_flows || 0).toFixed(1)} / ${data.quota_5_hour?.max_flows || 0} Flows</span></div>
        <div class="stat-row"><span class="stat-label">Remaining</span><span class="stat-value">${(data.quota_5_hour?.remaining_flows || 0).toFixed(1)} Flows</span></div>
      </div>
      <div class="platform-card"><h3>7-Day Quota</h3>
        <div class="quota-bar"><div class="quota-fill" style="width:${pct7}%"></div></div>
        <div class="stat-row"><span class="stat-label">Used</span><span class="stat-value">${(data.quota_7_day?.used_flows || 0).toFixed(1)} / ${data.quota_7_day?.max_flows || 0} Flows</span></div>
        <div class="stat-row"><span class="stat-label">Remaining</span><span class="stat-value">${(data.quota_7_day?.remaining_flows || 0).toFixed(1)} Flows</span></div>
      </div>
      <div class="platform-card"><h3>Monthly Quota</h3>
        <div class="stat-row"><span class="stat-label">Max Flows</span><span class="stat-value">${data.quota_monthly?.max_flows || 0}</span></div>
        <div class="stat-row"><span class="stat-label">Max Value</span><span class="stat-value">$${data.quota_monthly?.max_value_usd || 0}</span></div>
      </div>`;
  });
}
