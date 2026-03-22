// js/ui/modals.js
import { state } from '../state.js';
import { deepClone, findFlightById, allFlights, escapeAttr } from '../utils.js';
import { isF16Type, isF18Type } from '../miz/extractor.js';
import { normalizeDtc } from '../dtc/normalize.js';
import { dcsToLatLon } from '../coords.js';
import { rerenderFlightCards, assignPersonalDtcToFlight } from './flight-cards.js';

export function getDtcTargetFlights(normalized) {
  if (normalized?._aircraft === 'F18') return state.f18Flights;
  if (normalized?._aircraft === 'F16') return state.f16Flights;
  return allFlights();
}

export function createStandaloneFlight(normalized, fileName) {
  const isF18 = normalized._aircraft === 'F18';
  const family = isF18 ? 'f18' : 'f16';
  const groupId = `standalone-${Date.now()}`;
  const baseName = fileName.replace(/\.dtc$/i, '');

  // Pull NAV_PTS and terrain from the raw DTC block
  const rawNav = isF18 ? normalized._rawWypt : normalized._rawMpd;
  const navPts = rawNav?.NAV_PTS || [];
  const terrain = rawNav?.terrain;
  if (terrain) state.theater = terrain;

  // Convert DTC steerpoints to the same waypoint format used by mission flights
  const waypoints = navPts.map((pt, i) => {
    const { lat, lon } = dcsToLatLon(pt.x || 0, pt.y || 0, state.theater);
    const altM = pt.alt || 0;
    const seq = isF18 ? (pt.wypt_num || i + 1) : (pt.number || i + 1);
    return {
      seq,
      isTakeoff: false,
      isLand: false,
      x: pt.x || 0,
      y: pt.y || 0,
      lat, lon,
      alt_m: altM,
      alt_ft: Math.round(altM * 3.28084),
      speed_ms: 0,
      speed_kts: 0,
      name: pt.note || pt.text_note || '',
      alt_type: 'BARO',
      type: 'Turning Point',
      pointType: pt.type || 'STPT',
      targetData: { vrpBearing: 0, vrpRange: 0, pupDistance: 0 },
    };
  });

  const radio1 = {}, radio2 = {};
  const uhfCh = normalized.Radio?.UHF?.Channels || {};
  const vhfCh = normalized.Radio?.VHF?.Channels || {};
  for (const [k, v] of Object.entries(uhfCh)) radio1[Number(k)] = v.Frequency;
  for (const [k, v] of Object.entries(vhfCh)) radio2[Number(k)] = v.Frequency;

  return {
    flight: {
      groupId,
      name: baseName,
      aircraftType: isF18 ? 'FA-18C_hornet' : 'F-16C_50',
      side: 'blue',
      country: '',
      units: [],
      waypoints,
      miz: null,           // standalone: no mission source
      radio1,
      radio2,
      _standalone: true,   // keep for conditional rendering
    },
    family,
  };
}

export function openFlightSelectDialogForDtc() {
  const pending = state.pendingPersonalDtc;
  if (!pending?.normalized) return;

  const flights = getDtcTargetFlights(pending.normalized);
  const missionFlights = flights.filter(f => !f._standalone);
  if (!missionFlights.length) {
    // No real mission flights — create a standalone DTC-only flight.
    // Remove any existing standalone flights of this type first (re-import case).
    if (pending.normalized._aircraft === 'F18') {
      state.f18Flights = state.f18Flights.filter(f => !f._standalone);
    } else {
      state.f16Flights = state.f16Flights.filter(f => !f._standalone);
    }
    const { flight, family } = createStandaloneFlight(pending.normalized, pending.fileName);
    const flightsArr = family === 'f18' ? state.f18Flights : state.f16Flights;
    flightsArr.push(flight);
    state.pendingPersonalDtc = null;
    document.getElementById('results').style.display = 'block';
    document.getElementById('empty-state').style.display = 'none';
    rerenderFlightCards();
    assignPersonalDtcToFlight(family, flight, pending.normalized, pending.fileName);
    return;
  }

  const body = document.getElementById('flight-select-body');
  const title = document.getElementById('flight-select-title');
  const subtitle = document.getElementById('flight-select-subtitle');
  if (!body || !title || !subtitle) return;

  const family = pending.normalized?._aircraft === 'F18' ? 'F/A-18C' : 'F-16C';
  title.textContent = `Assign Personal DTC to Flight (${family})`;
  subtitle.textContent = `Choose which flight should receive ${pending.fileName}.`;

  body.innerHTML = missionFlights.map(f => {
    const fam = f.aircraftType === 'FA-18C_hornet' ? 'f18' : 'f16';
    const gid = escapeAttr(f.groupId);
    const meta = `${f.side.toUpperCase()} · ${f.country || 'Unknown'} · ${f.units.length} aircraft`;
    const opts = f.dtcMergeOptions || {};
    const wptChk  = opts.waypoints === true ? 'checked' : '';
    const commsChk = opts.comms   === true ? 'checked' : '';
    const cmdsChk  = opts.cmds    !== false ? 'checked' : '';
    return `<div class="flight-select-item" data-family="${fam}" data-gid="${gid}">
      <div class="flight-select-left" onclick="selectFlightForPendingDtc('${fam}','${gid}')">
        <div class="line1">${f.name}</div>
        <div class="line2">${meta}</div>
      </div>
      <div class="flight-select-merge" onclick="event.stopPropagation()">
        <div class="merge-header">Override Mission</div>
        <div class="merge-cb-row">
          <label class="merge-cb"><input type="checkbox" data-section="wpt" ${wptChk}> Waypoints</label>
          <label class="merge-cb"><input type="checkbox" data-section="comms" ${commsChk}> Comms</label>
          <label class="merge-cb"><input type="checkbox" data-section="cmds" ${cmdsChk}> CMDS</label>
        </div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('flight-select-modal').style.display = 'flex';
}

export function closeFlightSelectDialog() {
  document.getElementById('flight-select-modal').style.display = 'none';
}

export function selectFlightForPendingDtc(family, groupId) {
  const pending = state.pendingPersonalDtc;
  if (!pending?.normalized) return;

  const flights = family === 'f18' ? state.f18Flights : state.f16Flights;
  const flight = flights.find(f => String(f.groupId) === String(groupId));
  if (!flight) return;

  // Read merge option checkboxes from the modal item
  const item = document.querySelector(`.flight-select-item[data-family="${family}"][data-gid="${groupId}"]`);
  flight.dtcMergeOptions = {
    waypoints: item?.querySelector('[data-section="wpt"]')?.checked ?? true,
    comms:     item?.querySelector('[data-section="comms"]')?.checked ?? true,
    cmds:      item?.querySelector('[data-section="cmds"]')?.checked ?? true,
  };

  closeFlightSelectDialog();
  state.pendingPersonalDtc = null;
  assignPersonalDtcToFlight(family, flight, pending.normalized, pending.fileName);
}
