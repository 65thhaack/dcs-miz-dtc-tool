// js/miz/extractor.js
import { deepClone } from '../utils.js';
import { dcsToLatLon } from '../coords.js';
import { state } from '../state.js';

export const isF16Type = (type) => typeof type === 'string' && (type === 'F-16C_50' || type.startsWith('F-16'));
export const isF18Type = (type) => typeof type === 'string' && (type === 'FA-18C_hornet' || type.startsWith('FA-18') || type.startsWith('F/A-18') || type.startsWith('F-18'));

function summarizePayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const isGuidLike = (value) => {
    const s = String(value || '').trim();
    return /^\{?[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}?$/.test(s);
  };

  const normalizeWeaponName = (raw) => {
    if (!raw) return '';
    return String(raw)
      .replace(/[{}]/g, '')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const pickPylonLabel = (pylon) => {
    if (!pylon || typeof pylon !== 'object') return '';
    const rawCandidates = [
      pylon.CLSID,
      pylon.clsid,
      pylon.LauncherCLSID,
      pylon.launcherCLSID,
      pylon.Name,
      pylon.name,
      pylon.type,
    ].filter(v => v !== undefined && v !== null && String(v).trim() !== '');

    if (!rawCandidates.length) return '';

    const human = rawCandidates.find(v => !isGuidLike(v));
    if (!human) return '';

    return normalizeWeaponName(human);
  };

  const rawPylons = payload.pylons || payload.Pylons || payload.stations || payload.Stations;
  if (!rawPylons || typeof rawPylons !== 'object') {
    const bits = [];
    if (Number.isFinite(Number(payload.fuel))) bits.push(`Fuel:${Number(payload.fuel)}`);
    if (Number.isFinite(Number(payload.chaff))) bits.push(`Chaff:${Number(payload.chaff)}`);
    if (Number.isFinite(Number(payload.flare))) bits.push(`Flare:${Number(payload.flare)}`);
    return bits.join(' | ');
  }

  const pylonEntries = Array.isArray(rawPylons)
    ? rawPylons.map((p, i) => ({ slot: Number(p?.num ?? p?.station ?? i + 1), p }))
    : Object.entries(rawPylons).map(([k, p]) => ({ slot: Number(k), p }));

  const slots = pylonEntries
    .filter(({ slot }) => Number.isFinite(slot) && slot > 0)
    .sort((a, b) => a.slot - b.slot)
    .map(({ slot, p }) => {
      const label = pickPylonLabel(p);
      if (!label) return '';
      return `${slot}:${label}`;
    })
    .filter(Boolean);

  return slots.join(' | ');
}

export function extractFlightsByType(mission, theater, unitMatcher, aircraftType) {
  const flights = [];
  const coal = mission.coalition || {};

  for (const side of ['blue', 'red', 'neutrals']) {
    const countries = coal[side]?.country;
    if (!countries) continue;

    for (const ck of Object.keys(countries)) {
      const country = countries[ck];
      const planeGroups = country?.plane?.group;
      if (!planeGroups) continue;

      for (const gk of Object.keys(planeGroups)) {
        const group = planeGroups[gk];
        if (!group?.units) continue;

        // Gather matching units for the requested aircraft family
        const matchedUnits = [];
        for (const uk of Object.keys(group.units)) {
          const u = group.units[uk];
          if (unitMatcher(u?.type)) matchedUnits.push(u);
        }
        if (!matchedUnits.length) continue;

        // Waypoints from route.points
        const waypoints = [];
        let steerIdx = 0;
        const pts = group.route?.points || {};
        const ptKeys = Object.keys(pts).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);

        for (const k of ptKeys) {
          const pt = pts[k];
          if (!pt || pt.x === undefined) continue;
          const { lat, lon } = dcsToLatLon(pt.x, pt.y, theater);
          const type = pt.type || '';
          const isTakeoff = type.includes('TakeOff') || type.includes('Takeoff') || type === 'TakeOffParking';
          const isLand    = type === 'Land' || type === 'Landing';
          if (!isTakeoff && !isLand) steerIdx++;

          waypoints.push({
            seq: isTakeoff ? 0 : isLand ? -1 : steerIdx,
            isTakeoff, isLand,
            x:         pt.x,               // raw DCS theater coordinate (meters)
            y:         pt.y,               // raw DCS theater coordinate (meters)
            lat, lon,                      // display-only (flat-earth approximation)
            alt_m:     pt.alt    || 0,
            alt_ft:    Math.round((pt.alt || 0) * 3.28084),
            speed_ms:  pt.speed  || 0,
            speed_kts: Math.round((pt.speed || 0) * 1.94384),
            name:      pt.name   || '',
            alt_type:  pt.alt_type || 'BARO',
            type,
            pointType:  'STPT',  // pilot-selectable: STPT | IP | TGT | VRP | PUP | OA1 | OA2
            targetData: { vrpBearing: 0, vrpRange: 0.0, pupDistance: 0.0 }, // used when Type=TGT
          });
        }

        // Radio from first unit (all units share the same preset channels)
        const radio1 = {}, radio2 = {};
        const ref = matchedUnits[0];
        if (ref?.Radio) {
          const r1 = ref.Radio[1];
          const r2 = ref.Radio[2];
          if (r1?.channels) {
            for (const ch of Object.keys(r1.channels)) radio1[parseInt(ch)] = r1.channels[ch];
          }
          if (r2?.channels) {
            for (const ch of Object.keys(r2.channels)) radio2[parseInt(ch)] = r2.channels[ch];
          }
        }

        // Extract default mission DTC from first unit
        let defaultMissionDtc = null;
        let defaultMissionDtcFileName = null;
        const firstUnit = matchedUnits[0];
        if (firstUnit?.DTC?.Cartridges?.[1]?.name) {
          const dtcName = firstUnit.DTC.Cartridges[1].name;
          if (state.missionDtcMap[dtcName]) {
            defaultMissionDtc = state.missionDtcMap[dtcName];
            defaultMissionDtcFileName = `${dtcName}.dtc`;
          }
        }

        flights.push({
          groupId: group.groupId || gk,
          name:    group.name    || `Group ${gk}`,
          aircraftType,
          side,
          country: country.name || '',
          payloadSummary: summarizePayload(matchedUnits[0]?.payload || matchedUnits[0]?.Payload || group?.payload || group?.Payload),
          units: matchedUnits.map(u => ({
            name:     u.name     || '',
            callsign: u.callsign?.name || '',
            tailNumber: u.onboard_num || u.onboardNum || u.board_number || u.boardNumber || u.number || '',
            skill:    u.skill    || '',
          })),
          waypoints,
          miz: { waypoints: deepClone(waypoints), radio1: deepClone(radio1), radio2: deepClone(radio2) },
          radio1,
          radio2,
          groupX: group.x,
          groupY: group.y,
          defaultMissionDtc,
          defaultMissionDtcFileName,
        });
      }
    }
  }
  return flights;
}

export function tcnCandidateKey(tcn) {
  return [
    tcn.channel ?? '',
    tcn.modeChannel ?? '',
    tcn.unitId ?? '',
    tcn.display_name ?? '',
    Number(tcn.x || 0).toFixed(1),
    Number(tcn.y || 0).toFixed(1),
  ].join('|');
}

export function extractTacanCandidates(mission) {
  const out = [];
  const seen = new Set();
  const visited = new Set();
  const stack = [{ value: mission, path: 'mission' }];

  const asNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  while (stack.length) {
    const { value, path } = stack.pop();
    if (!value || typeof value !== 'object') continue;
    if (visited.has(value)) continue;
    visited.add(value);

    if (!Array.isArray(value)) {
      const channel = asNum(value.channel ?? value.Channel);
      const channelMode = asNum(value.channelMode ?? value.ChannelMode);
      const mode = typeof value.modeChannel === 'string'
        ? value.modeChannel.toUpperCase()
        : channelMode === 1 ? 'Y' : 'X';

      const x = asNum(value.x ?? value.X ?? value?.point?.x ?? value?.position?.x);
      const y = asNum(value.y ?? value.Y ?? value?.point?.y ?? value?.position?.y);
      const unitId = asNum(value.unitId ?? value.UnitId ?? value.id);
      const callsign = typeof value.callsign === 'string'
        ? value.callsign
        : (typeof value?.callsign?.name === 'string' ? value.callsign.name : '');
      const displayName = value.display_name || value.displayName || value.name || '';

      const pathLower = path.toLowerCase();
      const keyHint = Object.keys(value).join(' ').toLowerCase();
      const hasHint = /tacan|beacon|tcn/.test(pathLower) || /tacan|beacon/.test(keyHint);
      const hasLocOrIdentity = (x !== null && y !== null) || unitId !== null || !!callsign || !!displayName;
      const looksLikeComm = pathLower.includes('comm1') || pathLower.includes('comm2') || pathLower.includes('comm.');

      if (!looksLikeComm && channel !== null && channel >= 1 && channel <= 126 && hasLocOrIdentity && (hasHint || value.modeChannel !== undefined || value.channelMode !== undefined || value.ChannelMode !== undefined)) {
        const tcn = {
          callsign: callsign || '',
          channel: Math.round(channel),
          display_name: displayName || `${callsign || 'TACAN'}_${Math.round(channel)}${mode}`,
          elevation: asNum(value.elevation ?? value.alt ?? 0) ?? 0,
          modeChannel: mode,
          unitId: unitId ?? 0,
          unitPointNum: asNum(value.unitPointNum ?? 1) ?? 1,
          x: x ?? 0,
          y: y ?? 0,
        };
        const key = tcnCandidateKey(tcn);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(tcn);
        }
      }
    }

    for (const [k, v] of Object.entries(value)) {
      if (v && typeof v === 'object') {
        stack.push({ value: v, path: `${path}.${k}` });
      }
    }
  }

  return out.sort((a, b) => a.channel - b.channel || a.display_name.localeCompare(b.display_name));
}

// Asset type matchers
export const isTankerType = (type) => typeof type === 'string' && 
  /^(KC-135|KC-130|A330MRTT|Voyager|Aerial Refueling)/.test(type);

export const isAwacType = (type) => typeof type === 'string' && 
  /^(E-3|E-2|A-50|YAK.*40)/.test(type);

export const isCarrierType = (type) => typeof type === 'string' && /^CVN-/.test(type);

export const isShipType = (type) => typeof type === 'string' && 
  /^(CVN-|DDG-|CG-|LCS-|USS|HMCS|Charles De Gaulle|Stennis)/.test(type);

// Extract all tankers, AWACS, and ships with their callsigns, TACAN, radio, and position data
export function extractAssets(mission, theater) {
  const assets = [];
  const coal = mission.coalition || {};

  const asChannelNumber = (value) => {
    if (Number.isFinite(Number(value))) return Number(value);
    if (typeof value === 'string') {
      const m = value.match(/(\d{1,3})/);
      if (m) return Number(m[1]);
    }
    return 0;
  };

  const buildAssetTacan = (unit, fallbackName) => {
    const nested = unit?.TACAN;
    const flatChannel = asChannelNumber(
      unit?.TacanChannel
      ?? unit?.tacanChannel
      ?? unit?.tacan_channel
      ?? unit?.TACANChannel
      ?? unit?.TACAN_CHANNEL
      ?? unit?.tcn_channel
      ?? 0
    );
    const flatMode = unit?.TacanModeChannel || unit?.tacanModeChannel || unit?.TacanMode || unit?.tacanMode;
    const flatCallsign = unit?.TacanCallsign || unit?.tacanCallsign || unit?.TacanID || unit?.tacanID;

    const nestedChannel = asChannelNumber(nested?.channel ?? nested?.Channel ?? 0);
    const channel = Number.isFinite(nestedChannel) && nestedChannel > 0
      ? nestedChannel
      : (Number.isFinite(flatChannel) && flatChannel > 0 ? flatChannel : 0);
    if (!channel) return null;

    const modeRaw = nested?.modeChannel ?? nested?.ModeChannel ?? nested?.channelMode ?? nested?.ChannelMode ?? flatMode;
    let mode = 'X';
    if (typeof modeRaw === 'string' && modeRaw.trim()) {
      const m = modeRaw.trim().toUpperCase();
      if (m === 'X' || m === 'Y') mode = m;
      else if (m === '0') mode = 'X';
      else if (m === '1') mode = 'Y';
    } else if (Number.isFinite(Number(modeRaw))) {
      mode = Number(modeRaw) === 1 ? 'Y' : 'X';
    }

    return {
      channel: Math.round(channel),
      modeChannel: mode,
      callsign: nested?.callsign || nested?.Callsign || flatCallsign || unit?.callsign?.name || fallbackName,
    };
  };

  const pickPrimaryComm = (radio) => {
    if (!radio || typeof radio !== 'object') return null;
    for (const radioIdx of [1, 2]) {
      const channels = radio[radioIdx]?.channels;
      if (!channels || typeof channels !== 'object') continue;
      const channelNums = Object.keys(channels).map(Number).filter(n => !Number.isNaN(n)).sort((a, b) => a - b);
      for (const ch of channelNums) {
        const raw = channels[ch];
        const freq = typeof raw === 'object' ? Number(raw.freq ?? raw.Frequency ?? raw.frequency ?? 0) : Number(raw || 0);
        if (Number.isFinite(freq) && freq > 0) {
          return { radio: radioIdx, channel: ch, freq };
        }
      }
    }
    return null;
  };

  for (const side of ['blue', 'red', 'neutrals']) {
    const countries = coal[side]?.country;
    if (!countries) continue;

    // === PLANE ASSETS (Tankers, AWACS) ===
    for (const ck of Object.keys(countries)) {
      const country = countries[ck];
      const planeGroups = country?.plane?.group;
      if (!planeGroups) continue;

      for (const gk of Object.keys(planeGroups)) {
        const group = planeGroups[gk];
        if (!group?.units) continue;

        for (const uk of Object.keys(group.units)) {
          const u = group.units[uk];
          if (!u?.type) continue;

          const type = u.type;
          let assetType = null;
          if (isTankerType(type)) assetType = 'Tanker';
          else if (isAwacType(type)) assetType = 'AWACS';
          else continue;

          // Extract radio data
          const primaryComm = pickPrimaryComm(u.Radio);

          // Extract TACAN
          const tacan = buildAssetTacan(u, type);

          const { lat, lon } = dcsToLatLon(u.x || 0, u.y || 0, theater);
          assets.push({
            groupId: group.groupId || gk,
            unitId: u.unitId || uk,
            type: assetType,
            aircraftType: type,
            side,
            country: country.name || '',
            name: u.name || type,
            callsign: u.callsign?.name || '',
            x: u.x || 0,
            y: u.y || 0,
            lat, lon,
            alt_m: u.alt || 0,
            alt_ft: Math.round((u.alt || 0) * 3.28084),
            frequency: Number(u.frequency ?? group.frequency ?? 0) || null,
            tacan,
            primaryComm,
          });
        }
      }
    }

    // === SHIP ASSETS (Carriers, Destroyers) ===
    for (const ck of Object.keys(countries)) {
      const country = countries[ck];
      const shipGroups = country?.ship?.group;
      if (!shipGroups) continue;

      for (const gk of Object.keys(shipGroups)) {
        const group = shipGroups[gk];
        if (!group?.units) continue;

        for (const uk of Object.keys(group.units)) {
          const u = group.units[uk];
          if (!u?.type) continue;

          const type = u.type;
          let assetType = null;
          if (isCarrierType(type)) assetType = 'Carrier';
          else if (isShipType(type)) assetType = 'Ship';
          else continue;

          // Extract radio data
          const primaryComm = pickPrimaryComm(u.Radio);

          // Extract TACAN
          const tacan = buildAssetTacan(u, type);

          const { lat, lon } = dcsToLatLon(u.x || 0, u.y || 0, theater);
          assets.push({
            groupId: group.groupId || gk,
            unitId: u.unitId || uk,
            type: assetType,
            aircraftType: type,
            side,
            country: country.name || '',
            name: u.name || type,
            callsign: u.callsign?.name || '',
            x: u.x || 0,
            y: u.y || 0,
            lat, lon,
            alt_m: u.alt || 0,
            alt_ft: Math.round((u.alt || 0) * 3.28084),
            frequency: Number(u.frequency ?? group.frequency ?? 0) || null,
            heading: u.heading || 0,
            tacan,
            primaryComm,
          });
        }
      }
    }
  }

  // Fallback: map generic TACAN candidates found anywhere in mission tree back to assets.
  const tacanCandidates = extractTacanCandidates(mission);
  const byUnitId = new Map();
  for (const c of tacanCandidates) {
    const id = Number(c.unitId || 0);
    if (id > 0 && !byUnitId.has(id)) byUnitId.set(id, c);
  }

  const norm = (s) => String(s || '').trim().toLowerCase();
  for (const asset of assets) {
    if (asset.tacan?.channel) continue;

    let cand = null;
    const assetUnitId = Number(asset.unitId || 0);
    if (assetUnitId > 0) cand = byUnitId.get(assetUnitId) || null;

    if (!cand) {
      const aCall = norm(asset.callsign || asset.name);
      if (aCall) {
        cand = tacanCandidates.find(c => {
          const cCall = norm(c.callsign || c.display_name);
          return cCall && (cCall === aCall || cCall.includes(aCall) || aCall.includes(cCall));
        }) || null;
      }
    }

    if (!cand) {
      let best = null;
      let bestD2 = Infinity;
      for (const c of tacanCandidates) {
        const dx = Number(c.x || 0) - Number(asset.x || 0);
        const dy = Number(c.y || 0) - Number(asset.y || 0);
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          best = c;
          bestD2 = d2;
        }
      }
      // 10 km threshold to avoid accidental unrelated assignment.
      if (best && bestD2 <= 10000 * 10000) cand = best;
    }

    if (cand && Number(cand.channel) > 0) {
      asset.tacan = {
        channel: Math.round(Number(cand.channel)),
        modeChannel: String(cand.modeChannel || 'X').toUpperCase() === 'Y' ? 'Y' : 'X',
        callsign: cand.callsign || cand.display_name || asset.callsign || asset.aircraftType,
      };
    }
  }

  return assets;
}
