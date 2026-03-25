import { state } from '../state.js';
import { buildDtcNative } from './builder-f16.js';
import { buildF18DtcNative } from './builder-f18.js';
import { downloadBlob, sanitizeFilename } from '../utils.js';

export function getDtcMergeParts(normalized) {
  const parts = [];
  if (normalized?._native) {
    if (normalized._aircraft === 'F18') {
      if (normalized._rawAlr67?.CMDS) parts.push('ALR67 CMDS');
      if (normalized._rawAlr67?.RWR) parts.push('ALR67 RWR');
      if (normalized._rawTcn?.length) parts.push('TACAN presets');
      if (normalized._rawWypt?.NAV_SETTINGS) parts.push('NAV settings');
      if (normalized.Radio) parts.push('radio presets');
    } else {
      if (normalized._rawMpd?.CMDS) parts.push('CMDS (MAN1-6/AUTO1-3/BYP)');
      if (normalized._rawElint?.RWR) parts.push('RWR priorities');
      if (normalized.Radio) parts.push('radio presets');
    }
  } else {
    if (normalized?.Countermeasures) parts.push('CMDS');
    if (normalized?.EWS) parts.push('EWS');
    if (normalized?.Radio) parts.push('channel names');
    if (normalized?.LaserCodes) parts.push('laser codes');
  }
  return parts.length ? parts.join(' + ') : 'data';
}

export function exportFlightDtc(family, groupId, overrideName) {
  const flights = family === 'f18' ? state.f18Flights : state.f16Flights;
  const flight = flights.find(f => String(f.groupId) === String(groupId));
  if (!flight) return;

  const dtc = family === 'f18' ? buildF18DtcNative(flight) : buildDtcNative(flight);
  const cardPrefix = family === 'f18' ? 'f18' : 'f16';
  const panel = document.getElementById(`inline-preview-${cardPrefix}-${groupId}`);
  const previewNameInput = panel?.querySelector('.export-name-inp');
  const rawName = overrideName ?? previewNameInput?.value ?? flight.name ?? 'flight';
  const name = sanitizeFilename(rawName, 'flight');

  const json = JSON.stringify(dtc, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, `${name}.dtc`);
}

export function exportFlightButton(btn) {
  const cardPrefix = btn.dataset.family === 'f18' ? 'f18' : 'f16';
  const exportDiv = document.getElementById(`card-export-${cardPrefix}-${btn.dataset.gid}`);
  const nameInput = exportDiv?.querySelector('.card-export-name-inp');
  exportFlightDtc(btn.dataset.family, btn.dataset.gid, nameInput?.value);
}
