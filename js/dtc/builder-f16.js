import { state } from '../state.js';
import { deepClone, getFlightPersonalDtc, toDtcLat, toDtcLon } from '../utils.js';
import { defaultF16Cmds } from './defaults.js';
import { buildCommChannels, getFlightCommName } from './shared.js';

// Returns the mutable CMDS programs for a F-16 flight.
// Deep-clones the source so edits are independent of _rawMpd (which deepClone breaks on import).
export function ensureF16CmdsPrograms(flight) {
  if (!flight.f16CmdsPrograms) {
    const pd = getFlightPersonalDtc(flight);
    const src = pd?.Countermeasures?._nativePrograms
      || flight.defaultMissionDtc?.Countermeasures?._nativePrograms;
    flight.f16CmdsPrograms = src ? deepClone(src) : defaultF16Cmds();
  }
  return flight.f16CmdsPrograms;
}

export function buildDtc(flight) {
  const personalDtc = getFlightPersonalDtc(flight);
  const mergeComms = flight.dtcMergeOptions?.comms !== false;
  const mergeCmds  = flight.dtcMergeOptions?.cmds  !== false;
  // ── Radio — mission presets (used for preview COM tabs) ────────────────
  const personalComm1 = mergeComms ? (personalDtc?._uhfChannels || personalDtc?.Radio?.UHF?.Channels || {}) : {};
  const personalComm2 = mergeComms ? (personalDtc?._vhfChannels || personalDtc?.Radio?.VHF?.Channels || {}) : {};

  const { raw1, raw2 } = buildCommChannels(flight, personalComm1, personalComm2);

  const uhfChannels = {}, vhfChannels = {};
  for (let i = 1; i <= 20; i++) {
    if (raw1[i] !== undefined) {
      uhfChannels[String(i)] = {
        Frequency: raw1[i].freq,
        Name: getFlightCommName(flight, 1, i, raw1[i].pCh?.Name || ''),
      };
    }
    if (raw2[i] !== undefined) {
      vhfChannels[String(i)] = {
        Frequency: raw2[i].freq,
        Name: getFlightCommName(flight, 2, i, raw2[i].pCh?.Name || ''),
      };
    }
  }

  // ── Countermeasures — personal DTC programs when cmds=true, mission programs when cmds=false ──
  const _cmdsBase = (mergeCmds ? personalDtc?.Countermeasures : null) || flight.defaultMissionDtc?.Countermeasures || null;
  const missionNativePrograms = flight.defaultMissionDtc?.Countermeasures?._nativePrograms;
  const countermeasures = {
    ...(_cmdsBase || {}),
    _nativePrograms: mergeCmds
      ? (flight.f16CmdsPrograms || ensureF16CmdsPrograms(flight))
      : (missionNativePrograms ? deepClone(missionNativePrograms) : defaultF16Cmds()),
    _nativeBingo: _cmdsBase?._nativeBingo || {},
    _nativeThreatMap: _cmdsBase?._nativeThreatMap || {},
  };

  // ── EWS — only populated when a personal .dtc is loaded ────────────────
  const ews = personalDtc?.EWS || null;

  // ── Navigation steerpoints ─────────────────────────────────────────────
  // Exclude TakeOff and Landing. Keyed object "1"/{…}, "2"/{…}, …
  // Coordinates: DTC native DMS strings "DD.MM.SSN" / "DDD.MM.SSE".
  // TGT-type points carry an optional TargetData block.
  const steerpointObj = {};
  let stNum = 0;
  for (const wp of flight.waypoints.filter(wp => !wp.isTakeoff && !wp.isLand)) {
    stNum++;
    const entry = {
      Name: wp.name || `STPT${stNum}`,
      Type: wp.pointType || 'STPT',
      Lat:  toDtcLat(wp.lat),
      Long: toDtcLon(wp.lon),
      Alt:  wp.alt_ft,
    };
    if (wp.pointType === 'TGT' && wp.targetData) {
      entry.TargetData = {
        VRP_Bearing:  wp.targetData.vrpBearing,
        VRP_Range:    parseFloat(wp.targetData.vrpRange.toFixed(2)),
        PUP_Distance: parseFloat(wp.targetData.pupDistance.toFixed(2)),
      };
    }
    steerpointObj[String(stNum)] = entry;
  }

  return {
    Aircraft:         'F-16C_50',
    Version:          '1.0',
    Radio: {
      UHF: { Channels: uhfChannels },
      VHF: { Channels: vhfChannels },
    },
    ...(countermeasures ? { Countermeasures: countermeasures } : {}),
    ...(ews            ? { EWS: ews }              : {}),
    Navigation: {
      Steerpoints: steerpointObj,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  DTC Native Builder — outputs real DCS format for export
//  { data: { COMM, ELINT, MPD, NAV }, name, type }
//  COMM  = mission radio presets
//  ELINT = passthrough from personal .dtc (RWR priorities)
//  MPD   = passthrough from personal .dtc (CMDS programs)
//  NAV   = native NAV_PTS list from mission waypoints
// ═══════════════════════════════════════════════════════════════════════════
export function buildDtcNative(flight) {
  const personalDtc = getFlightPersonalDtc(flight);
  // ── COMM — personal DTC overrides mission radio (same pattern as CMDS) ───
  const mergeComms = flight.dtcMergeOptions?.comms !== false;
  const personalComm1 = mergeComms ? (personalDtc?._uhfChannels || personalDtc?.Radio?.UHF?.Channels || {}) : {};
  const personalComm2 = mergeComms ? (personalDtc?._vhfChannels || personalDtc?.Radio?.VHF?.Channels || {}) : {};

  const { raw1, raw2 } = buildCommChannels(flight, personalComm1, personalComm2);

  const comm1 = {}, comm2 = {};
  for (let i = 1; i <= 20; i++) {
    if (raw1[i] !== undefined) comm1[`Channel_${i}`] = { freq: raw1[i].freq, modulation: 1 };
    if (raw2[i] !== undefined) comm2[`Channel_${i}`] = { freq: raw2[i].freq, modulation: 1 };
  }

  const orderChannels = (channels) => Object.keys(channels)
    .sort((a, b) => a.localeCompare(b))
    .reduce((out, key) => {
      out[key] = channels[key];
      return out;
    }, {});

  // ── NAV — native NAV_PTS from mission (exclude takeoff/landing) ──────────
  const navWps = flight.waypoints.filter(w => !w.isTakeoff && !w.isLand);
  const navPts = [];
  let tos = 3600;
  for (let i = 0; i < navWps.length; i++) {
    const wp = navWps[i];
    const n = i + 1;
    const type = wp.pointType || 'STPT';
    const navId = `STPT${n}`;

    if (i > 0) {
      const prev = navWps[i - 1];
      const dx = (wp.x || 0) - (prev.x || 0);
      const dy = (wp.y || 0) - (prev.y || 0);
      const distM = Math.hypot(dx, dy);
      const speedMs = (wp.speed_ms > 0 ? wp.speed_ms : (prev.speed_ms > 0 ? prev.speed_ms : 220));
      tos += distM / speedMs;
    }

    navPts.push({
      alt: Math.max(0, Math.round(wp.alt_m || 0)),
      altitudeType: 1,
      FIX_Time: false,
      id: navId,
      idOA1: `OA1${n}`,
      idOA1_Line: `OA1${n}Line`,
      idOA2: `OA2${n}`,
      idOA2_Line: `OA2${n}Line`,
      isOAP_1: false,
      isOAP_2: false,
      isTOSEnabled: true,
      note: wp.name || '',
      number: n,
      OAP_1_Alt: 0,
      OAP_1_Bearing: 0,
      OAP_1_DeltaX: 0,
      OAP_1_DeltaY: 0,
      OAP_1_Range: 0,
      OAP_1_X: 0,
      OAP_1_Y: 0,
      OAP_2_Alt: 0,
      OAP_2_Bearing: 0,
      OAP_2_DeltaX: 0,
      OAP_2_DeltaY: 0,
      OAP_2_Range: 0,
      OAP_2_X: 0,
      OAP_2_Y: 0,
      R1: true,
      R2: false,
      R3: false,
      routeAltitude: Math.max(0, Math.round(wp.alt_ft || 0)),
      speed: Math.round((wp.speed_ms || 0) * 3.6),
      TOS: i === 0 ? 3600 : tos,
      type,
      velocityType: 3,
      x: wp.x || 0,
      y: wp.y || 0,
    });
  }

  // ── Passthrough ELINT and MPD from personal .dtc (fall back to mission DTC) ──────────
  const pd = personalDtc;
  const mergeCmds = flight.dtcMergeOptions?.cmds !== false;
  const elint = pd?._rawElint || {};
  const mpdSrc = (mergeCmds ? pd?._rawMpd : null) || flight.defaultMissionDtc?._rawMpd || {};
  // Always inject f16CmdsPrograms when set — deepClone on import breaks the _rawMpd reference,
  // so the only reliable source for edits is flight.f16CmdsPrograms.
  const f16Cmds = flight.f16CmdsPrograms;
  const mpd = f16Cmds
    ? { ...mpdSrc, CMDS: { ...(mpdSrc.CMDS || {}), CMDSProgramSettings: f16Cmds } }
    : mpdSrc;
  // For standalone DTC flights (no mission loaded), preserve the original NAV_PTS
  // and terrain from the personal DTC rather than overwriting with an empty list.
  const mpdWithNav = (flight._standalone && navPts.length === 0)
    ? { ...mpd }
    : { ...mpd, mirror_NAV_PTS: false, NAV_PTS: navPts, terrain: state.theater };

  return {
    data: {
      COMM:  {
        COMM1: orderChannels(comm1),
        COMM2: orderChannels(comm2),
        mirror_COMM1: true,
        mirror_COMM2: true,
      },
      ELINT: elint,
      MPD:   mpdWithNav,
      terrain: state.theater,
      name: flight.name,
      type: 'F-16C_50',
    },
    name: flight.name,
    type: 'F-16C_50',
  };
}
