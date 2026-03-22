import { state } from '../state.js';
import { deepClone, getFlightPersonalDtc } from '../utils.js';
import { tcnCandidateKey } from '../miz/extractor.js';
import { defaultF18Alr67, defaultF18NavSettings, F18_COMM_DEFAULT_FREQS } from './defaults.js';
import { buildCommChannels, getFlightCommName } from './shared.js';

export function normalizeF18Alr67(raw) {
  const src = deepClone(raw || defaultF18Alr67());
  if (!src.CMDS || typeof src.CMDS !== 'object') src.CMDS = {};
  if (!src.CMDS.CMDSProgramSettings || typeof src.CMDS.CMDSProgramSettings !== 'object') {
    src.CMDS.CMDSProgramSettings = defaultF18Alr67().CMDS.CMDSProgramSettings;
  }
  if (!src.CMDS.CMDS_Threat_table || typeof src.CMDS.CMDS_Threat_table !== 'object') src.CMDS.CMDS_Threat_table = {};

  const tt = src.CMDS.CMDS_Threat_table;
  if (!tt.Air || typeof tt.Air !== 'object' || Array.isArray(tt.Air)) tt.Air = {};
  if (!tt.Ground || typeof tt.Ground !== 'object' || Array.isArray(tt.Ground)) tt.Ground = {};
  if (!tt.Naval || typeof tt.Naval !== 'object' || Array.isArray(tt.Naval)) tt.Naval = {};
  if (!tt.Other || typeof tt.Other !== 'object' || Array.isArray(tt.Other)) tt.Other = {};
  if (!Array.isArray(tt.CMDS_Avionics_Threat_Table)) tt.CMDS_Avionics_Threat_Table = [];

  if (!src.RWR || typeof src.RWR !== 'object') src.RWR = {};
  if (!src.RWR.AAA || typeof src.RWR.AAA !== 'object' || Array.isArray(src.RWR.AAA)) src.RWR.AAA = {};
  if (!src.RWR.AI || typeof src.RWR.AI !== 'object' || Array.isArray(src.RWR.AI)) src.RWR.AI = {};
  if (!src.RWR.FRND || typeof src.RWR.FRND !== 'object' || Array.isArray(src.RWR.FRND)) src.RWR.FRND = {};
  if (!src.RWR.NORM || typeof src.RWR.NORM !== 'object' || Array.isArray(src.RWR.NORM)) src.RWR.NORM = {};
  if (!src.RWR.UNK || typeof src.RWR.UNK !== 'object' || Array.isArray(src.RWR.UNK)) src.RWR.UNK = {};

  if (!src.RWR.RWR_Avionics_Threat_Table || typeof src.RWR.RWR_Avionics_Threat_Table !== 'object' || Array.isArray(src.RWR.RWR_Avionics_Threat_Table)) {
    src.RWR.RWR_Avionics_Threat_Table = {};
  }
  const rwrAv = src.RWR.RWR_Avionics_Threat_Table;
  if (!Array.isArray(rwrAv.AAA)) rwrAv.AAA = [];
  if (!Array.isArray(rwrAv.AI)) rwrAv.AI = [];
  if (!Array.isArray(rwrAv.FRND)) rwrAv.FRND = [];
  if (!Array.isArray(rwrAv.NORM)) rwrAv.NORM = [];
  if (!Array.isArray(rwrAv.UNK)) rwrAv.UNK = [];

  return src;
}

export function ensureF18TacanSelection(flight) {
  const keys = state.tacanCandidates.map(tcnCandidateKey);
  if (!keys.length) {
    flight.selectedTacanKeys = [];
    return;
  }
  if (!Array.isArray(flight.selectedTacanKeys)) {
    flight.selectedTacanKeys = [...keys];
    return;
  }
  const available = new Set(keys);
  flight.selectedTacanKeys = flight.selectedTacanKeys.filter(k => available.has(k));
  if (!flight.selectedTacanKeys.length) flight.selectedTacanKeys = [...keys];
}

export function fillF18CommDefaults(comm, personalComm, radioIndex) {
  for (let i = 1; i <= 20; i++) {
    const key = `Channel_${i}`;
    if (!comm[key]) {
      const pCh = personalComm?.[key];
      comm[key] = {
        frequency: pCh?.frequency ?? F18_COMM_DEFAULT_FREQS[i],
        modulation: pCh?.modulation ?? 0,
        name: pCh?.name || `CH ${i}`,
      };
    }
  }

  if (!comm.Channel_C) {
    comm.Channel_C = {
      frequency: 30,
      modulation: 1,
      name: personalComm?.Channel_C?.name || 'CUE',
    };
  }
  if (!comm.Channel_G) {
    comm.Channel_G = {
      frequency: 243,
      modulation: 0,
      name: personalComm?.Channel_G?.name || 'GUARD',
    };
  }
  if (!comm.Channel_M) {
    comm.Channel_M = {
      frequency: radioIndex === 1 ? 122.8 : 305,
      modulation: 0,
      name: personalComm?.Channel_M?.name || 'MAN',
    };
  }
  if (!comm.Channel_S) {
    comm.Channel_S = {
      frequency: 156.05,
      modulation: 1,
      name: personalComm?.Channel_S?.name || 'MAR',
    };
  }
}

export function buildF18Dtc(flight) {
  const personalDtc = getFlightPersonalDtc(flight);
  const mergeComms = flight.dtcMergeOptions?.comms !== false;
  const personalComm1 = mergeComms ? (personalDtc?._f18Comm?.COMM1 || {}) : {};
  const personalComm2 = mergeComms ? (personalDtc?._f18Comm?.COMM2 || {}) : {};

  const { raw1, raw2 } = buildCommChannels(flight, personalComm1, personalComm2);

  const comm1 = {}, comm2 = {};
  for (let i = 1; i <= 20; i++) {
    if (raw1[i] !== undefined) {
      comm1[`Channel_${i}`] = {
        frequency: raw1[i].freq,
        modulation: raw1[i].pCh?.modulation ?? 0,
        name: getFlightCommName(flight, 1, i, raw1[i].pCh?.name || `CH ${i}`),
      };
    }
    if (raw2[i] !== undefined) {
      comm2[`Channel_${i}`] = {
        frequency: raw2[i].freq,
        modulation: raw2[i].pCh?.modulation ?? 0,
        name: getFlightCommName(flight, 2, i, raw2[i].pCh?.name || `CH ${i}`),
      };
    }
  }

  fillF18CommDefaults(comm1, personalComm1, 1);
  fillF18CommDefaults(comm2, personalComm2, 2);

  let tcn = [];
  if (state.tacanCandidates.length) {
    ensureF18TacanSelection(flight);
    const selected = new Set(flight.selectedTacanKeys || []);
    tcn = state.tacanCandidates
      .filter(t => selected.has(tcnCandidateKey(t)))
      .map(t => deepClone(t));
  } else {
    tcn = Array.isArray(personalDtc?._rawTcn) ? personalDtc._rawTcn : [];
  }
  const mergeWaypoints = flight.dtcMergeOptions?.waypoints !== false;
  const navSettingsBase = flight.navSettingsF18
    || (mergeWaypoints ? personalDtc?._rawWypt?.NAV_SETTINGS : null)
    || flight.defaultMissionDtc?._rawWypt?.NAV_SETTINGS
    || defaultF18NavSettings();
  const navSettings = deepClone(navSettingsBase);
  const mergeCmds = flight.dtcMergeOptions?.cmds !== false;
  const alr67 = normalizeF18Alr67((mergeCmds ? personalDtc?._rawAlr67 : null) || flight.defaultMissionDtc?._rawAlr67 || defaultF18Alr67());
  // Apply per-flight CMDS edits on top of the normalized defaults
  if (flight.f18CmdsEdits) {
    for (const [prog, edits] of Object.entries(flight.f18CmdsEdits)) {
      if (alr67.CMDS.CMDSProgramSettings[prog]) {
        if (edits.Chaff) Object.assign(alr67.CMDS.CMDSProgramSettings[prog].Chaff, edits.Chaff);
        if (edits.Flare) Object.assign(alr67.CMDS.CMDSProgramSettings[prog].Flare, edits.Flare);
      }
    }
  }

  const guardComm1 = flight.guardComm1 ?? (mergeComms ? personalDtc?._f18Comm?.COMM1?.Guard : null) ?? true;
  const guardComm2 = flight.guardComm2 ?? (mergeComms ? personalDtc?._f18Comm?.COMM2?.Guard : null) ?? true;

  return { COMM1: comm1, COMM2: comm2, TCN: tcn, NAV_SETTINGS: navSettings, ALR67: alr67, guardComm1, guardComm2 };
}

export function buildF18DtcNative(flight) {
  const f18 = buildF18Dtc(flight);
  const orderChannels = (channels) => Object.keys(channels)
    .sort((a, b) => a.localeCompare(b))
    .reduce((out, key) => {
      out[key] = channels[key];
      return out;
    }, {});

  // Skip the first waypoint if it's the group spawn position (in-air start)
  const navWps = flight.waypoints.filter(wp => !wp.isTakeoff && !wp.isLand);
  const firstWp = navWps[0];
  const isSpawn = firstWp && flight.groupX !== undefined &&
    Math.abs(firstWp.x - flight.groupX) < 0.01 && Math.abs(firstWp.y - flight.groupY) < 0.01;
  const steerWps = isSpawn ? navWps.slice(1) : navWps;

  const navPts = steerWps.map((wp, idx) => {
    const n = idx + 1;
    return {
      alt: Math.max(0, Number(wp.alt_m || 0)),
      altitudeType: 1,
      id: `STPT${n}`,
      idOA: `OA${n}`,
      idOA_Line: `OA${n}Line`,
      isOA: false,
      note: '',
      OA_Alt: 0,
      OA_Bearing: 0,
      OA_Bearing_Units: 1,
      OA_DeltaX: 0,
      OA_DeltaY: 0,
      OA_Elevation_Units: 1,
      OA_Range: 0,
      OA_Range_Units: 1,
      OA_X: 0,
      OA_Y: 0,
      R1: false,
      R2: false,
      R3: false,
      text_note: '',
      velocityType: 3,
      wypt_num: n,
      x: wp.x || 0,
      y: wp.y || 0,
    };
  });

  const personalDtc = getFlightPersonalDtc(flight);
  const commRaw = personalDtc?._f18Comm || {};
  return {
    data: {
      ALR67: f18.ALR67,
      COMM: {
        COMM1: { ...orderChannels(f18.COMM1), Guard: f18.guardComm1 },
        COMM2: { ...orderChannels(f18.COMM2), Guard: f18.guardComm2 },
        mirror_COMM1: commRaw.mirror_COMM1 ?? false,
        mirror_COMM2: commRaw.mirror_COMM2 ?? false,
      },
      name: flight.name,
      TCN: f18.TCN,
      terrain: state.theater,
      type: 'FA-18C_hornet',
      // For standalone DTC flights (no mission loaded), preserve the original WYPT
      // block from the personal DTC, merging in any UI-edited NAV_SETTINGS.
      WYPT: (flight._standalone && navPts.length === 0 && personalDtc?._rawWypt)
        ? { ...personalDtc._rawWypt, NAV_SETTINGS: f18.NAV_SETTINGS }
        : {
          mirror_NAV_PTS: false,
          NAV_PTS: navPts,
          NAV_ROUTE: [[], [], []],
          NAV_SETTINGS: f18.NAV_SETTINGS,
          terrain: state.theater,
        },
    },
    name: flight.name,
    type: 'FA-18C_hornet',
  };
}
