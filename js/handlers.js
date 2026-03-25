// js/handlers.js — app entry point; event delegation + file handlers
import { state } from './state.js';
import { deepClone, allFlights, queueSelectInputContents, showStatus } from './utils.js';
import { LuaParser } from './miz/lua-parser.js';
import { extractFlightsByType, extractTacanCandidates, extractAssets, extractAirdromes, isF16Type, isF18Type } from './miz/extractor.js';
import { normalizeDtc } from './dtc/normalize.js';
import { exportFlightDtc, exportFlightButton } from './dtc/export.js';
import { exportFlightKneeboard, restoreKneeboardForFlight } from './kneeboard/export.js';
import { renderFlights, updateSectionVisibility, rerenderFlightCards, toggleFlightFromHead, toggleSection } from './ui/flight-cards.js';
import { previewDtc, closeInlinePreview, previewFlightButton, switchInlinePreviewTabBtn, restoreMissionDtcForFlight, viewMissionDtcForFlight, importDtcForFlight, handleFlightImportDtcFile } from './ui/preview.js';
import { setWpType, setTargetData, setWaypointName, setWaypointAlt, setWaypointSpeed, setWaypointTos, removeWaypoint, setCommChannelField, setF18CommGuard, setF18NavSetting, setF18TacanSelected, setCmdsField, setKneeboardField, setKneeboardLoadoutField, setKneeboardUnitCallsign, setKneeboardUnitTailNumber, setKneeboardRouteField, setKneeboardUnitCode } from './ui/editors.js';
import { openFlightSelectDialogForDtc, selectFlightForPendingDtc, closeFlightSelectDialog } from './ui/modals.js';
import { showPreviewFlightMap, showAllFlightsMap, setMapTile, closeFlightMap, removeWaypointFromMap } from './map/map.js';
import { loadAirfieldData } from './airfields/runways.js';

// ── Event delegation maps ─────────────────────────────────────────────────────

const CLICK_ACTIONS = {
  'clear-miz':                (el, e) => clearMiz(e),
  'open-personal-dtc':        (el, e) => openPersonalDtcSelector(e),
  'clear-personal-dtc':       (el, e) => clearPersonalDtc(e),
  'toggle-section':           (el)    => toggleSection(el.dataset.section),
  'show-all-flights-map':     ()      => showAllFlightsMap(),
  'restore-flight':           (el)    => restoreMissionDtcForFlight(el.dataset.family, el.dataset.gid),
  'view-mission-dtc':         (el)    => viewMissionDtcForFlight(el.dataset.family, el.dataset.gid),
  'preview-flight':           (el)    => previewFlightButton(el),
  'toggle-flight-from-head':  (el)    => toggleFlightFromHead(el),
  'export-flight-button':     (el)    => exportFlightButton(el),
  'remove-waypoint':          (el)    => removeWaypoint(el),
  'show-preview-map':         (el)    => showPreviewFlightMap(el.dataset.family, el.dataset.gid),
  'export-flight-dtc':        (el)    => exportFlightDtc(el.dataset.family, el.dataset.gid),
  'export-flight-kneeboard':  (el)    => exportFlightKneeboard(el.dataset.family, el.dataset.gid),
  'close-inline-preview':     (el)    => closeInlinePreview(el.dataset.family, el.dataset.gid),
  'restore-kneeboard':        (el)    => restoreKneeboardForFlight(el.dataset.family, el.dataset.gid),
  'switch-inline-preview-tab':(el)    => switchInlinePreviewTabBtn(el),
  'select-flight-for-dtc':    (el)    => selectFlightForPendingDtc(el.dataset.family, el.dataset.gid),
  'remove-waypoint-from-map': (el)    => removeWaypointFromMap(el),
  'close-flight-select':      ()      => closeFlightSelectDialog(),
  'set-map-tile':             (el)    => setMapTile(el.dataset.tile),
  'close-flight-map':         ()      => closeFlightMap(),
  'show-all-map':             ()      => showAllFlightsMap(),
  'import-dtc-for-flight':    (el)    => importDtcForFlight(el.dataset.family, el.dataset.gid),
  'on-flight-tab-click':      (el, e) => onFlightTabClick(e),
};

const CHANGE_ACTIONS = {
  'set-comm-channel-field': (el) => setCommChannelField(el),
  'set-f18-tacan-selected': (el) => setF18TacanSelected(el),
  'set-f18-nav-setting':    (el) => setF18NavSetting(el),
  'set-cmds-field':         (el) => setCmdsField(el),
  'set-f18-comm-guard':     (el) => setF18CommGuard(el),
  'set-wp-type':            (el) => setWpType(el),
  'set-kneeboard-field':    (el) => setKneeboardField(el),
  'set-kneeboard-loadout-field': (el) => setKneeboardLoadoutField(el),
  'set-kneeboard-unit-callsign': (el) => setKneeboardUnitCallsign(el),
  'set-kneeboard-unit-tail-number': (el) => setKneeboardUnitTailNumber(el),
  'set-kneeboard-unit-code': (el) => setKneeboardUnitCode(el),
  'set-kneeboard-route-field': (el) => setKneeboardRouteField(el),
};

const INPUT_ACTIONS = {
  'set-waypoint-name':      (el) => setWaypointName(el),
  'set-waypoint-alt':       (el) => setWaypointAlt(el),
  'set-waypoint-speed':     (el) => setWaypointSpeed(el),
  'set-waypoint-tos':       (el) => setWaypointTos(el),
  'set-comm-channel-field': (el) => setCommChannelField(el),
  'set-f18-nav-setting':    (el) => setF18NavSetting(el),
  'set-target-data':        (el) => setTargetData(el),
  'set-kneeboard-field':    (el) => setKneeboardField(el),
  'set-kneeboard-loadout-field': (el) => setKneeboardLoadoutField(el),
  'set-kneeboard-unit-callsign': (el) => setKneeboardUnitCallsign(el),
  'set-kneeboard-unit-tail-number': (el) => setKneeboardUnitTailNumber(el),
  'set-kneeboard-unit-code': (el) => setKneeboardUnitCode(el),
  'set-kneeboard-route-field': (el) => setKneeboardRouteField(el),
};

// ── Event delegation listeners ────────────────────────────────────────────────

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  CLICK_ACTIONS[el.dataset.action]?.(el, e);
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  CHANGE_ACTIONS[el.dataset.action]?.(el, e);
});

document.addEventListener('input', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  INPUT_ACTIONS[el.dataset.action]?.(el, e);
});

// ── queueSelectInputContents delegation ──────────────────────────────────────

document.addEventListener('focus', e => {
  if (e.target.matches('.cmds-inp, .comm-freq-inp, .tgt-inp')) {
    if ('savePrev' in e.target.dataset) e.target.dataset.prev = e.target.value;
    queueSelectInputContents(e.target);
  }
}, true);

document.addEventListener('dblclick', e => {
  if (e.target.matches('.cmds-inp, .comm-freq-inp, .tgt-inp')) queueSelectInputContents(e.target);
});

// ── Flight tab click handler ──────────────────────────────────────────────────

function onFlightTabClick(e) {
  const tabEl = e.target.closest('.flight-tab');
  if (!tabEl) return;
  const { cardPrefix, groupId, panel } = tabEl.dataset;
  const card = document.getElementById(`fc-${cardPrefix}-${groupId}`);
  if (!card) return;
  const preview = card.querySelector('.inline-preview-panel');
  card.querySelectorAll('.tab').forEach(t => { if (!preview?.contains(t)) t.classList.remove('active'); });
  card.querySelectorAll('.tab-panel').forEach(p => { if (!preview?.contains(p)) p.classList.remove('active'); });
  tabEl.classList.add('active');
  const targetPanel = document.getElementById(`tp-${cardPrefix}-${groupId}-${panel}`);
  if (targetPanel) targetPanel.classList.add('active');
}

// ── File handlers ─────────────────────────────────────────────────────────────

async function handleMizFile(file) {
  if (!file) return;

  document.getElementById('miz-fname').textContent = file.name;
  document.getElementById('miz-card').classList.add('active');
  document.getElementById('miz-clear-btn').style.display = 'inline-flex';
  document.getElementById('results').style.display = 'block';
  document.getElementById('empty-state').style.display = 'none';
  showStatus('<span class="warn">⟳ Parsing mission…</span>');

  try {
    const zip = await JSZip.loadAsync(file);
    const mf  = zip.file('mission');
    if (!mf) throw new Error('No "mission" file found inside the .miz archive.');

    const tf = zip.file('theatre');
    if (tf) state.theater = (await tf.async('string')).trim();

    state.missionName = file.name.replace(/\.miz$/i, '');

    state.missionDtcMap = {};
    const dtcFiles = Object.keys(zip.files).filter(f => f.startsWith('DTC/') && f.toLowerCase().endsWith('.dtc'));
    for (const dtcPath of dtcFiles) {
      const dtcFile = zip.file(dtcPath);
      if (dtcFile) {
        try {
          const dtcText    = await dtcFile.async('string');
          const dtcParsed  = JSON.parse(dtcText);
          const normalized = normalizeDtc(dtcParsed);
          if (normalized) {
            const filename = dtcPath.replace(/^DTC\//, '').replace(/\.dtc$/i, '');
            state.missionDtcMap[filename] = normalized;
          }
        } catch (err) {
          console.warn(`Failed to parse mission DTC ${dtcPath}:`, err);
        }
      }
    }

    const lua     = await mf.async('string');
    const parsed  = new LuaParser(lua).parse();
    const mission = parsed.mission;
    if (!mission) throw new Error('Could not parse mission table from Lua file.');

    const hadStandalone = allFlights().some(f => f._standalone);
    state.f16Flights = extractFlightsByType(mission, state.theater, isF16Type, 'F-16C_50');
    state.f18Flights = extractFlightsByType(mission, state.theater, isF18Type, 'FA-18C_hornet');
    state.assets = extractAssets(mission, state.theater);
    state.airdromes = extractAirdromes(mission, state.theater);

    // Attach mission airdrome data to each flight
    const allExtractedFlights = [...state.f16Flights, ...state.f18Flights];
    for (const flight of allExtractedFlights) {
      flight.missionAirdromes = state.airdromes;
    }
    if (hadStandalone) {
      document.getElementById('merge-pill').style.display = 'none';
    }
    state.tacanCandidates = extractTacanCandidates(mission);
    document.getElementById('map-all-btn').style.display =
      (state.f16Flights.length + state.f18Flights.length) > 0 ? 'inline-flex' : 'none';

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

    const missionDtcNames = Object.keys(state.missionDtcMap);
    const dtcMsg = missionDtcNames.length > 0
      ? ` · <span class="ok">✓ ${missionDtcNames.length}</span> mission DTC(s) loaded`
      : '';

    showStatus(
      `<span class="ok">✓</span> ${state.theater} · ${state.missionName} · ` +
      `<span class="ok">${state.f16Flights.length}</span> F-16C flight(s) · ` +
      `<span class="ok">${state.f18Flights.length}</span> F/A-18C flight(s) · ` +
      `<span class="ok">${state.tacanCandidates.length}</span> TACAN station(s)${dtcMsg}`
    );

  } catch (err) {
    showStatus(`<span class="err">✗ ${err.message}</span>`);
    console.error(err);
  }
}

async function handleDtcFile(file) {
  if (!file) return;

  document.getElementById('dtc-fname').textContent = file.name;
  document.getElementById('dtc-card').classList.add('active');

  const text = await file.text();
  let parsed = null;

  try {
    parsed = JSON.parse(text);
  } catch {
    alert('Could not parse .dtc file — expected JSON format (from Saved Games\\DCS\\dtc\\).');
    document.getElementById('dtc-fname').textContent = '';
    document.getElementById('dtc-card').classList.remove('active');
    return;
  }

  const normalized = normalizeDtc(parsed);
  if (!normalized) {
    alert('Unrecognized .dtc format.\nExpected real DCS native format with at least { "data": { "COMM" }, "name", "type" }.\nLoad a .dtc from your Saved Games\\DCS\\dtc\\ folder.');
    document.getElementById('dtc-fname').textContent = '';
    document.getElementById('dtc-card').classList.remove('active');
    return;
  }
  state.pendingPersonalDtc = { fileName: file.name, normalized };
  openFlightSelectDialogForDtc();
}

function clearPersonalDtc(e) {
  e.preventDefault();
  state.personalDtc = null;
  state.pendingPersonalDtc = null;
  for (const f of allFlights()) {
    delete f.personalDtc;
    delete f.personalDtcFileName;
    delete f.navSettingsF18;
    delete f.guardComm1;
    delete f.guardComm2;
  }
  state.f16Flights = state.f16Flights.filter(f => !f._standalone);
  state.f18Flights = state.f18Flights.filter(f => !f._standalone);
  if (!state.missionName) {
    document.getElementById('results').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
  }
  document.getElementById('dtc-input').value = '';
  document.getElementById('dtc-fname').textContent = '';
  document.getElementById('dtc-card').classList.remove('active');
  document.getElementById('dtc-open-btn').style.display = 'none';
  document.getElementById('dtc-clear-btn').style.display = 'none';
  document.getElementById('merge-pill').style.display = 'none';
  rerenderFlightCards();

  document.querySelectorAll('.inline-preview-panel.open').forEach(panel => {
    previewDtc(panel.dataset.family, panel.dataset.gid);
  });
}

function clearMiz(e) {
  e.preventDefault();
  state.missionName = null;
  state.theater = null;
  state.missionDtcMap = {};
  state.tacanCandidates = [];
  state.f16Flights = state.f16Flights.filter(f => f._standalone);
  state.f18Flights = state.f18Flights.filter(f => f._standalone);
  if (state.f16Flights.length === 0 && state.f18Flights.length === 0) {
    document.getElementById('results').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
  } else {
    rerenderFlightCards();
  }
  document.getElementById('miz-input').value = '';
  document.getElementById('miz-fname').textContent = '';
  document.getElementById('miz-card').classList.remove('active');
  document.getElementById('miz-clear-btn').style.display = 'none';
  document.getElementById('map-all-btn').style.display = 'none';
  showStatus('');
  document.querySelectorAll('.inline-preview-panel.open').forEach(panel => {
    const flights = panel.dataset.family === 'f18' ? state.f18Flights : state.f16Flights;
    if (flights.some(f => String(f.groupId) === String(panel.dataset.gid))) {
      previewDtc(panel.dataset.family, panel.dataset.gid);
    }
  });
}

function openPersonalDtcSelector(e) {
  if (e) e.preventDefault();
  const fileName = document.getElementById('dtc-fname')?.textContent?.trim();
  if (!state.personalDtc || !fileName) {
    alert('Load a personal .dtc first.');
    return;
  }
  state.pendingPersonalDtc = {
    fileName,
    normalized: deepClone(state.personalDtc),
  };
  openFlightSelectDialogForDtc();
}

// ── DOM initialization ────────────────────────────────────────────────────────

document.getElementById('miz-input').addEventListener('change', async e => {
  await handleMizFile(e.target.files[0]);
});

document.getElementById('dtc-input').addEventListener('change', async e => {
  await handleDtcFile(e.target.files[0]);
});

document.addEventListener('DOMContentLoaded', async () => {
  // Load airfield and runway data from JSON files
  await loadAirfieldData();

  const importInput = document.getElementById('flight-import-dtc-input');
  if (!importInput) return;
  importInput.addEventListener('change', async e => {
    await handleFlightImportDtcFile(e.target.files[0]);
  });
});

// ── Drag & Drop ───────────────────────────────────────────────────────────────

const mizCard = document.getElementById('miz-card');
const dtcCard = document.getElementById('dtc-card');

document.addEventListener('dragover', e => {
  e.preventDefault();
  const overMiz = mizCard?.contains(e.target);
  const overDtc = dtcCard?.contains(e.target);
  if (mizCard) mizCard.style.borderColor = overMiz ? 'var(--accent)' : '';
  if (dtcCard) dtcCard.style.borderColor = overDtc ? 'var(--accent)' : '';
});

document.addEventListener('dragleave', e => {
  // Only clear highlight when leaving the document entirely
  if (!e.relatedTarget) {
    if (mizCard) mizCard.style.borderColor = '';
    if (dtcCard) dtcCard.style.borderColor = '';
  }
});

document.addEventListener('drop', e => {
  e.preventDefault();
  if (mizCard) mizCard.style.borderColor = '';
  if (dtcCard) dtcCard.style.borderColor = '';
  const f = e.dataTransfer?.files?.[0];
  if (!f) return;
  if (mizCard?.contains(e.target)) handleMizFile(f);
  else if (dtcCard?.contains(e.target)) handleDtcFile(f);
});
