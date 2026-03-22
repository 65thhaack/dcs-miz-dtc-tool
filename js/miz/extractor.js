// js/miz/extractor.js
import { deepClone } from '../utils.js';
import { dcsToLatLon } from '../coords.js';
import { state } from '../state.js';

export const isF16Type = (type) => typeof type === 'string' && (type === 'F-16C_50' || type.startsWith('F-16'));
export const isF18Type = (type) => typeof type === 'string' && (type === 'FA-18C_hornet' || type.startsWith('FA-18') || type.startsWith('F/A-18') || type.startsWith('F-18'));

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
          units: matchedUnits.map(u => ({
            name:     u.name     || '',
            callsign: u.callsign?.name || '',
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
