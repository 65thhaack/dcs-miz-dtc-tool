// js/ui/editors.js
import { findFlightById, deepClone, getFlightPersonalDtc } from '../utils.js';
import { setFlightCommName } from '../dtc/shared.js';
import { ensureF16CmdsPrograms } from '../dtc/builder-f16.js';
import { previewDtc } from './preview.js';
import { defaultF18NavSettings, F18_NAV_RULES } from '../dtc/defaults.js';
import { ensureF18TacanSelection } from '../dtc/builder-f18.js';
import { ensureKneeboardDraft } from '../kneeboard/model.js';

// Private path helper (used by setF18NavSetting)
function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}


// Called when pilot changes a waypoint's role via the dropdown
export function setWpType(sel) {
  const gid = sel.dataset.gid;
  const idx = parseInt(sel.dataset.idx, 10);
  const val = sel.value;

  // Update state
  const flight = findFlightById(gid);
  if (flight) flight.waypoints[idx].pointType = val;

  // Recolor the select to match the role (pt- prefix)
  sel.className = 'pttype pt-' + val.toLowerCase();

  // Toggle TargetData sub-row in the preview panel (pvtdr- prefix)
  const pvtdr = document.getElementById(`pvtdr-${gid}-${idx}`);
  if (pvtdr) pvtdr.style.display = val === 'TGT' ? 'table-row' : 'none';
}

// Called when a TargetData input changes (VRP bearing/range, PUP distance)
export function setTargetData(inp) {
  const gid   = inp.dataset.gid;
  const idx   = parseInt(inp.dataset.idx, 10);
  const field = inp.dataset.field;
  const flight = findFlightById(gid);
  if (flight?.waypoints[idx]?.targetData) {
    flight.waypoints[idx].targetData[field] = parseFloat(inp.value) || 0;
  }
}

export function setWaypointName(inp) {
  const gid = inp.dataset.gid;
  const idx = parseInt(inp.dataset.idx, 10);
  const flight = findFlightById(gid);
  if (!flight || !Number.isInteger(idx) || idx < 0 || idx >= flight.waypoints.length) return;
  flight.waypoints[idx].name = inp.value;
}

export function removeWaypoint(btn) {
  const gid = btn.dataset.gid;
  const idx = parseInt(btn.dataset.idx, 10);
  const flight = findFlightById(gid);
  if (!flight || !Number.isInteger(idx) || idx < 0 || idx >= flight.waypoints.length) return;
  flight.waypoints.splice(idx, 1);
  // Re-number seq on remaining nav waypoints
  let seq = 0;
  for (const wp of flight.waypoints) {
    if (!wp.isTakeoff && !wp.isLand) wp.seq = ++seq;
  }
  const family = flight.aircraftType === 'FA-18C_hornet' ? 'f18' : 'f16';
  flight.inlinePreviewTab = 'wpt';
  previewDtc(family, flight.groupId);
}

export function setCommChannelField(inp) {
  const gid = inp.dataset.gid;
  const radio = Number(inp.dataset.radio);
  const channel = Number(inp.dataset.channel);
  const field = inp.dataset.field;
  const flight = findFlightById(gid);
  if (!flight || ![1, 2].includes(radio) || !Number.isInteger(channel) || channel < 1 || channel > 20) return;

  if (field === 'freq') {
    const raw = parseFloat(inp.value);
    if (!Number.isFinite(raw)) return;
    const normalized = Math.max(0, parseFloat(raw.toFixed(3)));
    if (radio === 1) flight.radio1[channel] = normalized;
    else flight.radio2[channel] = normalized;
    inp.value = normalized.toFixed(3);
    return;
  }

  if (field === 'name') {
    setFlightCommName(flight, radio, channel, inp.value.trim());
  }
}

export function setF18CommGuard(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  if (inp.dataset.radio === '1') flight.guardComm1 = inp.checked;
  else flight.guardComm2 = inp.checked;
}

export function setF18NavSetting(inp) {
  const gid = inp.dataset.gid;
  const path = inp.dataset.path;
  const kind = inp.dataset.kind;
  const flight = findFlightById(gid);
  if (!flight) return;

  if (!flight.navSettingsF18) {
    const flightDtc = getFlightPersonalDtc(flight);
    const base = flightDtc?._rawWypt?.NAV_SETTINGS || defaultF18NavSettings();
    flight.navSettingsF18 = deepClone(base);
  }

  let value = inp.value;
  if (kind === 'boolean') value = !!inp.checked;
  if (kind === 'number' || kind === 'int' || kind === 'enum') {
    const n = Number(inp.value);
    value = Number.isFinite(n) ? n : 0;
  }

  const rule = F18_NAV_RULES[path];
  if (rule && (kind === 'number' || kind === 'int')) {
    if (typeof rule.min === 'number') value = Math.max(rule.min, value);
    if (typeof rule.max === 'number') value = Math.min(rule.max, value);
    if (kind === 'int') value = Math.round(value);
    inp.value = String(value);
  }

  setByPath(flight.navSettingsF18, path, value);
}

export function setF18TacanSelected(inp) {
  const gid = inp.dataset.gid;
  const key = inp.dataset.key;
  const flight = findFlightById(gid);
  if (!flight) return;
  ensureF18TacanSelection(flight);

  const set = new Set(flight.selectedTacanKeys || []);
  if (inp.checked) set.add(key);
  else set.delete(key);
  flight.selectedTacanKeys = [...set];
}

// F-16 fields: "chaff_bq" | "chaff_sq" | "flare_bq" | "flare_sq" | "burst_intv" | "salvo_intv"
// F-18 fields: "chaff_qty" | "chaff_rep" | "chaff_intv" | "flare_qty"
export function setCmdsField(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  const prog = inp.dataset.prog;
  const field = inp.dataset.field;
  const raw = parseFloat(inp.value);
  if (!Number.isFinite(raw) || raw < 0) { inp.value = inp.dataset.prev ?? 0; return; }

  if (inp.dataset.aircraft === 'f18') {
    // F-18: store edits per-flight; applied in buildF18Dtc
    if (!flight.f18CmdsEdits) flight.f18CmdsEdits = {};
    if (!flight.f18CmdsEdits[prog]) flight.f18CmdsEdits[prog] = {};
    const e = flight.f18CmdsEdits[prog];
    if (field === 'chaff_qty')  { e.Chaff = e.Chaff || {}; e.Chaff.Quantity  = Math.round(raw); inp.value = Math.round(raw); }
    else if (field === 'chaff_rep')  { e.Chaff = e.Chaff || {}; e.Chaff.Repeat   = Math.round(raw); inp.value = Math.round(raw); }
    else if (field === 'chaff_intv') { e.Chaff = e.Chaff || {}; e.Chaff.Interval = parseFloat(raw.toFixed(3)); inp.value = raw.toFixed(2); }
    else if (field === 'flare_qty')  { e.Flare = e.Flare || {}; e.Flare.Quantity  = Math.round(raw); inp.value = Math.round(raw); }
    return;
  }

  // F-16: always route through flight.f16CmdsPrograms (independent of _rawMpd deep-clone)
  const programs = ensureF16CmdsPrograms(flight);
  if (!programs || !programs[prog]) return;

  const p = programs[prog];
  if (field === 'chaff_bq')    { p.Chaff = p.Chaff || {}; p.Chaff.BurstQuantity = Math.round(raw); inp.value = Math.round(raw); }
  else if (field === 'chaff_sq')    { p.Chaff = p.Chaff || {}; p.Chaff.SalvoQuantity = Math.round(raw); inp.value = Math.round(raw); }
  else if (field === 'flare_bq')    { p.Flare = p.Flare || {}; p.Flare.BurstQuantity = Math.round(raw); inp.value = Math.round(raw); }
  else if (field === 'flare_sq')    { p.Flare = p.Flare || {}; p.Flare.SalvoQuantity = Math.round(raw); inp.value = Math.round(raw); }
  else if (field === 'burst_intv')  { p.Chaff = p.Chaff || {}; p.Chaff.BurstInterval = parseFloat(raw.toFixed(3)); inp.value = raw.toFixed(2); }
  else if (field === 'salvo_intv')  { p.Chaff = p.Chaff || {}; p.Chaff.SalvoInterval = parseFloat(raw.toFixed(3)); inp.value = raw.toFixed(2); }
}

export function setKneeboardField(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  const kb = ensureKneeboardDraft(flight);
  const field = inp.dataset.field;
  if (!field) return;
  kb[field] = inp.value;
}

export function setKneeboardLoadoutField(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  const kb = ensureKneeboardDraft(flight);
  const idx = Number(inp.dataset.idx);
  const field = inp.dataset.field;
  if (!Number.isInteger(idx) || idx < 0 || idx >= kb.loadout.length) return;
  if (!['station', 'type'].includes(field)) return;
  kb.loadout[idx][field] = inp.value;
}

export function setKneeboardUnitCallsign(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  const kb = ensureKneeboardDraft(flight);
  const idx = Number(inp.dataset.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (flight.units?.length || 0)) return;
  kb.unitCallsigns[idx] = inp.value;
}

export function setKneeboardUnitTailNumber(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  const kb = ensureKneeboardDraft(flight);
  const idx = Number(inp.dataset.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= (flight.units?.length || 0)) return;
  kb.unitTailNumbers[idx] = inp.value;
}

export function setKneeboardUnitCode(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  const kb = ensureKneeboardDraft(flight);
  const idx = Number(inp.dataset.idx);
  const field = inp.dataset.field;
  if (!Number.isInteger(idx) || idx < 0 || idx >= (flight.units?.length || 0)) return;
  if (field === 'datalink') kb.unitDatalinkCodes[idx] = inp.value;
  if (field === 'laser') kb.unitLaserCodes[idx] = inp.value;
}

export function setKneeboardRouteField(inp) {
  const flight = findFlightById(inp.dataset.gid);
  if (!flight) return;
  const kb = ensureKneeboardDraft(flight);
  const idx = Number(inp.dataset.idx);
  const field = inp.dataset.field;
  if (!Number.isInteger(idx) || idx < 0 || idx >= (flight.waypoints?.length || 0)) return;
  if (!['tot', 'push', 'remarks'].includes(field)) return;
  kb.routeData[idx] = kb.routeData[idx] || { tot: '', push: '', remarks: '' };
  kb.routeData[idx][field] = inp.value;
}
