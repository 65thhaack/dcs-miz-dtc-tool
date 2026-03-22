// js/dtc/normalize.js
import { isF16Type, isF18Type } from '../miz/extractor.js';

// Stores raw blocks for lossless re-export.
export function normalizeDtc(raw) {
  if (!raw.data?.COMM) return null; // unrecognized format

  const isF18 = isF18Type(raw.type || '');

  if (isF18) {
    const out = {
      Aircraft: raw.type || 'FA-18C_hornet',
      _native: true,
      _aircraft: 'F18',
      _rawAlr67: raw.data.ALR67 || null,
      _rawTcn: Array.isArray(raw.data.TCN) ? raw.data.TCN : [],
      _rawWypt: raw.data.WYPT || null,
      _f18Comm: raw.data.COMM || null,
    };

    const uhfCh = {}, vhfCh = {};
    const comm1 = raw.data.COMM.COMM1 || {};
    const comm2 = raw.data.COMM.COMM2 || {};
    for (let i = 1; i <= 20; i++) {
      const u = comm1[`Channel_${i}`];
      const v = comm2[`Channel_${i}`];
      if (u) uhfCh[String(i)] = { Frequency: u.frequency, Name: u.name || '' };
      if (v) vhfCh[String(i)] = { Frequency: v.frequency, Name: v.name || '' };
    }
    out.Radio = { UHF: { Channels: uhfCh }, VHF: { Channels: vhfCh } };

    return out;
  }

  const out = {
    Aircraft:  raw.type || 'F-16C_50',
    _native:   true,
    _aircraft: 'F16',
    _rawElint: raw.data.ELINT || null,   // passthrough for export
    _rawMpd:   raw.data.MPD   || null,   // passthrough for export
  };

  // Radio — Channel_N keys → internal Channels dict (freq is already MHz)
  const uhfCh = {}, vhfCh = {};
  const comm1 = raw.data.COMM.COMM1 || {};
  const comm2 = raw.data.COMM.COMM2 || {};
  for (let i = 1; i <= 20; i++) {
    const u = comm1[`Channel_${i}`];
    const v = comm2[`Channel_${i}`];
    if (u) uhfCh[String(i)] = { Frequency: u.freq, Name: '' };
    if (v) vhfCh[String(i)] = { Frequency: v.freq, Name: '' };
  }
  out.Radio = { UHF: { Channels: uhfCh }, VHF: { Channels: vhfCh } };

  // CMDS — store native programs for display; raw block passes through to export
  const cmdsRaw = raw.data.MPD?.CMDS;
  if (cmdsRaw) {
    out.Countermeasures = {
      _nativePrograms:  cmdsRaw.CMDSProgramSettings || {},
      _nativeBingo:     cmdsRaw.CMDSBingoSettings   || {},
      _nativeThreatMap: cmdsRaw.CMDSPrograms         || {},
    };
  }

  // RWR — keep raw structure for display
  const rwrRaw = raw.data.ELINT?.RWR;
  if (rwrRaw) {
    out.EWS = { RWR: rwrRaw };
  }

  // Navigation — extract steerpoints from DTC if present
  if (raw.data?.NAV?.Steerpoints && Array.isArray(raw.data.NAV.Steerpoints)) {
    out.Navigation = {
      Steerpoints: raw.data.NAV.Steerpoints.map(pt => ({
        id: pt.ID || 0,
        name: pt.Name || '',
        x: pt.X || 0,
        y: pt.Y || 0,
        alt_m: pt.Alt || 0,
        alt_ft: Math.round((pt.Alt || 0) * 3.28084),
      }))
    };
  }

  return out;
}
