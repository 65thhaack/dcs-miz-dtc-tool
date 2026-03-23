import { state } from '../state.js';
import { deepClone, findFlightById } from '../utils.js';
import { normalizeDtc } from '../dtc/normalize.js';
import { getDtcMergeParts } from '../dtc/export.js';
import { buildF16PreviewHtml } from './preview-f16.js';
import { buildF18PreviewHtml } from './preview-f18.js';
import { rerenderFlightCards } from './flight-cards.js';

export function buildPreviewShell(flight, family, tabs, activeTab, titleText, bodyHtml) {
  const gid = flight.groupId;
  const exportName = (flight.name || 'flight').replace(/[^a-zA-Z0-9_\-]/g, '_');
  const tabsHtml = tabs.map(t =>
    `<div class="tab${activeTab === t.id ? ' active' : ''}" data-action="switch-inline-preview-tab" data-panel="${t.id}">${t.label}</div>`
  ).join('');
  return `
    <div class="inline-preview-head">
      <div class="inline-preview-title">${titleText}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <button class="btn btn-outline" type="button" data-action="restore-flight" data-family="${family}" data-gid="${gid}">↺ Restore</button>
        <button class="btn btn-outline" type="button" data-action="show-preview-map" data-family="${family}" data-gid="${gid}">🗺 Map</button>
        <input type="text" class="export-name-inp" value="${exportName}" style="font-size:12px;padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--surface);color:var(--text);width:160px" title="Export filename (without .dtc)">
        <button class="btn btn-success" type="button" data-action="export-flight-dtc" data-family="${family}" data-gid="${gid}">⬇ Export Merged DTC</button>
        <button class="btn btn-outline" type="button" data-action="close-inline-preview" data-family="${family}" data-gid="${gid}">✕ Close</button>
      </div>
    </div>
    <div class="inline-preview-body">
      <div class="tabs" style="padding:0;border-bottom:1px solid var(--border)">${tabsHtml}</div>
      <div class="tab-content" style="padding:10px 0 0">${bodyHtml}</div>
    </div>
  `;
}

export function previewDtc(family = 'f16', groupId = null, isMissionDtc = false) {
  const isF18 = family === 'f18';
  const flights = isF18 ? state.f18Flights : state.f16Flights;
  const flight = groupId !== null
    ? flights.find(f => String(f.groupId) === String(groupId))
    : flights[0];
  if (!flight) return alert('Select a flight first.');

  // Ensure the relevant aircraft section and flight card are expanded before showing preview.
  const sectionBody = document.getElementById(`section-body-${family}`);
  const sectionChevron = document.getElementById(`section-chevron-${family}`);
  if (sectionBody?.classList.contains('collapsed')) {
    sectionBody.classList.remove('collapsed');
    if (sectionChevron) sectionChevron.style.transform = 'rotate(0deg)';
  }

  const card = document.getElementById(`fc-${family}-${flight.groupId}`);
  if (card?.classList.contains('collapsed')) card.classList.remove('collapsed');

  const previewId = `inline-preview-${family}-${flight.groupId}`;
  const preview = document.getElementById(previewId);
  if (!preview) return;

  const html = isF18 ? buildF18PreviewHtml(flight, family) : buildF16PreviewHtml(flight, family);
  preview.innerHTML = html;
  preview.classList.add('open');

  // Hide the card-level export row while the preview is open
  const exportDiv = document.getElementById(`card-export-${family}-${flight.groupId}`);
  if (exportDiv) exportDiv.style.display = 'none';

  // Scroll flight card header into view, then preview will be visible below
  const cardHead = card?.querySelector('.flight-head');
  if (cardHead) {
    cardHead.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

export function closeInlinePreview(family, groupId) {
  state.missionDtcViewMode = false;
  state.missionDtcFileName = null;
  const preview = document.getElementById(`inline-preview-${family}-${groupId}`);
  if (!preview) return;
  preview.classList.remove('open');
  preview.innerHTML = '';
  const cardPrefix = family === 'f18' ? 'f18' : 'f16';
  const exportDiv = document.getElementById(`card-export-${cardPrefix}-${groupId}`);
  if (exportDiv) exportDiv.style.display = 'flex';
}

export function previewFlightButton(btn) {
  state.missionDtcViewMode = false;
  state.missionDtcFileName = null;
  const previewId = `inline-preview-${btn.dataset.family}-${btn.dataset.gid}`;
  const alreadyOpen = document.getElementById(previewId)?.classList.contains('open');
  if (!alreadyOpen) {
    const flights = btn.dataset.family === 'f18' ? state.f18Flights : state.f16Flights;
    const flight = flights?.find(f => String(f.groupId) === String(btn.dataset.gid));
    if (flight) flight.inlinePreviewTab = 'wpt';
  }
  previewDtc(btn.dataset.family, btn.dataset.gid);
}

export function switchInlinePreviewTabBtn(tabEl) {
  const panel = tabEl.dataset.panel;
  const wrap = tabEl.closest('.inline-preview-panel');
  if (!wrap) return;
  wrap.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  wrap.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  tabEl.classList.add('active');
  const target = wrap.querySelector(`.tab-panel[data-ipanel="${panel}"]`);
  if (target) target.classList.add('active');

  const flight = findFlightById(wrap.dataset.gid);
  if (flight) flight.inlinePreviewTab = panel;
}

export function restoreMissionDtcForFlight(family, groupId) {
  const flights = family === 'f18' ? state.f18Flights : state.f16Flights;
  const flight = flights.find(f => String(f.groupId) === String(groupId));
  if (!flight) return;

  // Always return to editable (non-mission-DTC-view) mode
  state.missionDtcViewMode = false;
  state.missionDtcFileName = null;
  flight.inlinePreviewTab = 'wpt';

  // If a personal DTC is assigned, restore means re-apply it from scratch (keep it assigned).
  // If no personal DTC, this is a full reset back to .miz state.
  const savedDtc = flight.personalDtc ? deepClone(flight.personalDtc) : null;
  const savedDtcFileName = flight.personalDtcFileName;
  const savedMergeOptions = flight.dtcMergeOptions ? { ...flight.dtcMergeOptions } : undefined;

  delete flight.personalDtc;
  delete flight.personalDtcFileName;
  delete flight.f16CmdsPrograms;
  delete flight.f18CmdsEdits;
  delete flight.navSettingsF18;
  delete flight.guardComm1;
  delete flight.guardComm2;
  delete flight.selectedTacanKeys;
  delete flight.dtcMergeOptions;

  // Restore original waypoints and comms (Option B)
  if (flight.miz) {
    flight.waypoints = deepClone(flight.miz.waypoints);
    flight.radio1    = deepClone(flight.miz.radio1);
    flight.radio2    = deepClone(flight.miz.radio2);
  }

  // Reset waypoint roles to defaults from the mission DTC if present, else STPT
  const rawNav = family === 'f18' ? flight.defaultMissionDtc?._rawWypt : flight.defaultMissionDtc?._rawMpd;
  const navPts = rawNav?.NAV_PTS;
  if (navPts && Array.isArray(navPts)) {
    const navWps = flight.waypoints.filter(w => !w.isTakeoff && !w.isLand);
    navPts.forEach((pt, i) => {
      if (navWps[i]) navWps[i].pointType = pt.type || 'STPT';
    });
  } else {
    flight.waypoints.forEach(w => { w.pointType = 'STPT'; });
  }

  // If a personal DTC was assigned, re-apply it (restoring to its originally-merged state)
  if (savedDtc) {
    if (savedMergeOptions) flight.dtcMergeOptions = savedMergeOptions;
    assignPersonalDtcToFlight(family, flight, savedDtc, savedDtcFileName);
    return;
  }

  // Full reset — no personal DTC remains
  const anyPersonal = [...state.f16Flights, ...state.f18Flights].some(f => f.personalDtc);
  if (!anyPersonal) {
    document.getElementById('merge-pill').style.display = 'none';
    document.getElementById('dtc-fname').textContent = '';
    document.getElementById('dtc-card').classList.remove('active');
    document.getElementById('dtc-open-btn').style.display = 'none';
    document.getElementById('dtc-clear-btn').style.display = 'none';
    state.personalDtc = null;
  }

  // Capture open previews before rerenderFlightCards wipes the DOM
  const openPreviews = [...document.querySelectorAll('.inline-preview-panel.open')]
    .map(p => ({ family: p.dataset.family, gid: p.dataset.gid }));
  // Always keep this flight's preview open
  if (!openPreviews.some(p => p.family === family && String(p.gid) === String(groupId))) {
    openPreviews.push({ family, gid: String(groupId) });
  }

  rerenderFlightCards();
  openPreviews.forEach(({ family: f, gid }) => previewDtc(f, gid));
}

export function viewMissionDtcForFlight(family, groupId) {
  const flights = family === 'f18' ? state.f18Flights : state.f16Flights;
  const flight = flights.find(f => String(f.groupId) === String(groupId));
  if (!flight || !flight.defaultMissionDtc) return;

  // Load mission DTC into preview state
  state.previewDtc = flight.defaultMissionDtc;
  state.missionDtcViewMode = true;
  state.missionDtcFileName = flight.defaultMissionDtcFileName;

  // Trigger preview display
  previewDtc(family, groupId, true);
}

export function importDtcForFlight(family, groupId) {
  const input = document.getElementById('flight-import-dtc-input');
  if (!input) return;
  state.pendingImportTarget = { family, groupId: String(groupId) };
  input.value = '';
  input.click();
}

export async function handleFlightImportDtcFile(file) {
  if (!file) return;
  const target = state.pendingImportTarget;
  state.pendingImportTarget = null;
  if (!target) return;

  const flights = target.family === 'f18' ? state.f18Flights : state.f16Flights;
  const flight = flights.find(f => String(f.groupId) === String(target.groupId));
  if (!flight) {
    alert('Could not find the selected flight.');
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    alert('Could not parse .dtc file — expected JSON format (from Saved Games\\DCS\\dtc\\).');
    return;
  }

  const normalized = normalizeDtc(parsed);
  if (!normalized) {
    alert('Unrecognized .dtc format.\nExpected real DCS native format with at least { "data": { "COMM" }, "name", "type" }.');
    return;
  }

  const expected = target.family === 'f18' ? 'F18' : 'F16';
  if (normalized._aircraft !== expected) {
    alert(`This DTC is for ${normalized._aircraft === 'F18' ? 'F/A-18C' : 'F-16C'} and cannot be imported into ${target.family === 'f18' ? 'F/A-18C' : 'F-16C'} flight ${flight.name}.`);
    return;
  }

  assignPersonalDtcToFlight(target.family, flight, normalized, file.name);
}

export function assignPersonalDtcToFlight(family, flight, normalized, fileName) {
  if (!flight || !normalized) return;

  flight.personalDtc = deepClone(normalized);
  flight.personalDtcFileName = fileName || flight.personalDtcFileName || 'personal.dtc';
  state.personalDtc = flight.personalDtc;

  // Reset lazily-initialized fields so they get re-derived from the new personal DTC
  delete flight.f16CmdsPrograms;
  delete flight.f18CmdsEdits;
  delete flight.navSettingsF18;

  // Apply pointType (role) from NAV_PTS in the imported DTC back onto mission waypoints
  const rawNav = normalized._aircraft === 'F18' ? normalized._rawWypt : normalized._rawMpd;
  const importedNavPts = rawNav?.NAV_PTS;
  if (importedNavPts && Array.isArray(importedNavPts) && !flight._standalone
      && (flight.dtcMergeOptions?.waypoints !== false)) {
    const navWps = flight.waypoints.filter(w => !w.isTakeoff && !w.isLand);
    importedNavPts.forEach((pt, i) => {
      if (!navWps[i]) return;
      if (pt.type && pt.type !== 'STPT') navWps[i].pointType = pt.type;
      if (pt.note) navWps[i].name = pt.note;
    });
  }

  document.getElementById('dtc-fname').textContent = flight.personalDtcFileName;
  document.getElementById('dtc-card').classList.add('active');

  const mergeDesc = getDtcMergeParts(flight.personalDtc);
  document.getElementById('merge-pill').style.display = 'inline-flex';
  document.getElementById('merge-pill').textContent = `✓ ${mergeDesc} assigned to ${flight.name}`;
  document.getElementById('dtc-open-btn').style.display = 'inline-flex';
  document.getElementById('dtc-clear-btn').style.display = 'inline-flex';

  rerenderFlightCards();
  flight.inlinePreviewTab = 'wpt';
  previewDtc(family, flight.groupId);
}
