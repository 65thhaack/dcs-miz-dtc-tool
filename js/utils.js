import { state } from './state.js';

export function deepClone(obj) {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
}

export function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function wpTag(wp) {
  if (wp.isTakeoff) return `<span class="wptag wptag-tkof">TKOF</span>`;
  if (wp.isLand)    return `<span class="wptag wptag-rtb">RTB</span>`;
  return `<span class="wptag wptag-tp">TP</span>`;
}

export function allFlights() {
  return [...state.f16Flights, ...state.f18Flights];
}

export function findFlightById(groupId) {
  return allFlights().find(f => String(f.groupId) === String(groupId));
}

export function getFlightPersonalDtc(flight) {
  return flight?.personalDtc || null;
}

export function toDtcLat(lat) {
  const abs = Math.abs(lat);
  const d   = Math.floor(abs);
  const mf  = (abs - d) * 60;
  const m   = Math.floor(mf);
  const s   = Math.round((mf - m) * 60);
  const dir = lat >= 0 ? 'N' : 'S';
  return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${String(s).padStart(2,'0')}${dir}`;
}

export function toDtcLon(lon) {
  const abs = Math.abs(lon);
  const d   = Math.floor(abs);
  const mf  = (abs - d) * 60;
  const m   = Math.floor(mf);
  const s   = Math.round((mf - m) * 60);
  const dir = lon >= 0 ? 'E' : 'W';
  return `${String(d).padStart(3,'0')}.${String(m).padStart(2,'0')}.${String(s).padStart(2,'0')}${dir}`;
}

export function showStatus(html) {
  const sb = document.getElementById('status-bar');
  sb.style.display = 'block';
  sb.innerHTML = html;
}

export function queueSelectInputContents(inp) {
  if (!(inp instanceof HTMLInputElement)) return;
  requestAnimationFrame(() => {
    if (document.activeElement === inp) inp.select();
  });
}

export function sanitizeFilename(value, fallback = 'export') {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_');
  return cleaned || fallback;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
