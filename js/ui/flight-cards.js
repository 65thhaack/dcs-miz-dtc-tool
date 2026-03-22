// js/ui/flight-cards.js
import { state } from '../state.js';
import { wpTag } from '../utils.js';
import { latDecimalMinutes, lonDecimalMinutes, latDms, lonDms } from '../coords.js';

export function renderFlights(flights, cfg) {
  const container = document.getElementById(cfg.containerId);
  container.innerHTML = '';

  document.getElementById(cfg.emptyId).style.display = flights.length ? 'none' : 'block';
  setSectionCount(cfg.sectionKey, flights.length);
  const formatLatitude = cfg.family === 'f16' ? latDecimalMinutes : latDms;
  const formatLongitude = cfg.family === 'f16' ? lonDecimalMinutes : lonDms;

  for (const fl of flights) {
    const safeGroupIdAttr = String(fl.groupId)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');

    // Build unit chips
    const chips = fl.units.map(u =>
      `<span class="chip">${u.name}${u.callsign ? ` (${u.callsign})` : ''} <span class="skill">${u.skill}</span></span>`
    ).join('');
    const assigned = fl.personalDtc
      ? `<div class="assigned-pill">✓ Personal DTC<span class="fname">${fl.personalDtcFileName || 'assigned'}</span></div>`
      : '';
    const missionDtcPill = fl.defaultMissionDtc
      ? (() => {
          const hasPersonal = !!fl.personalDtc;
          const btnLabel = hasPersonal ? 'Restore' : 'View';
          const btnAction = hasPersonal ? 'restore-flight' : 'view-mission-dtc';
          return `<div class="assigned-pill" style="background:rgba(210,153,34,0.1);border-color:var(--amber);color:var(--amber)">📦 Default Mission DTC<span class="fname">${fl.defaultMissionDtcFileName || 'default'}</span><button class="btn btn-outline" type="button" style="margin-left:8px;padding:2px 6px;font-size:11px;display:inline;height:auto" data-action="${btnAction}" data-family="${cfg.family}" data-gid="${safeGroupIdAttr}">${btnLabel}</button></div>`;
        })()
      : '';

    // Waypoints rows — read-only mission view; role editing lives in the DTC Preview panel
    // Always read from miz.waypoints so DTC edits never mutate the .miz display
    const wpRows = (fl.miz?.waypoints ?? fl.waypoints).map((wp, i) => {
      const isNav = !wp.isTakeoff && !wp.isLand;
      const type  = (wp.pointType || 'STPT').toLowerCase();
      const sym   = { stpt:'○', ip:'□', tgt:'△', vrp:'◇', pup:'▽', oa1:'①', oa2:'②' }[type] || '○';
      const roleCell = isNav
        ? `<td><span class="pt-badge pt-${type}">${sym} ${wp.pointType || 'STPT'}</span></td>`
        : `<td style="color:var(--muted)">—</td>`;
      return `
      <tr>
        <td style="color:var(--muted);width:32px">${wp.isTakeoff || wp.isLand ? '—' : wp.seq}</td>
        <td style="width:58px">${wpTag(wp)}</td>
        ${roleCell}
        <td style="color:var(--muted)">${wp.name || '—'}</td>
        <td>${formatLatitude(wp.lat)}</td>
        <td>${formatLongitude(wp.lon)}</td>
        <td>${wp.alt_ft.toLocaleString()} <span style="color:var(--muted);font-size:10px">${wp.alt_type}</span></td>
        <td>${wp.speed_kts} <span style="color:var(--muted);font-size:10px">kts</span></td>
      </tr>`;
    }).join('');

    // COM channel rows helper
    const comRows = (radio, cls) => {
      const keys = Object.keys(radio).map(Number).sort((a, b) => a - b);
      return keys.map(ch =>
        `<tr><td style="color:var(--muted);width:80px">CH ${String(ch).padStart(2,'0')}</td><td class="${cls}">${Number(radio[ch]).toFixed(3)}</td></tr>`
      ).join('');
    };

    const card = document.createElement('div');
    card.id = `fc-${cfg.cardPrefix}-${fl.groupId}`;

    if (fl._standalone) {
      // Standalone DTC (no .miz loaded): skip the mission top-section entirely.
      // Only the DTC editor (inline preview panel) is relevant.
      card.className = 'flight-card';
      card.innerHTML = `
        <div class="flight-head">
          <div class="flight-head-left">
            <div>
              <div class="flight-name">${fl.name}</div>
              <div class="flight-meta"><span style="color:var(--amber)">DTC Only</span> — no mission loaded</div>
              ${assigned}
            </div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center">
            <button class="btn btn-primary" type="button" data-action="preview-flight" data-family="${cfg.family}" data-gid="${safeGroupIdAttr}">👁 Preview/Edit</button>
          </div>
        </div>`;
    } else {
      card.className = 'flight-card collapsed';
      card.innerHTML = `
      <div class="flight-head">
        <div class="flight-head-left" data-action="toggle-flight-from-head">
          <span class="chevron">▼</span>
          <div>
            <div class="flight-name">${fl.name}</div>
            <div class="flight-meta">${fl.side.toUpperCase()} · ${fl.country} · ${fl.units.length} aircraft · ${(fl.miz?.waypoints ?? fl.waypoints).length} route points</div>
            ${assigned}
            ${missionDtcPill}
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center">
          <button class="btn btn-primary" type="button" data-action="preview-flight" data-family="${cfg.family}" data-gid="${safeGroupIdAttr}">👁 Preview/Edit</button>
          <div id="card-export-${cfg.cardPrefix}-${safeGroupIdAttr}" style="display:flex;gap:6px;align-items:center">
            <input type="text" class="card-export-name-inp" value="${fl.name.replace(/[^a-zA-Z0-9_\-]/g, '_')}" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);width:160px" title="Export filename (without .dtc)">
            <button class="btn btn-success" type="button" data-action="export-flight-button" data-family="${cfg.family}" data-gid="${safeGroupIdAttr}">⬇ Export Miz as DTC</button>
          </div>
        </div>
        ${chips ? `<div class="unit-chips" style="flex-basis:100%;padding-top:8px;margin-top:4px;border-top:1px solid var(--border)">${chips}</div>` : ''}
      </div>
      <div class="tabs" id="tabs-${cfg.cardPrefix}-${fl.groupId}">
        <button class="tab flight-tab active" type="button" data-card-prefix="${cfg.cardPrefix}" data-group-id="${safeGroupIdAttr}" data-panel="wpt">Waypoints</button>
        <button class="tab flight-tab" type="button" data-card-prefix="${cfg.cardPrefix}" data-group-id="${safeGroupIdAttr}" data-panel="c1">COM1 - UHF</button>
        <button class="tab flight-tab" type="button" data-card-prefix="${cfg.cardPrefix}" data-group-id="${safeGroupIdAttr}" data-panel="c2">COM2 - VHF</button>
      </div>
      <div class="tab-content">
        <div class="tab-panel active" id="tp-${cfg.cardPrefix}-${fl.groupId}-wpt">
          <table>
            <thead><tr><th>#</th><th>Type</th><th>Role</th><th>Name</th><th>Latitude</th><th>Longitude</th><th>Altitude (ft)</th><th>Speed</th></tr></thead>
            <tbody>${wpRows || '<tr><td colspan="8" style="color:var(--muted);text-align:center">No waypoints</td></tr>'}</tbody>
          </table>
        </div>
        <div class="tab-panel" id="tp-${cfg.cardPrefix}-${fl.groupId}-c1">
          <table>
            <thead><tr><th>Channel</th><th>Frequency (MHz)</th></tr></thead>
            <tbody>${comRows(fl.miz?.radio1 ?? fl.radio1, 'uhf') || '<tr><td colspan="2" style="color:var(--muted)">No COM1 data</td></tr>'}</tbody>
          </table>
        </div>
        <div class="tab-panel" id="tp-${cfg.cardPrefix}-${fl.groupId}-c2">
          <table>
            <thead><tr><th>Channel</th><th>Frequency (MHz)</th></tr></thead>
            <tbody>${comRows(fl.miz?.radio2 ?? fl.radio2, 'vhf') || '<tr><td colspan="2" style="color:var(--muted)">No COM2 data</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    }
    card.innerHTML += `<div class="inline-preview-panel" id="inline-preview-${cfg.cardPrefix}-${fl.groupId}" data-family="${cfg.family}" data-gid="${safeGroupIdAttr}"></div>`;
    container.appendChild(card);
  }
}

export function updateSectionVisibility() {
  // When a miz is loaded, always show both sections (empty message is informative).
  // When only a standalone DTC is loaded, hide the section with no flights.
  const hasMiz = !!state.missionName;
  const showF16 = hasMiz || state.f16Flights.length > 0;
  const showF18 = hasMiz || state.f18Flights.length > 0;
  const display16 = showF16 ? '' : 'none';
  const display18 = showF18 ? '' : 'none';
  document.getElementById('section-header-f16').style.display = display16;
  document.getElementById('section-body-f16').style.display   = display16;
  document.getElementById('section-header-f18').style.display = display18;
  document.getElementById('section-body-f18').style.display   = display18;
}

export function rerenderFlightCards() {
  renderFlights(state.f16Flights, {
    containerId: 'flights-container-f16',
    emptyId: 'no-f16s',
    cardPrefix: 'f16',
    family: 'f16',
    sectionKey: 'f16',
  });
  renderFlights(state.f18Flights, {
    containerId: 'flights-container-f18',
    emptyId: 'no-f18s',
    cardPrefix: 'f18',
    family: 'f18',
    sectionKey: 'f18',
  });
  updateSectionVisibility();
}

export function toggleFlightFromHead(headEl) {
  const card = headEl.closest('.flight-card');
  if (card) card.classList.toggle('collapsed');
}

export function toggleFlight(cardPrefix, gid) {
  // Backward-compatible wrapper for any old inline handlers.
  const card = document.getElementById(`fc-${cardPrefix}-${gid}`);
  if (card) card.classList.toggle('collapsed');
}

export function onFlightTabClick(evt) {
  const tabEl = evt.target.closest('.flight-tab');
  if (!tabEl) return;
  switchTab(tabEl.dataset.cardPrefix, tabEl.dataset.groupId, tabEl.dataset.panel, tabEl);
}

export function switchTab(cardPrefix, groupId, panel, tabEl) {
  const card = document.getElementById(`fc-${cardPrefix}-${groupId}`);
  if (!card) return;
  // Exclude the inline preview panel — its tabs are managed independently
  const preview = card.querySelector('.inline-preview-panel');
  card.querySelectorAll('.tab').forEach(t => { if (!preview?.contains(t)) t.classList.remove('active'); });
  card.querySelectorAll('.tab-panel').forEach(p => { if (!preview?.contains(p)) p.classList.remove('active'); });
  tabEl.classList.add('active');
  const targetPanel = document.getElementById(`tp-${cardPrefix}-${groupId}-${panel}`);
  if (targetPanel) targetPanel.classList.add('active');
}

export function setSectionCount(section, count) {
  const el = document.getElementById(`section-count-${section}`);
  if (el) el.textContent = `(${count})`;
}

export function toggleSection(section) {
  const body = document.getElementById(`section-body-${section}`);
  const chev = document.getElementById(`section-chevron-${section}`);
  if (!body || !chev) return;
  body.classList.toggle('collapsed');
  chev.style.transform = body.classList.contains('collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
}
