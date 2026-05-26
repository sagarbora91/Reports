/* Saagar Audit — single-page vanilla JS app.
   No framework, no build step. The whole UI is rendered by string templates
   into the three tab sections. State lives in localStorage under one key. */

'use strict';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const STORE_KEY = 'saagar_audit_v1';

const Store = {
  load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return Store.empty();
      const s = JSON.parse(raw);
      return Object.assign(Store.empty(), s);
    } catch (e) {
      console.error('localStorage corrupted, resetting', e);
      return Store.empty();
    }
  },
  save(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); },
  empty() { return { audits: [], cros: [], current_audit_id: null, auditor_name: '' }; },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid() {
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function today() { return new Date().toISOString().slice(0, 10); }

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 1800);
}

// ---------------------------------------------------------------------------
// Score (Spec §6.1 – §6.2)
// ---------------------------------------------------------------------------

function scoreAudit(results) {
  let raw = 0, max = 0, p = 0, f = 0, na = 0;
  CHECKPOINTS.forEach(cp => {
    const r = (results[cp.id] || {}).result;
    if (r === 'P') { raw += cp.weight; max += cp.weight; p++; }
    else if (r === 'F') { max += cp.weight; f++; }
    else if (r === 'NA') { na++; }
  });
  const pct = max > 0 ? Math.round((raw / max) * 1000) / 10 : 100;
  let band = 'critical';
  if (pct >= 95)      band = 'excellent';
  else if (pct >= 90) band = 'good';
  else if (pct >= 85) band = 'fair';
  else if (pct >= 80) band = 'poor';
  return { raw, max, pct, band, p, f, na, total: CHECKPOINTS.length };
}

function bandLabel(band) {
  return { excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor', critical: 'Critical' }[band];
}

// ---------------------------------------------------------------------------
// Audit lifecycle
// ---------------------------------------------------------------------------

function currentAudit(state) {
  return state.audits.find(a => a.id === state.current_audit_id) || null;
}

function audit(id, state) {
  return state.audits.find(a => a.id === id) || null;
}

function startNewAudit({ date, auditorName, croIds }) {
  const state = Store.load();
  // If an unsubmitted draft already exists for today, replace it.
  state.audits = state.audits.filter(a => !(a.date === date && a.status === 'draft'));
  const newAudit = {
    id: uuid(),
    date,
    auditor_name: auditorName,
    cros: croIds.slice(),
    status: 'draft',
    results: {},
    started_at: new Date().toISOString(),
    submitted_at: null,
  };
  state.audits.push(newAudit);
  state.current_audit_id = newAudit.id;
  state.auditor_name = auditorName;
  Store.save(state);
  return newAudit;
}

function markCheckpoint(checkpointId, result, opts = {}) {
  const state = Store.load();
  const a = currentAudit(state);
  if (!a) return;
  a.results[checkpointId] = {
    result,
    finding: opts.finding || '',
    cro_id: opts.croId || null,
    at: new Date().toISOString(),
  };
  Store.save(state);
}

function nextUnmarkedIndex(audit) {
  for (let i = 0; i < CHECKPOINTS.length; i++) {
    if (!audit.results[CHECKPOINTS[i].id]) return i;
  }
  return CHECKPOINTS.length; // all done
}

function submitAudit() {
  const state = Store.load();
  const a = currentAudit(state);
  if (!a) return null;
  const s = scoreAudit(a.results);
  a.status = 'submitted';
  a.submitted_at = new Date().toISOString();
  a.score = s;
  state.current_audit_id = null;
  Store.save(state);
  return a;
}

// ---------------------------------------------------------------------------
// Rendering — tabs
// ---------------------------------------------------------------------------

function render() {
  const state = Store.load();
  document.getElementById('tab-audit').innerHTML = renderAuditTab(state);
  document.getElementById('tab-history').innerHTML = renderHistoryTab(state);
  document.getElementById('tab-settings').innerHTML = renderSettingsTab(state);
}

function renderAuditTab(state) {
  const a = currentAudit(state);
  if (a) return renderInProgressAudit(a);
  return renderStartAudit(state);
}

function renderStartAudit(state) {
  const todays = state.audits.find(x => x.date === today() && x.status === 'submitted');
  const lastName = state.auditor_name || '';
  const cros = state.cros;
  return `
    <div class="card">
      <h2>Daily audit</h2>
      <p class="muted">${escapeHtml(fmtDate(today()))}</p>
      ${todays
        ? `<div class="card" style="background:var(--green-pale);border-color:var(--green);margin-top:12px">
            <strong>Submitted today</strong>
            <p>${todays.score.pct.toFixed(1)}% &middot; ${bandLabel(todays.score.band)}</p>
          </div>`
        : ''}
      <div class="spacer-12"></div>
      <label class="field">
        <span>Your name (auditor)</span>
        <input type="text" id="auditorName" value="${escapeHtml(lastName)}" placeholder="e.g. Sagar" autocomplete="name">
      </label>
      <label class="field">
        <span>Audit date</span>
        <input type="date" id="auditDate" value="${today()}" max="${today()}">
      </label>
      <div class="field">
        <div class="row-spread">
          <span style="font-size:13px;color:var(--gray-600)">CROs on duty</span>
          <button class="iconbtn" style="color:var(--navy);font-size:14px" data-action="add-cro">+ Add CRO</button>
        </div>
        ${cros.length === 0
          ? '<p class="muted">No CROs yet. Tap "+ Add CRO" above to add your floor staff.</p>'
          : cros.map(c => `
            <div class="cro-row">
              <label>
                <input type="checkbox" class="cro-check" value="${escapeHtml(c.id)}">
                ${escapeHtml(c.name)}
                <span class="pill">${escapeHtml(c.counter)}</span>
              </label>
            </div>`).join('')}
      </div>
      <div id="startError" class="error" hidden></div>
      <button class="btn btn-primary" data-action="start-audit">Start daily audit</button>
    </div>
    <p class="tiny" style="text-align:center;margin-top:16px">68 checkpoints &middot; ~30 to 45 minutes &middot; target 90% Good or above</p>
  `;
}

function renderInProgressAudit(a) {
  const idx = nextUnmarkedIndex(a);
  if (idx >= CHECKPOINTS.length) return renderReviewAudit(a);

  const cp = CHECKPOINTS[idx];
  const sop = SOPS.find(s => s.id === cp.sop_id);
  const live = scoreAudit(a.results);
  const pct = Math.round(((idx) / CHECKPOINTS.length) * 100);
  const allowsNa = cp.allows_na;

  return `
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="cp-meta">
      <span class="sop-chip ${sop.critical ? 'critical' : ''}">${escapeHtml(sop.name)}</span>
      <span>CP ${escapeHtml(cp.id)}</span>
      <span style="margin-left:auto">${idx + 1} of ${CHECKPOINTS.length}</span>
    </div>
    <div class="card">
      <div class="cp-text">${escapeHtml(cp.text)}</div>
      ${cp.evidence ? `<div class="cp-evidence">Evidence: ${escapeHtml(cp.evidence)}</div>` : ''}
      ${cp.photo_required_on_fail
        ? `<div class="photo-required-badge">Photo required if FAIL</div>`
        : ''}
    </div>
    <div class="btn-row">
      <button class="btn btn-pass" data-action="mark" data-verdict="P">PASS</button>
      <button class="btn btn-fail" data-action="mark" data-verdict="F">FAIL</button>
      ${allowsNa ? `<button class="btn btn-na" data-action="mark" data-verdict="NA">N / A</button>` : ''}
    </div>
    <div class="minicounts">
      <div class="minicount p"><span class="n">${live.p}</span><span class="lbl">PASS</span></div>
      <div class="minicount f"><span class="n">${live.f}</span><span class="lbl">FAIL</span></div>
      <div class="minicount na"><span class="n">${live.na}</span><span class="lbl">N/A</span></div>
    </div>
    <div class="spacer-24"></div>
    <button class="btn btn-ghost" data-action="cancel-audit">Cancel audit</button>
  `;
}

function renderReviewAudit(a) {
  const s = scoreAudit(a.results);
  return `
    <div class="card score-card">
      <p class="tiny">DRAFT &middot; review before submit</p>
      <div class="score-pct ${s.band}">${s.pct.toFixed(1)}%</div>
      <div class="score-band ${s.band}">${bandLabel(s.band)}</div>
      <p class="muted">${s.raw} of ${s.max} weighted points &middot; ${s.p} pass &middot; ${s.f} fail &middot; ${s.na} N/A</p>
    </div>
    <button class="btn btn-primary" data-action="submit-audit">Submit audit</button>
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="cancel-audit">Discard draft</button>
  `;
}

function renderHistoryTab(state) {
  const submitted = state.audits
    .filter(a => a.status === 'submitted')
    .sort((a, b) => b.date.localeCompare(a.date));
  if (submitted.length === 0) {
    return `<div class="card"><h2>No submitted audits yet</h2><p class="muted">Once you submit a daily audit it'll appear here.</p></div>`;
  }
  return submitted.map(a => {
    const s = a.score;
    return `
      <div class="hist-row" data-action="open-history" data-id="${a.id}">
        <div>
          <strong>${escapeHtml(fmtDate(a.date))}</strong>
          <div class="tiny">${s.p} P &middot; ${s.f} F &middot; ${s.na} N/A</div>
        </div>
        <div class="pct ${s.band}">${s.pct.toFixed(1)}%</div>
      </div>`;
  }).join('') + `
    <div class="spacer-12"></div>
    <button class="btn btn-ghost" data-action="export-csv">Export all to CSV</button>
  `;
}

function renderSettingsTab(state) {
  return `
    <div class="card">
      <h2>CROs</h2>
      <p class="muted">Staff who appear in the "CROs on duty" picker and the FAIL detail dropdown.</p>
      ${state.cros.length === 0
        ? '<p class="muted">No CROs yet.</p>'
        : state.cros.map(c => `
          <div class="cro-row">
            <span>${escapeHtml(c.name)}<span class="pill">${escapeHtml(c.counter)}</span></span>
            <button class="iconbtn" style="color:var(--red)" data-action="remove-cro" data-id="${c.id}">Remove</button>
          </div>`).join('')}
      <div class="spacer-12"></div>
      <button class="btn btn-secondary" data-action="add-cro">+ Add CRO</button>
    </div>
    <div class="card">
      <h2>Data</h2>
      <p class="muted">${state.audits.length} audit(s) stored on this device. Nothing leaves your phone.</p>
      <button class="btn btn-ghost" data-action="export-csv">Export all to CSV</button>
      <div class="spacer-12"></div>
      <button class="btn btn-ghost" data-action="clear-data" style="color:var(--red);border-color:var(--red)">Erase all data</button>
    </div>
    <p class="tiny" style="text-align:center">Saagar Audit &middot; v0.1.0</p>
  `;
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function openModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="modal" data-modal>${html}</div></div>`;
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function failModal(checkpoint, cros) {
  const required = checkpoint.photo_required_on_fail;
  const croOptions = ['<option value="">— not attributed —</option>']
    .concat(cros.map(c => `<option value="${c.id}">${escapeHtml(c.name)} · ${escapeHtml(c.counter)}</option>`))
    .join('');
  openModal(`
    <h3>FAIL — CP ${escapeHtml(checkpoint.id)}</h3>
    <p class="muted">${escapeHtml(checkpoint.text)}</p>
    <label class="field">
      <span>What did you find? <span style="color:var(--red)">*</span></span>
      <textarea id="failFinding" maxlength="200" placeholder="e.g. CRO Suresh had no name badge at opening"></textarea>
    </label>
    <label class="field">
      <span>CRO involved (optional)</span>
      <select id="failCro">${croOptions}</select>
    </label>
    ${required ? `<p class="muted" style="color:var(--red)">Note: this checkpoint is a Cash/Inventory critical (★). In production a photo will be required here. Photo capture lands in the next release.</p>` : ''}
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-fail">Save &amp; next</button>
    </div>
  `);
}

function naModal(checkpoint) {
  openModal(`
    <h3>N/A — CP ${escapeHtml(checkpoint.id)}</h3>
    <p class="muted">${escapeHtml(checkpoint.text)}</p>
    <label class="field">
      <span>Why is this not applicable today?</span>
      <textarea id="naReason" maxlength="200" placeholder="e.g. counter closed today, no high-value sales"></textarea>
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-na">Mark N/A</button>
    </div>
  `);
}

function addCroModal() {
  openModal(`
    <h3>Add CRO</h3>
    <label class="field">
      <span>Name</span>
      <input type="text" id="croName" placeholder="e.g. Suresh">
    </label>
    <label class="field">
      <span>Counter</span>
      <select id="croCounter">
        <option value="Titan">Titan World</option>
        <option value="Helios">Helios</option>
      </select>
    </label>
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Cancel</button>
      <button class="btn btn-primary" data-action="modal-save-cro">Add</button>
    </div>
  `);
}

function historyDetailModal(a) {
  const s = a.score;
  const fails = Object.entries(a.results)
    .filter(([, r]) => r.result === 'F')
    .map(([cpId, r]) => {
      const cp = CHECKPOINTS.find(x => x.id === cpId);
      return `<li><strong>${escapeHtml(cpId)}</strong> — ${escapeHtml(cp ? cp.text : '')}<br><span class="muted">${escapeHtml(r.finding || '(no finding text)')}</span></li>`;
    }).join('');
  openModal(`
    <h3>${escapeHtml(fmtDate(a.date))}</h3>
    <p class="muted">Submitted ${escapeHtml(new Date(a.submitted_at).toLocaleString('en-IN'))}</p>
    <div class="score-card" style="padding:12px">
      <div class="score-pct ${s.band}" style="font-size:48px">${s.pct.toFixed(1)}%</div>
      <div class="score-band ${s.band}">${bandLabel(s.band)}</div>
      <p class="muted">${s.p} P &middot; ${s.f} F &middot; ${s.na} N/A</p>
    </div>
    ${fails ? `<h3 style="margin-top:16px">Findings (${a.score.f})</h3><ul>${fails}</ul>` : '<p class="muted">No failures — clean audit.</p>'}
    <div class="row">
      <button class="btn btn-ghost" data-action="modal-cancel">Close</button>
    </div>
  `);
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function exportCsv() {
  const state = Store.load();
  const submitted = state.audits.filter(a => a.status === 'submitted');
  if (submitted.length === 0) { toast('No submitted audits yet'); return; }
  const rows = [['date', 'auditor', 'compliance_pct', 'band', 'raw', 'max', 'pass', 'fail', 'na', 'checkpoint_id', 'result', 'finding', 'cro_id']];
  submitted.forEach(a => {
    Object.entries(a.results).forEach(([cpId, r]) => {
      rows.push([
        a.date,
        a.auditor_name || '',
        a.score.pct.toFixed(1),
        a.score.band,
        a.score.raw,
        a.score.max,
        a.score.p,
        a.score.f,
        a.score.na,
        cpId,
        r.result,
        r.finding || '',
        r.cro_id || '',
      ]);
    });
  });
  const csv = rows.map(r => r.map(v => {
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `saagar_audit_${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { switchTab(t.dataset.tab); return; }

  const a = e.target.closest('[data-action]');
  if (!a) return;
  const action = a.dataset.action;

  if (action === 'modal-cancel' || action === 'modal-backdrop') { closeModal(); return; }
  if (e.target.matches('[data-modal-backdrop]')) { closeModal(); return; }

  if (action === 'add-cro')     { addCroModal(); return; }
  if (action === 'modal-save-cro') {
    const name = document.getElementById('croName').value.trim();
    const counter = document.getElementById('croCounter').value;
    if (name.length < 2) { toast('Name too short'); return; }
    const state = Store.load();
    state.cros.push({ id: uuid(), name, counter });
    Store.save(state);
    closeModal();
    render();
    return;
  }
  if (action === 'remove-cro') {
    if (!confirm('Remove this CRO?')) return;
    const id = a.dataset.id;
    const state = Store.load();
    state.cros = state.cros.filter(c => c.id !== id);
    Store.save(state);
    render();
    return;
  }

  if (action === 'start-audit') {
    const name = document.getElementById('auditorName').value.trim();
    const date = document.getElementById('auditDate').value;
    const croIds = Array.from(document.querySelectorAll('.cro-check:checked')).map(el => el.value);
    const err = document.getElementById('startError');
    err.hidden = true;
    if (name.length < 2) { err.textContent = 'Enter your name.'; err.hidden = false; return; }
    if (!date)           { err.textContent = 'Pick a date.'; err.hidden = false; return; }
    if (croIds.length === 0) { err.textContent = 'Select at least one CRO on duty.'; err.hidden = false; return; }
    startNewAudit({ date, auditorName: name, croIds });
    render();
    return;
  }

  if (action === 'mark') {
    const verdict = a.dataset.verdict;
    const state = Store.load();
    const audit = currentAudit(state);
    if (!audit) return;
    const idx = nextUnmarkedIndex(audit);
    const cp = CHECKPOINTS[idx];
    if (!cp) return;

    if (verdict === 'P')  { markCheckpoint(cp.id, 'P'); render(); return; }
    if (verdict === 'F')  { failModal(cp, state.cros.filter(c => audit.cros.includes(c.id))); return; }
    if (verdict === 'NA') { naModal(cp); return; }
  }

  if (action === 'modal-save-fail') {
    const finding = document.getElementById('failFinding').value.trim();
    if (finding.length < 5) { toast('Describe what you found (5+ characters)'); return; }
    const croId = document.getElementById('failCro').value || null;
    const state = Store.load();
    const audit = currentAudit(state);
    const idx = nextUnmarkedIndex(audit);
    const cp = CHECKPOINTS[idx];
    markCheckpoint(cp.id, 'F', { finding, croId });
    closeModal();
    render();
    return;
  }
  if (action === 'modal-save-na') {
    const reason = document.getElementById('naReason').value.trim();
    if (reason.length < 3) { toast('Add a short reason'); return; }
    const state = Store.load();
    const audit = currentAudit(state);
    const idx = nextUnmarkedIndex(audit);
    const cp = CHECKPOINTS[idx];
    markCheckpoint(cp.id, 'NA', { finding: reason });
    closeModal();
    render();
    return;
  }

  if (action === 'submit-audit') {
    const submitted = submitAudit();
    if (submitted) {
      toast(`Audit submitted: ${submitted.score.pct.toFixed(1)}% ${bandLabel(submitted.score.band)}`);
    }
    render();
    return;
  }
  if (action === 'cancel-audit') {
    if (!confirm('Discard this draft? Your marks will be lost.')) return;
    const state = Store.load();
    state.audits = state.audits.filter(x => x.id !== state.current_audit_id);
    state.current_audit_id = null;
    Store.save(state);
    render();
    return;
  }

  if (action === 'open-history') {
    const state = Store.load();
    const found = audit(a.dataset.id, state);
    if (found) historyDetailModal(found);
    return;
  }
  if (action === 'export-csv') { exportCsv(); return; }
  if (action === 'clear-data') {
    if (!confirm('Erase all audits and CROs from this device? This cannot be undone.')) return;
    localStorage.removeItem(STORE_KEY);
    render();
    switchTab('audit');
    toast('All data erased');
    return;
  }
});

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-' + name));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

render();
