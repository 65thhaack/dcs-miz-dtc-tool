// ═══════════════════════════════════════════════════════════════════════════
//  Coordinate conversion utilities
//  DCS uses flat-earth X (northing) / Y (easting) in meters per theater.
//  Origins derived from known airbase positions (flat-earth approximation).
// ═══════════════════════════════════════════════════════════════════════════
export const THEATER_ORIGINS = {
  Caucasus:       { lat: 44.714, lon:  33.732 },
  Nevada:         { lat: 36.000, lon: -116.467 },
  PersianGulf:    { lat: 26.150, lon:  56.260 },  // calibrated vs Al Minhad & Al Dhafra
  Syria:          { lat: 36.000, lon:  33.000 },
  MarianaIslands: { lat: 21.500, lon: 145.000 },
  Sinai:          { lat: 29.000, lon:  32.000 },
  Kola:           { lat: 67.000, lon:  28.000 },
  // --- calibrated from .miz airdrome positions ---
  Afghanistan:    { lat: 33.864, lon:  66.255 },  // calibrated vs Herat (OAHR) & Kabul (OAKB)
  Normandy:       { lat: 49.559, lon:  -0.888 },  // calibrated vs Swingate Chain Home radar (<100m error)
  Normandy2:      { lat: 49.559, lon:  -0.888 },  // alias for Normandy 2.0
  TheChannel:     { lat: 50.875, lon:   1.588 },  // calibrated vs Manston Airport (EGMH, <1km error)
  Falklands:      { lat: -48.937, lon: -50.078 }, // calibrated vs Mount Pleasant Airport (MPA)
  SouthAtlantic:  { lat: -48.937, lon: -50.078 }, // alias for Falklands
};

export function dcsToLatLon(x, y, theater) {
  const o = THEATER_ORIGINS[theater];
  if (!o) {
    console.warn(`[coords] Unknown theater "${theater}" — coordinate conversion will be wrong. Add it to THEATER_ORIGINS.`);
    return dcsToLatLon(x, y, 'Caucasus');
  }
  const lat = o.lat + x / 111320;
  const lon = o.lon + y / (111320 * Math.cos(lat * Math.PI / 180));
  return { lat, lon };
}

export function dms(deg, posDir, negDir) {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const mf = (abs - d) * 60;
  const m = Math.floor(mf);
  const s = ((mf - m) * 60).toFixed(1);
  const dir = deg >= 0 ? posDir : negDir;
  return `${dir}${String(d).padStart(2,'0')}°${String(m).padStart(2,'0')}'${s.padStart(4,'0')}"`;
}
export const latDms = (v) => dms(v, 'N', 'S');
export const lonDms = (v) => dms(v, 'E', 'W');

export function decimalMinutes(deg, posDir, negDir, degreeWidth) {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const minutes = ((abs - d) * 60).toFixed(3);
  const dir = deg >= 0 ? posDir : negDir;
  return `${dir}${String(d).padStart(degreeWidth, '0')}°${minutes.padStart(6, '0')}'`;
}
export const latDecimalMinutes = (v) => decimalMinutes(v, 'N', 'S', 2);
export const lonDecimalMinutes = (v) => decimalMinutes(v, 'E', 'W', 3);
