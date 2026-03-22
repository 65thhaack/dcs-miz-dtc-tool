import { state } from '../state.js';
import { escapeAttr } from '../utils.js';
import { latDecimalMinutes, lonDecimalMinutes, dcsToLatLon } from '../coords.js';
import { buildDtc } from '../dtc/builder-f16.js';
import { buildPreviewShell } from './preview.js';

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
  const allowedTabs = ['wpt', 'c1', 'c2', 'cmds'];
  const activeTab = allowedTabs.includes(flight.inlinePreviewTab) ? flight.inlinePreviewTab : 'wpt';

  // Use DTC steerpoints if viewing mission DTC with nav data; otherwise use flight waypoints
  let steerRows = '';
  const hasDtcNav = isMissionDtcView && dtc.Navigation?.Steerpoints;

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
    steerRows = navWps.map(({ wp, originalIdx }, steerIdx) => {
      const stNum = steerIdx + 1;
      const type  = (wp.pointType || 'STPT').toLowerCase();
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
            <option value="STPT"${wp.pointType==='STPT'?' selected':''}>○  STPT</option>
            <option value="IP"  ${wp.pointType==='IP'  ?' selected':''}>□  IP</option>
            <option value="TGT" ${wp.pointType==='TGT' ?' selected':''}>△  TGT</option>
            <option value="VRP" ${wp.pointType==='VRP' ?' selected':''}>◇  VRP</option>
            <option value="PUP" ${wp.pointType==='PUP' ?' selected':''}>▽  PUP</option>
            <option value="OA1" ${wp.pointType==='OA1' ?' selected':''}>①  OA1</option>
            <option value="OA2" ${wp.pointType==='OA2' ?' selected':''}>②  OA2</option>
          </select>
        </td>
        <td>${latDecimalMinutes(wp.lat)}</td>
        <td>${lonDecimalMinutes(wp.lon)}</td>
        <td>${wp.alt_ft.toLocaleString()} <span style="color:var(--muted);font-size:10px">ft</span></td>
      </tr>
      <tr class="tgt-data-row" id="pvtdr-${flight.groupId}-${originalIdx}"${wp.pointType === 'TGT' ? '' : ' style="display:none"'}>
        <td></td>
        <td colspan="5">
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
          <thead><tr>${hasDtcNav ? '<th>#</th><th>Name</th><th>Type</th><th>Latitude</th><th>Longitude</th><th>Altitude</th><th>Speed</th>' : '<th></th><th>Waypoint</th><th>Name</th><th>Role</th><th>Latitude</th><th>Longitude</th><th>Altitude</th>'}</tr></thead>
          <tbody>${steerRows || '<tr><td colspan="7" style="color:var(--muted);text-align:center">No steerpoints</td></tr>'}</tbody>
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
  `;

  return buildPreviewShell(flight, family, [
    { id: 'wpt',  label: 'Waypoints' },
    { id: 'c1',   label: 'COM1' },
    { id: 'c2',   label: 'COM2' },
    { id: 'cmds', label: 'CMDS' },
  ], activeTab, titleText, bodyHtml);
}
