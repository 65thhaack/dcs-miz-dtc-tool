import { state } from '../state.js';
import { escapeAttr, toDtcLat, toDtcLon } from '../utils.js';
import { dcsToLatLon } from '../coords.js';
import { tcnCandidateKey } from '../miz/extractor.js';
import { buildF18Dtc, ensureF18TacanSelection } from '../dtc/builder-f18.js';
import { F18_NAV_RULES } from '../dtc/defaults.js';
import { buildPreviewShell } from './preview.js';

export function buildF18PreviewHtml(flight, family) {
  // If viewing mission DTC, use it; otherwise build from flight data
  const isMissionDtcView = state.missionDtcViewMode && state.previewDtc;
  const f18 = isMissionDtcView ? state.previewDtc : buildF18Dtc(flight);
  if (!isMissionDtcView) {
    state.previewDtc = f18;
  }
  ensureF18TacanSelection(flight);
  const allowedTabs = ['wpt', 'navset', 'c1', 'c2', 'tcn', 'cmds', 'rwr'];
  const activeTab = allowedTabs.includes(flight.inlinePreviewTab) ? flight.inlinePreviewTab : 'wpt';

  // Use DTC steerpoints if viewing mission DTC with nav data; otherwise use flight waypoints
  let navRows = '';
  const hasDtcNav = isMissionDtcView && f18.Navigation?.Steerpoints;

  if (hasDtcNav) {
    // Read-only steerpoints from DTC
    navRows = f18.Navigation.Steerpoints.map((pt, idx) => {
      const { lat, lon } = dcsToLatLon(pt.x, pt.y, state.theater);
      return `
      <tr>
        <td style="color:var(--muted)">${idx + 1}</td>
        <td style="color:var(--text)">${pt.name || '—'}</td>
        <td style="color:var(--text)">${toDtcLat(lat)}</td>
        <td style="color:var(--text)">${toDtcLon(lon)}</td>
        <td style="color:var(--text)">${pt.alt_ft.toLocaleString()} <span style="color:var(--muted);font-size:10px">ft</span></td>
      </tr>`;
    }).join('');
  } else {
    // Editable waypoints from flight
    navRows = flight.waypoints
      .map((wp, originalIdx) => ({ wp, originalIdx }))
      .filter(({ wp }) => !wp.isTakeoff && !wp.isLand)
      .map(({ wp, originalIdx }, i) => `
      <tr>
        <td style="width:20px;padding:0 4px 0 0">
          <button class="wp-del-btn" type="button" title="Remove waypoint"
            data-gid="${flight.groupId}" data-idx="${originalIdx}"
            data-action="remove-waypoint">🗑</button>
        </td>
        <td style="color:var(--muted)">${i + 1}</td>
        <td>
          <input
            class="wp-name-inp"
            type="text"
            value="${escapeAttr(wp.name || '')}"
            data-gid="${flight.groupId}"
            data-idx="${originalIdx}"
            data-action="set-waypoint-name">
        </td>
        <td>${toDtcLat(wp.lat)}</td>
        <td>${toDtcLon(wp.lon)}</td>
        <td>${wp.alt_ft.toLocaleString()} <span style="color:var(--muted);font-size:10px">ft</span></td>
      </tr>`).join('');
  }

  const comRows = (comm, cls, radioIndex) => {
    if (!comm || typeof comm !== 'object') return '';
    return Object.entries(comm).map(([ch, d]) => {
      const channelNum = Number(ch.replace('Channel_', ''));
      return `
    <tr>
      <td style="color:var(--muted)">${ch.replace('Channel_', 'CH ')}</td>
      <td>
        <input
          class="comm-freq-inp ${cls}"
          type="number"
          step="0.005"
          min="0"
          value="${Number(d.frequency).toFixed(3)}"
          data-gid="${flight.groupId}"
          data-radio="${radioIndex}"
          data-channel="${channelNum}"
          data-field="freq"
          data-action="set-comm-channel-field">
      </td>
      <td>
        <input
          class="comm-name-inp"
          type="text"
          value="${d.name || ''}"
          data-gid="${flight.groupId}"
          data-radio="${radioIndex}"
          data-channel="${channelNum}"
          data-field="name"
          data-action="set-comm-channel-field">
      </td>
    </tr>`;
    }).join('');
  };

  const selectedTcnKeys = new Set(flight.selectedTacanKeys || []);
  const tcnRows = state.tacanCandidates.length
    ? state.tacanCandidates.map(t => {
      const key = tcnCandidateKey(t);
      return `
    <tr>
      <td style="text-align:center"><input type="checkbox" data-gid="${flight.groupId}" data-key="${key}" ${selectedTcnKeys.has(key) ? 'checked' : ''} data-action="set-f18-tacan-selected"></td>
      <td style="color:var(--muted)">${t.callsign || '—'}</td>
      <td>${t.channel || '—'}${t.modeChannel ? t.modeChannel : ''}</td>
      <td>${t.display_name || '—'}</td>
      <td>${Math.round(t.x || 0)} / ${Math.round(t.y || 0)}</td>
    </tr>`;
    }).join('')
    : (Array.isArray(f18.TCN) ? f18.TCN : []).map(t => `
    <tr>
      <td style="text-align:center;color:var(--muted)">—</td>
      <td style="color:var(--muted)">${t.callsign || '—'}</td>
      <td>${t.channel || '—'}${t.modeChannel ? t.modeChannel : ''}</td>
      <td>${t.display_name || '—'}</td>
      <td>${Math.round(t.x || 0)} / ${Math.round(t.y || 0)}</td>
    </tr>`).join('');

  const flattenObj = (obj, prefix = '') => {
    const rows = [];
    if (!obj || typeof obj !== 'object') return rows;
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        rows.push(...flattenObj(v, key));
      } else {
        rows.push({ key, value: v, kind: typeof v });
      }
    }
    return rows;
  };

  const navSettingEntries = flattenObj(f18.NAV_SETTINGS);
  const navSettingSections = [];
  const navSettingSectionMap = new Map();

  for (const entry of navSettingEntries) {
    const [rawSection = 'General', fieldName = entry.key] = entry.key.split('.', 2);
    if (!navSettingSectionMap.has(rawSection)) {
      const section = {
        rawSection,
        label: rawSection.split('_')[0] || rawSection,
        items: [],
      };
      navSettingSectionMap.set(rawSection, section);
      navSettingSections.push(section);
    }
    navSettingSectionMap.get(rawSection).items.push({
      ...entry,
      fieldName,
    });
  }

  const navSettingRows = navSettingSections.map(section => {
    const itemRows = section.items.map(({ key, value, kind, fieldName }) => {
      const rule = F18_NAV_RULES[key];
      let input = '';
      if (kind === 'boolean') {
        input = `<input type="checkbox" data-gid="${flight.groupId}" data-path="${key}" data-kind="boolean" ${value ? 'checked' : ''} data-action="set-f18-nav-setting">`;
      } else if (rule?.kind === 'enum') {
        const opts = rule.options.map(opt => `<option value="${opt.value}"${Number(value) === Number(opt.value) ? ' selected' : ''}>${opt.label}</option>`).join('');
        input = `<select class="tgt-inp" data-gid="${flight.groupId}" data-path="${key}" data-kind="enum" data-action="set-f18-nav-setting">${opts}</select>`;
      } else if (kind === 'number' || rule?.kind === 'int' || rule?.kind === 'number') {
        const step = rule?.step ?? 1;
        const min = typeof rule?.min === 'number' ? ` min="${rule.min}"` : '';
        const max = typeof rule?.max === 'number' ? ` max="${rule.max}"` : '';
        const kindAttr = rule?.kind === 'int' ? 'int' : 'number';
        input = `<input class="tgt-inp" type="number" value="${value}"${min}${max} step="${step}" data-gid="${flight.groupId}" data-path="${key}" data-kind="${kindAttr}" data-action="set-f18-nav-setting">`;
      } else {
        input = `<input class="tgt-inp" type="text" value="${value ?? ''}" data-gid="${flight.groupId}" data-path="${key}" data-kind="string" data-action="set-f18-nav-setting">`;
      }

      return `
    <tr>
      <td class="nav-setting-name" style="color:var(--muted)">${fieldName}</td>
      <td>${input}</td>
    </tr>`;
    }).join('');

    return `
    <tr class="nav-settings-group-row">
      <td colspan="2">${section.label}</td>
    </tr>${itemRows}`;
  }).join('');

  const cmdsRows = Object.entries(f18.ALR67?.CMDS?.CMDSProgramSettings || {})
    .filter(([, p]) => p && typeof p === 'object')
    .map(([name, p]) => {
      const gid = flight.groupId;
      const inp = (field, val, step) =>
        `<input class="cmds-inp" type="number" min="0" step="${step}"
          value="${val}"
          data-gid="${gid}" data-prog="${name}" data-field="${field}" data-aircraft="f18"
          data-save-prev
          data-action="set-cmds-field">`;
      return `
    <tr>
      <td style="color:var(--muted)">${name}</td>
      <td><div class="cmds-cell">${inp('chaff_qty', p?.Chaff?.Quantity ?? 0, 1)}</div></td>
      <td><div class="cmds-cell">${inp('chaff_rep', p?.Chaff?.Repeat ?? 0, 1)}</div></td>
      <td><div class="cmds-cell">${inp('chaff_intv', (p?.Chaff?.Interval ?? 0).toFixed(2), 0.01)}<span style="color:var(--muted)">s</span></div></td>
      <td><div class="cmds-cell">${inp('flare_qty', p?.Flare?.Quantity ?? 0, 1)}</div></td>
    </tr>`;
    }).join('');

  const rwrTable = f18.ALR67?.RWR?.RWR_Avionics_Threat_Table || {};
  const rwrRows = Object.entries(rwrTable)
    .sort(([, a], [, b]) => (a?.PRI ?? 999) - (b?.PRI ?? 999))
    .slice(0, 80)
    .map(([threat, cfg]) => `
      <tr>
        <td style="color:var(--muted);text-align:center">${cfg?.PRI ?? '—'}</td>
        <td>${threat}</td>
        <td style="color:var(--muted)">${cfg?.display ? 'display' : ''}${cfg?.aspj_xmit ? ' · aspj' : ''}</td>
      </tr>`).join('');

  const rwrFlags = f18.ALR67?.RWR || {};
  const rwrFlagHtml = ['AAA', 'AI', 'FRND', 'NORM', 'UNK']
    .filter(k => Object.prototype.hasOwnProperty.call(rwrFlags, k))
    .map(k => `<div class="ews-item"><span class="ek">${k}</span>${rwrFlags[k] ? '<span class="ews-val-on">ON</span>' : '<span class="ews-val-off">OFF</span>'}</div>`)
    .join('');

  const titleText = isMissionDtcView
    ? `Default Mission DTC — ${flight.name} (F/A-18C) · ${state.missionDtcFileName}`
    : `Preview — ${flight.name} (F/A-18C)`;

  const bodyHtml = `
      <div class="tab-panel${activeTab==='wpt' ? ' active' : ''}" data-ipanel="wpt">
        <table>
          <thead><tr>${hasDtcNav ? '<th>#</th>' : '<th></th><th>#</th>'}<th>Name</th><th>Latitude</th><th>Longitude</th><th>Altitude</th></tr></thead>
          <tbody>${navRows || `<tr><td colspan="${hasDtcNav ? 5 : 6}" style="color:var(--muted);text-align:center">No waypoints</td></tr>`}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='navset' ? ' active' : ''}" data-ipanel="navset">
        <table>
          <thead><tr><th>Setting</th><th>Value</th></tr></thead>
          <tbody>${navSettingRows || '<tr><td colspan="2" style="color:var(--muted)">No NAV settings</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='c1' ? ' active' : ''}" data-ipanel="c1">
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;cursor:pointer">
          <input type="checkbox" data-gid="${flight.groupId}" data-radio="1" ${f18.guardComm1 ? 'checked' : ''} data-action="set-f18-comm-guard">
          Guard (243.0 MHz monitor)
        </label>
        <table>
          <thead><tr><th>CH</th><th>Frequency</th><th>Name</th></tr></thead>
          <tbody>${comRows(f18.COMM1, 'uhf', 1) || '<tr><td colspan="3" style="color:var(--muted)">No COMM1 data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='c2' ? ' active' : ''}" data-ipanel="c2">
        <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;cursor:pointer">
          <input type="checkbox" data-gid="${flight.groupId}" data-radio="2" ${f18.guardComm2 ? 'checked' : ''} data-action="set-f18-comm-guard">
          Guard (243.0 MHz monitor)
        </label>
        <table>
          <thead><tr><th>CH</th><th>Frequency</th><th>Name</th></tr></thead>
          <tbody>${comRows(f18.COMM2, 'vhf', 2) || '<tr><td colspan="3" style="color:var(--muted)">No COMM2 data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='tcn' ? ' active' : ''}" data-ipanel="tcn">
        <table>
          <thead><tr><th>Add</th><th>Callsign</th><th>Channel</th><th>Display Name</th><th>X/Y</th></tr></thead>
          <tbody>${tcnRows || '<tr><td colspan="5" style="color:var(--muted)">No TACAN data</td></tr>'}</tbody>
        </table>
        ${state.tacanCandidates.length ? '<p style="margin-top:8px;color:var(--muted);font-size:11px">Uncheck stations you do not want included in the exported F/A-18C DTC.</p>' : ''}
      </div>
      <div class="tab-panel${activeTab==='cmds' ? ' active' : ''}" data-ipanel="cmds">
        <table>
          <thead><tr><th>Program</th><th style="text-align:center">Chaff Qty</th><th style="text-align:center">Repeat</th><th style="text-align:center">Interval</th><th style="text-align:center">Flare Qty</th></tr></thead>
          <tbody>${cmdsRows || '<tr><td colspan="5" style="color:var(--muted)">No ALR67 CMDS data</td></tr>'}</tbody>
        </table>
      </div>
      <div class="tab-panel${activeTab==='rwr' ? ' active' : ''}" data-ipanel="rwr">
        ${rwrFlagHtml ? `<div class="ews-grid" style="margin-bottom:12px">${rwrFlagHtml}</div>` : ''}
        <table>
          <thead><tr><th style="text-align:center">PRI</th><th>Threat</th><th>Flags</th></tr></thead>
          <tbody>${rwrRows || '<tr><td colspan="3" style="color:var(--muted)">No ALR67 RWR threats</td></tr>'}</tbody>
        </table>
      </div>
  `;

  return buildPreviewShell(flight, family, [
    { id: 'wpt',    label: 'Waypoints' },
    { id: 'navset', label: 'NAV Settings' },
    { id: 'c1',     label: 'COMM1' },
    { id: 'c2',     label: 'COMM2' },
    { id: 'tcn',    label: 'TACAN' },
    { id: 'cmds',   label: 'ALR67 CMDS' },
    { id: 'rwr',    label: 'ALR67 RWR' },
  ], activeTab, titleText, bodyHtml);
}
