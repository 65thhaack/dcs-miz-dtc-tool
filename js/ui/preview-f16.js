import { state } from '../state.js';
import { escapeAttr } from '../utils.js';
import { latDecimalMinutes, lonDecimalMinutes, dcsToLatLon } from '../coords.js';
import { buildDtc } from '../dtc/builder-f16.js';
import { buildPreviewShell } from './preview.js';
import { buildKneeboardTabHtml } from '../kneeboard/preview.js';

export function buildF16PreviewHtml(flight, family) {
  // If viewing mission DTC, use it; otherwise build from flight data
  const isMissionDtcView = state.missionDtcViewMode && state.previewDtc;
  const dtc = isMissionDtcView ? state.previewDtc : buildDtc(flight);

  // Debug logging
  if (isMissionDtcView) {
    console.log('Mission DTC View:', {
      isMissionDtcView,
      dtcKeys: Object.keys(dtc),
      hasRadio: !!dtc.Radio,
      radioKeys: dtc.Radio ? Object.keys(dtc.Radio) : null,
      uhfChannels: dtc.Radio?.UHF?.Channels,
      vhfChannels: dtc.Radio?.VHF?.Channels,
    });
  }
  if (!isMissionDtcView) {
    state.previewDtc = dtc;
  }
  const allowedTabs = ['wpt', 'c1', 'c2', 'cmds', 'kb'];
  const activeTab = allowedTabs.includes(flight.inlinePreviewTab) ? flight.inlinePreviewTab : 'wpt';

  // Use DTC steerpoints if viewing mission DTC with nav data; otherwise use flight waypoints
  let steerRows = '';
  const hasDtcNav = isMissionDtcView && dtc.Navigation?.Steerpoints;

  // Helper to format TOS (seconds) as H:MM:SS
  const formatTos = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Calculate default TOS values for display (cumulative time based on distance/speed)
  const calcDefaultTos = (waypoints) => {
    const navWps = waypoints.filter(w => !w.isTakeoff && !w.isLand);
    const tosValues = [];
    let tos = 3600; // Start at 1 hour (same as builder)
    for (let i = 0; i < navWps.length; i++) {
      if (i === 0) {
        tosValues.push(tos);
      } else {
        const wp = navWps[i];
        const prev = navWps[i - 1];
        const dx = (wp.x || 0) - (prev.x || 0);
        const dy = (wp.y || 0) - (prev.y || 0);
        const distM = Math.hypot(dx, dy);
        const speedMs = (wp.speed_ms > 0 ? wp.speed_ms : (prev.speed_ms > 0 ? prev.speed_ms : 220));
        tos += distM / speedMs;
        tosValues.push(tos);
      }
    }
    return tosValues;
  };

  if (hasDtcNav) {
    // Read-only steerpoints from DTC
    steerRows = dtc.Navigation.Steerpoints.map((pt, idx) => {
      const { lat, lon } = dcsToLatLon(pt.x, pt.y, state.theater);
      return `
      <tr>
        <td style="color:var(--muted);width:28px">${idx + 1}</td>
        <td style="color:var(--text)">${pt.name || '—'}</td>
        <td style="color:var(--muted)">—</td>
        <td style="color:var(--text)">${latDecimalMinutes(lat)}</td>
        <td style="color:var(--text)">${lonDecimalMinutes(lon)}</td>
        <td style="color:var(--text)">${pt.alt_ft.toLocaleString()} <span style="color:var(--muted);font-size:10px">ft</span></td>
        <td style="color:var(--muted)">—</td>
      </tr>`;
    }).join('');
  } else {
    // Editable waypoints from flight
    const navWps = flight.waypoints
      .map((wp, originalIdx) => ({ wp, originalIdx }))
      .filter(({ wp }) => !wp.isTakeoff && !wp.isLand);
    // Calculate default TOS values for each steerpoint
    const defaultTosValues = calcDefaultTos(flight.waypoints);
    steerRows = navWps.map(({ wp, originalIdx }, steerIdx) => {
      const stNum = steerIdx + 1;
      const type  = (wp.pointType || 'STPT').toLowerCase();
      // Use stored TOS if available, otherwise use calculated default
      const tosValue = wp.tos !== undefined ? wp.tos : (defaultTosValues[steerIdx] || 3600);
      return `
      <tr>
        <td style="width:20px;padding:0 4px 0 0">
          <button class="wp-del-btn" type="button" title="Remove waypoint"
            data-gid="${flight.groupId}" data-idx="${originalIdx}"
            data-action="remove-waypoint">🗑</button>
        </td>
        <td style="color:var(--muted);width:28px">${stNum}</td>
        <td>
          <input
            class="wp-name-inp"
            type="text"
            value="${escapeAttr(wp.name || '')}"
            data-gid="${flight.groupId}"
            data-idx="${originalIdx}"
            data-action="set-waypoint-name">
        </td>
        <td>
          <select class="pttype pt-${type}"
            data-gid="${flight.groupId}" data-idx="${originalIdx}"
            data-action="set-wp-type">
            ${ !['STPT','IP','TGT'].includes(wp.pointType) ? `<option value="${wp.pointType}" selected disabled>${wp.pointType}</option>` : '' }
            <option value="STPT"${wp.pointType==='STPT'?' selected':''}>○  STPT</option>
            <option value="IP"  ${wp.pointType==='IP'  ?' selected':''}>□  IP</option>
            <option value="TGT" ${wp.pointType==='TGT' ?' selected':''}>△  TGT</option>
          </select>
        </td>
        <td>${latDecimalMinutes(wp.lat)}</td>
        <td>${lonDecimalMinutes(wp.lon)}</td>
        <td>
          <input
            class="wp-alt-inp"
            type="number"
            min="0"
            step="100"
            value="${Math.round(wp.alt_m || 0)}"
            data-gid="${flight.groupId}"
            data-idx="${originalIdx}"
            data-action="set-waypoint-alt">
          <span style="color:var(--muted);font-size:10px">m</span>
        </td>
        <td>
          <input
            class="wp-speed-inp"
            type="number"
            min="0"
            step="10"
            value="${wp.speed_kts || 0}"
            data-gid="${flight.groupId}"
            data-idx="${originalIdx}"
            data-action="set-waypoint-speed">
          <span style="color:var(--muted);font-size:10px">kts</span>
        </td>
        <td>
          <input
            class="wp-tos-inp"
            type="text"
            value="${formatTos(tosValue)}"
            data-gid="${flight.groupId}"
            data-idx="${originalIdx}"
            data-action="set-waypoint-tos"
            title="Time Over Steerpoint (H:MM:SS)">
        </td>
      </tr>
      <tr class="tgt-data-row" id="pvtdr-${flight.groupId}-${originalIdx}" style="display:${wp.pointType === 'TGT' ? 'table-row' : 'none'}">
        <td></td>
        <td colspan="8">
          <div class="tgt-data-wrap">
            <label>VRP Bearing (°)
              <input class="tgt-inp" type="number" min="0" max="360" step="1"
                value="${wp.targetData.vrpBearing}"
                data-gid="${flight.groupId}" data-idx="${originalIdx}" data-field="vrpBearing"
                data-action="set-target-data">
            </label>
            <label>VRP Range (nm)
              <input class="tgt-inp" type="number" min="0" step="0.1"
                value="${wp.targetData.vrpRange}"
                data-gid="${flight.groupId}" data-idx="${originalIdx}" data-field="vrpRange"
                data-action="set-target-data">
            </label>
            <label>PUP Distance (nm)
              <input class="tgt-inp" type="number" min="0" step="0.1"
                value="${wp.targetData.pupDistance}"
                data-gid="${flight.groupId}" data-idx="${originalIdx}" data-field="pupDistance"
                data-action="set-target-data">
            </label>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  const comRows = (channels, cls, radioIndex) => {
    if (!channels || typeof channels !== 'object') return '';
    return Object.entries(channels).map(([ch, d]) => `
    <tr>
      <td style="color:var(--muted);width:52px">CH ${String(ch).padStart(2,'0')}</td>
      <td>
        <input
          class="comm-freq-inp ${cls}"
          type="number"
          step="0.005"
          min="0"
          value="${Number(d.Frequency).toFixed(3)}"
          data-gid="${flight.groupId}"
          data-radio="${radioIndex}"
          data-channel="${Number(ch)}"
          data-field="freq"
          data-action="set-comm-channel-field">
      </td>
      <td>
        <input
          class="comm-name-inp"
          type="text"
          value="${d.Name || ''}"
          data-gid="${flight.groupId}"
          data-radio="${radioIndex}"
          data-channel="${Number(ch)}"
          data-field="name"
          data-action="set-comm-channel-field">
      </td>
    </tr>`).join('');
  };

  let cmdsRows = '', cmdsIsNative = false;
  if (dtc.Countermeasures?._nativePrograms) {
    cmdsIsNative = true;
    cmdsRows = Object.entries(dtc.Countermeasures._nativePrograms).map(([prog, p]) => {
      const c = p.Chaff || {}, f = p.Flare || {};
      const gid = flight.groupId;
      const inp = (field, val, step) =>
        `<input class="cmds-inp" type="number" min="0" step="${step}"
          value="${val}"
          data-gid="${gid}" data-prog="${prog}" data-field="${field}"
          data-save-prev
          data-action="set-cmds-field">`;
      return `
      <tr>
        <td style="color:var(--muted)">${prog}</td>
        <td><div class="cmds-cell">${inp('chaff_bq', c.BurstQuantity ?? 0, 1)}<span style="color:var(--muted)">×</span>${inp('chaff_sq', c.SalvoQuantity ?? 0, 1)}</div></td>
        <td><div class="cmds-cell">${inp('flare_bq', f.BurstQuantity ?? 0, 1)}<span style="color:var(--muted)">×</span>${inp('flare_sq', f.SalvoQuantity ?? 0, 1)}</div></td>
        <td><div class="cmds-cell">${inp('burst_intv', (c.BurstInterval ?? 0).toFixed(2), 0.01)}<span style="color:var(--muted)">s</span></div></td>
        <td><div class="cmds-cell">${inp('salvo_intv', (c.SalvoInterval ?? 0).toFixed(2), 0.01)}<span style="color:var(--muted)">s</span></div></td>
      </tr>`;
    }).join('');
  }

  const titleText = isMissionDtcView
    ? `Default Mission DTC — ${flight.name} (F-16C) · ${state.missionDtcFileName}`
    : `Preview — ${flight.name} (F-16C)`;

  const bodyHtml = `
      <div class="tab-panel${activeTab==='wpt' ? ' active' : ''}" data-ipanel="wpt">
        <table>
          <thead><tr>${hasDtcNav ? '<th>#</th><th>Name</th><th>Type</th><th>Latitude</th><th>Longitude</th><th>Altitude</th><th>Speed</th>' : '<th></th><th>#</th><th>Name</th><th>Role</th><th>Latitude</th><th>Longitude</th><th>Alt (m)</th><th>Speed</th><th>TOS</th>'}</tr></thead>
          <tbody>${steerRows || '<tr><td colspan="9" style="color:var(--muted);text-align:center">No steerpoints</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='c1' ? ' active' : ''}" data-ipanel="c1">
        <table>
          <thead><tr><th>CH</th><th>Frequency</th><th>Name</th></tr></thead>
          <tbody>${comRows(dtc.Radio?.UHF?.Channels, 'uhf', 1) || '<tr><td colspan="3" style="color:var(--muted)">No COM1 data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='c2' ? ' active' : ''}" data-ipanel="c2">
        <table>
          <thead><tr><th>CH</th><th>Frequency</th><th>Name</th></tr></thead>
          <tbody>${comRows(dtc.Radio?.VHF?.Channels, 'vhf', 2) || '<tr><td colspan="3" style="color:var(--muted)">No COM2 data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='cmds' ? ' active' : ''}" data-ipanel="cmds">
        <table>
          ${cmdsIsNative
            ? `<thead><tr><th>Program</th><th style="text-align:center">Chaff BQ×SQ</th><th style="text-align:center">Flare BQ×SQ</th><th style="text-align:center">Burst Intv</th><th style="text-align:center">Salvo Intv</th></tr></thead>`
            : `<thead><tr><th>Program</th><th style="text-align:center">Chaff</th><th style="text-align:center">Flare</th><th style="text-align:center">Interval</th><th style="text-align:center">Cycles</th></tr></thead>`
          }
          <tbody>${cmdsRows || '<tr><td colspan="5" style="color:var(--muted);text-align:center">No CMDS data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='kb' ? ' active' : ''}" data-ipanel="kb">
        ${buildKneeboardTabHtml(flight, family)}
      </div>
  `;

  return buildPreviewShell(flight, family, [
    { id: 'wpt',  label: 'Waypoints' },
    { id: 'c1',   label: 'COM1' },
    { id: 'c2',   label: 'COM2' },
    { id: 'cmds', label: 'CMDS' },
    { id: 'kb',   label: 'Kneeboard' },
  ], activeTab, titleText, bodyHtml);
}
