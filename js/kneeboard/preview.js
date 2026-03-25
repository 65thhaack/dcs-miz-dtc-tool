import { escapeAttr } from '../utils.js';
import { state } from '../state.js';
import { ensureKneeboardDraft } from './model.js';

function routeRows(flight) {
  const kb = ensureKneeboardDraft(flight);
  const navWps = (flight.waypoints || [])
    .map((wp, idx) => ({ wp, idx }))
    .filter(({ wp }) => !wp.isTakeoff && !wp.isLand);
  return navWps.map(({ wp, idx }, routeIdx) => {
    const routeData = kb.routeData[idx] || { tot: '', push: '', remarks: '' };
    return `
    <tr>
      <td>${routeIdx + 1}</td>
      <td>
        <input class="kb-inp" type="text" value="${escapeAttr(wp.name || `WP${wp.seq}`)}"
          data-gid="${flight.groupId}" data-idx="${idx}"
          data-action="set-waypoint-name">
      </td>
      <td>${wp.alt_ft.toLocaleString()}</td>
      <td>${wp.speed_kts || '—'}</td>
      <td><input class="kb-inp kb-cell-inp" type="text" value="${escapeAttr(routeData.tot)}" data-gid="${flight.groupId}" data-idx="${idx}" data-field="tot" data-action="set-kneeboard-route-field"></td>
      <td><input class="kb-inp kb-cell-inp" type="text" value="${escapeAttr(routeData.push)}" data-gid="${flight.groupId}" data-idx="${idx}" data-field="push" data-action="set-kneeboard-route-field"></td>
      <td>
        <textarea class="kb-inp kb-cell-inp kb-remarks-ta"
          data-gid="${flight.groupId}" data-idx="${idx}" data-field="remarks"
          data-action="set-kneeboard-route-field" placeholder="Remarks">${escapeAttr(routeData.remarks)}</textarea>
      </td>
    </tr>
  `;
  }).join('') || '<tr><td colspan="7" style="color:var(--muted);text-align:center">No waypoints</td></tr>';
}

function unitRows(flight) {
  const kb = ensureKneeboardDraft(flight);
  return (flight.units || []).map((u, idx) => `
    <tr>
      <td>
        <input class="kb-inp kb-cell-inp kb-tail-inp" type="text" value="${escapeAttr(kb.unitTailNumbers[idx] || '')}"
          data-gid="${flight.groupId}" data-idx="${idx}"
          data-action="set-kneeboard-unit-tail-number">
      </td>
      <td>${escapeAttr(u.name || '')}</td>
      <td>
        <input class="kb-inp kb-cell-inp" type="text" value="${escapeAttr(kb.unitCallsigns[idx] || '')}"
          data-gid="${flight.groupId}" data-idx="${idx}"
          data-action="set-kneeboard-unit-callsign">
      </td>
      <td>
        <input class="kb-inp kb-cell-inp kb-code-inp" type="text" value="${escapeAttr(kb.unitDatalinkCodes?.[idx] || '')}"
          data-gid="${flight.groupId}" data-idx="${idx}" data-field="datalink"
          data-action="set-kneeboard-unit-code">
      </td>
      <td>
        <input class="kb-inp kb-cell-inp kb-code-inp" type="text" value="${escapeAttr(kb.unitLaserCodes?.[idx] || '')}"
          data-gid="${flight.groupId}" data-idx="${idx}" data-field="laser"
          data-action="set-kneeboard-unit-code">
      </td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="color:var(--muted);text-align:center">No unit data</td></tr>';
}

function miniMapId(flight) {
  return `kb-mini-map-${flight.groupId}`;
}

function waypointMapHtml(flight) {
  return `<div id="${miniMapId(flight)}" class="kb-mini-map"></div>`;
}

function assetCommDisplay(asset) {
  if (Number.isFinite(asset?.frequency) && asset.frequency > 0) {
    return String(asset.frequency);
  }
  const comm = asset?.primaryComm;
  if (!comm || !Number.isFinite(comm.freq)) return '—';
  return comm.freq.toFixed(3);
}

function assetsRows() {
  const assets = (state.assets || []).filter(a => a);
  if (!assets.length) return '<tr><td colspan="5" style="color:var(--muted);text-align:center">No assets</td></tr>';
  return assets.map(a => `
    <tr>
      <td>${escapeAttr(a.type)}</td>
      <td>${escapeAttr(a.callsign || a.name || '')}</td>
      <td>${a.tacan ? `${a.tacan.channel}${a.tacan.modeChannel}` : '—'}</td>
      <td>${assetCommDisplay(a)}</td>
      <td>${a.alt_ft > 0 ? a.alt_ft.toLocaleString() : '—'}</td>
    </tr>
  `).join('');
}

export function renderKneeboardMiniMap(flight) {
  const el = document.getElementById(miniMapId(flight));
  if (!el) return;
  const navWps = (flight.waypoints || []).filter(wp => !wp.isTakeoff && !wp.isLand && Number.isFinite(wp.lat) && Number.isFinite(wp.lon));
  if (!window.L) {
    el.innerHTML = '<div class="kb-mini-map-fallback">Leaflet unavailable</div>';
    return;
  }
  if (el._kbMap) {
    el._kbMap.remove();
    el._kbMap = null;
  }
  const map = L.map(el, {
    zoomControl: false,
    attributionControl: false,
    worldCopyJump: true,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  });
  el._kbMap = map;
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  if (!navWps.length) {
    map.setView([0, 0], 1);
    return;
  }
  const latlngs = navWps.map(wp => [wp.lat, wp.lon]);
  L.polyline(latlngs, {
    color: '#5a7a9c',
    weight: 3,
    opacity: 0.85,
  }).addTo(map);
  navWps.forEach((wp, idx) => {
    const color = idx === 0 ? '#3cb043' : idx === navWps.length - 1 ? '#d91a3a' : '#5a7a9c';
    L.marker([wp.lat, wp.lon], {
      icon: L.divIcon({
        className: 'kb-mini-map-marker-wrap',
        html: `<div class="kb-mini-map-marker" style="border-color:${color};color:${color}">${idx + 1}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    }).addTo(map).bindTooltip(escapeAttr(wp.name || `WP${wp.seq}`), { direction: 'top' });
  });
  if (latlngs.length > 1) {
    map.fitBounds(latlngs, { padding: [20, 20], maxZoom: 10 });
  } else {
    map.setView(latlngs[0], 10);
  }
  setTimeout(() => map.invalidateSize(), 40);
}

export function buildKneeboardTabHtml(flight, family) {
  const kb = ensureKneeboardDraft(flight);
  
  return `
    <div class="kb-wrap">
      <div class="kb-edit-grid">
        <label>Date (YMDHMS): <input class="kb-inp" type="text" value="${escapeAttr(kb.missionDate)}" placeholder="yyyy-MM-dd" data-gid="${flight.groupId}" data-field="missionDate" data-action="set-kneeboard-field"></label>
        <label>Zulu Time: <input class="kb-inp" type="text" value="${escapeAttr(kb.missionTimeZulu)}" placeholder="HH:mm" data-gid="${flight.groupId}" data-field="missionTimeZulu" data-action="set-kneeboard-field"></label>
        <label>TOT (HH:mm): <input class="kb-inp" type="text" value="${escapeAttr(kb.missionTot)}" placeholder="HH:mm" data-gid="${flight.groupId}" data-field="missionTot" data-action="set-kneeboard-field"></label>
        <label>Type: <input class="kb-inp" type="text" value="${escapeAttr(kb.missionType)}" placeholder="e.g., Strike" data-gid="${flight.groupId}" data-field="missionType" data-action="set-kneeboard-field"></label>
        <label>Weather: <input class="kb-inp" type="text" value="${escapeAttr(kb.weather)}" placeholder="Clear" data-gid="${flight.groupId}" data-field="weather" data-action="set-kneeboard-field"></label>
        <label>Package: <input class="kb-inp" type="text" value="${escapeAttr(kb.packageName)}" placeholder="e.g., Red Flag 24" data-gid="${flight.groupId}" data-field="packageName" data-action="set-kneeboard-field"></label>
      </div>
      
      <div class="kb-edit-grid" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #ccc">
        <label style="grid-column: 1 / 3">T/O Fuel: <input class="kb-inp" type="text" value="${escapeAttr(kb.fuelTakeoff)}" placeholder="lbs/kg" data-gid="${flight.groupId}" data-field="fuelTakeoff" data-action="set-kneeboard-field"></label>
        <label style="grid-column: 3 / 5">Joker: <input class="kb-inp" type="text" value="${escapeAttr(kb.fuelJoker)}" placeholder="lbs/kg" data-gid="${flight.groupId}" data-field="fuelJoker" data-action="set-kneeboard-field"></label>
        <label style="grid-column: 5 / 7">Bingo: <input class="kb-inp" type="text" value="${escapeAttr(kb.fuelBingo)}" placeholder="lbs/kg" data-gid="${flight.groupId}" data-field="fuelBingo" data-action="set-kneeboard-field"></label>
      </div>

      <div class="kb-sheet">
        <div class="kb-title">${escapeAttr(flight.name || 'FLIGHT')} · ${family === 'f18' ? 'F/A-18C' : 'F-16C'}</div>
        <div class="kb-sub">${escapeAttr(kb.packageName || 'Package')} · ${escapeAttr(kb.missionDate || '')} ${escapeAttr(kb.missionTimeZulu || '')} ${kb.missionTot ? `· TOT ${escapeAttr(kb.missionTot)}` : ''}</div>

        <section style="margin-bottom: 0.9rem">
          <div class="kb-payload-line"><strong>PAYLOAD:</strong> ${escapeAttr(flight.payloadSummary || '—')}</div>
        </section>

        <section style="margin-bottom: 1.5rem">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 11px; font-weight: bold; color: #2f2618;">LINEUP</h4>
          <table class="kb-table" style="font-size: 10px">
            <thead><tr><th>Tail #</th><th>Name</th><th>Callsign</th><th>Datalink</th><th>Laser</th></tr></thead>
            <tbody>${unitRows(flight)}</tbody>
          </table>
        </section>

        <section style="margin-bottom: 1rem">
          <h4 style="margin: 0 0 0.4rem 0; font-size: 10px; font-weight: bold; color: #2f2618;">FUEL (FLIGHT GLOBAL)</h4>
          <div class="kb-fuel-row">
            <label>T/O<input class="kb-inp" type="text" value="${escapeAttr(kb.fuelTakeoff)}" data-gid="${flight.groupId}" data-field="fuelTakeoff" data-action="set-kneeboard-field"></label>
            <label>Joker<input class="kb-inp" type="text" value="${escapeAttr(kb.fuelJoker)}" data-gid="${flight.groupId}" data-field="fuelJoker" data-action="set-kneeboard-field"></label>
            <label>Bingo<input class="kb-inp" type="text" value="${escapeAttr(kb.fuelBingo)}" data-gid="${flight.groupId}" data-field="fuelBingo" data-action="set-kneeboard-field"></label>
          </div>
        </section>

        <section style="margin-bottom: 1rem">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 11px; font-weight: bold; color: #2f2618;">ROUTE</h4>
          <table class="kb-table kb-route-table" style="font-size: 9px; margin-bottom: 0">
            <thead><tr><th>#</th><th>Name</th><th>Alt</th><th>CAS</th><th>TOT</th><th>PUSH</th><th>Remarks</th></tr></thead>
            <tbody>${routeRows(flight)}</tbody>
          </table>
        </section>

        <section style="margin-bottom: 1rem">
          <h4 style="margin: 0 0 0.4rem 0; font-size: 10px; font-weight: bold; color: #2f2618;">ASSETS (TANKERS / AWACS / CARRIERS)</h4>
          <table class="kb-table" style="font-size: 8px">
            <thead><tr><th>Type</th><th>Callsign</th><th>TACAN</th><th>FREQ</th><th>Alt(ft)</th></tr></thead>
            <tbody>${assetsRows()}</tbody>
          </table>
        </section>

        <section style="margin-top: 1rem; margin-bottom: 0.4rem">
          <h4 style="margin: 0 0 0.4rem 0; font-size: 10px; font-weight: bold; color: #2f2618;">ROUTE MAP</h4>
          ${waypointMapHtml(flight)}
        </section>

        <section style="margin-top: 0.8rem">
          <label style="display: block; font-size: 10px; font-weight: bold; color: #2f2618; margin-bottom: 0.3rem">NOTES:</label>
          <textarea class="kb-inp kb-notes-box" style="width: 100%; height: 60px; font-size: 9px"
            data-gid="${flight.groupId}" data-field="notes" data-action="set-kneeboard-field"
            placeholder="Mission briefs, callsigns, check lists...">${escapeAttr(kb.notes)}</textarea>
        </section>
      </div>

      <div class="kb-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem; justify-content: flex-end">
        <button class="btn btn-sm" data-action="restore-kneeboard" data-family="${family}" data-gid="${flight.groupId}" title="Reset to defaults">↺ Restore</button>
        <button class="btn btn-sm" data-action="export-flight-kneeboard" data-family="${family}" data-gid="${flight.groupId}" title="Export as PNG">📥 Export Kneeboard PNG</button>
      </div>
    </div>
  `;
}
