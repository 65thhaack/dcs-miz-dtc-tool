import { state } from '../state.js';
import { downloadBlob, sanitizeFilename } from '../utils.js';
import { ensureKneeboardDraft, restoreKneeboardDraft } from './model.js';
import { previewDtc } from '../ui/preview.js';

function pickFlight(family, groupId) {
  const flights = family === 'f18' ? state.f18Flights : state.f16Flights;
  return flights.find(f => String(f.groupId) === String(groupId));
}

function drawTable(ctx, x, y, colWidths, rowHeight, headers, rows, maxRows = 8) {
  const width = colWidths.reduce((a, b) => a + b, 0);
  ctx.strokeStyle = '#4a3f29';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, rowHeight * (Math.min(rows.length, maxRows) + 1));

  let cx = x;
  for (const w of colWidths.slice(0, -1)) {
    cx += w;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + rowHeight * (Math.min(rows.length, maxRows) + 1));
    ctx.stroke();
  }

  ctx.fillStyle = '#2b2417';
  ctx.fillRect(x, y, width, rowHeight);
  ctx.fillStyle = '#f3ead4';
  ctx.font = 'bold 16px Georgia';
  headers.forEach((h, i) => {
    const tx = x + colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 8;
    ctx.fillText(h, tx, y + 20);
  });

  ctx.fillStyle = '#2b2417';
  ctx.font = '15px Courier New';
  rows.slice(0, maxRows).forEach((row, r) => {
    const ry = y + rowHeight * (r + 1);
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + width, ry);
    ctx.stroke();
    row.forEach((v, c) => {
      const tx = x + colWidths.slice(0, c).reduce((a, b) => a + b, 0) + 8;
      ctx.fillText(String(v ?? ''), tx, ry + 20);
    });
  });

  return y + rowHeight * (Math.min(rows.length, maxRows) + 1);
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function lonToWorldX(lon, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  return ((lon + 180) / 360) * scale;
}

function latToWorldY(lat, zoom) {
  const scale = 256 * Math.pow(2, zoom);
  const rad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  const merc = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (0.5 - merc / (2 * Math.PI)) * scale;
}

function pickTileZoom(lats, lons, widthPx, heightPx) {
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  for (let z = 12; z >= 3; z--) {
    const w = Math.abs(lonToWorldX(maxLon, z) - lonToWorldX(minLon, z)) || 1;
    const h = Math.abs(latToWorldY(minLat, z) - latToWorldY(maxLat, z)) || 1;
    if (w <= widthPx * 0.75 && h <= heightPx * 0.75) return z;
  }
  return 3;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function buildGeoViewport(waypoints, innerW, innerH) {
  const geoWps = waypoints.filter(w => Number.isFinite(w.lat) && Number.isFinite(w.lon));
  if (geoWps.length !== waypoints.length || !geoWps.length) return null;

  const lats = geoWps.map(w => w.lat);
  const lons = geoWps.map(w => w.lon);
  const zoom = pickTileZoom(lats, lons, innerW, innerH);
  const worldX = geoWps.map(w => lonToWorldX(w.lon, zoom));
  const worldY = geoWps.map(w => latToWorldY(w.lat, zoom));
  const minX = Math.min(...worldX);
  const maxX = Math.max(...worldX);
  const minY = Math.min(...worldY);
  const maxY = Math.max(...worldY);
  const rawW = Math.max(1, maxX - minX);
  const rawH = Math.max(1, maxY - minY);

  // Match preview-style fit padding so route markers do not clip against edges.
  const padFrac = 0.14;
  const dataW = rawW * (1 + padFrac * 2);
  const dataH = rawH * (1 + padFrac * 2);

  const scale = Math.min(innerW / dataW, innerH / dataH);
  const viewW = innerW / scale;
  const viewH = innerH / scale;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const left = cx - viewW / 2;
  const top = cy - viewH / 2;

  return {
    zoom,
    left,
    top,
    scale,
    viewW,
    viewH,
    project: (w, innerX, innerY) => ({
      x: innerX + (lonToWorldX(w.lon, zoom) - left) * scale,
      y: innerY + (latToWorldY(w.lat, zoom) - top) * scale,
    }),
  };
}

function buildXYProject(waypoints, innerX, innerY, innerW, innerH) {
  const xs = waypoints.map(w => w.x);
  const ys = waypoints.map(w => w.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const dataW = Math.max(1, maxX - minX);
  const dataH = Math.max(1, maxY - minY);
  const scale = Math.min(innerW / dataW, innerH / dataH);
  const offsetX = innerX + (innerW - dataW * scale) / 2 - minX * scale;
  const offsetY = innerY + (innerH - dataH * scale) / 2 + maxY * scale;
  return (w) => ({
    x: offsetX + w.x * scale,
    y: offsetY - w.y * scale,
  });
}

async function drawBasemapTiles(ctx, innerX, innerY, viewport) {
  const { zoom, left, top, scale, viewW, viewH } = viewport;

  const tiles = [];
  const n = Math.pow(2, zoom);
  const tileMinX = Math.floor(left / 256);
  const tileMaxX = Math.floor((left + viewW) / 256);
  const tileMinY = Math.floor(top / 256);
  const tileMaxY = Math.floor((top + viewH) / 256);
  const subs = ['a', 'b', 'c', 'd'];

  for (let ty = tileMinY; ty <= tileMaxY; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = tileMinX; tx <= tileMaxX; tx++) {
      const wrappedTx = ((tx % n) + n) % n;
      const sub = subs[Math.abs(tx + ty) % subs.length];
      const url = `https://${sub}.basemaps.cartocdn.com/light_all/${zoom}/${wrappedTx}/${ty}.png`;
      tiles.push({ tx, ty, url });
    }
  }

  let loaded = 0;
  await Promise.all(tiles.map(async t => {
    try {
      const img = await loadImage(t.url);
      const tileWorldX = t.tx * 256;
      const tileWorldY = t.ty * 256;
      const dx = innerX + (tileWorldX - left) * scale;
      const dy = innerY + (tileWorldY - top) * scale;
      const ds = 256 * scale;
      ctx.drawImage(img, dx, dy, ds, ds);
      loaded += 1;
    } catch {
      // Ignore individual tile failures.
    }
  }));

  return loaded > 0;
}

async function drawRouteMap(ctx, x, y, width, height, waypoints) {
  ctx.fillStyle = '#efe2c2';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#4a3f29';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = '#4a3f29';
  ctx.font = 'bold 14px Georgia';
  ctx.fillText('ROUTE MAP', x + 10, y + 18);
  if (!waypoints.length) {
    ctx.font = '12px Georgia';
    ctx.fillText('No route points', x + 10, y + 40);
    return;
  }

  const plotY = y + 24;
  const plotH = height - 24;
  const margin = 10;
  const innerX = x + margin;
  const innerY = plotY + margin;
  const innerW = width - margin * 2;
  const innerH = plotH - margin * 2;

  const viewport = buildGeoViewport(waypoints, innerW, innerH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(innerX, innerY, innerW, innerH);
  ctx.clip();

  const tileDrawn = viewport ? await drawBasemapTiles(ctx, innerX, innerY, viewport) : false;
  if (!tileDrawn) {
    const terrainGrad = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY + innerH);
    terrainGrad.addColorStop(0, '#e7d7ad');
    terrainGrad.addColorStop(0.5, '#d8c793');
    terrainGrad.addColorStop(1, '#cdbd86');
    ctx.fillStyle = terrainGrad;
    ctx.fillRect(innerX, innerY, innerW, innerH);
    ctx.strokeStyle = 'rgba(88,74,44,0.22)';
    ctx.lineWidth = 1;
    for (let gy = 1; gy < 8; gy++) {
      const baseY = innerY + (innerH / 8) * gy;
      ctx.beginPath();
      for (let t = 0; t <= 1; t += 0.05) {
        const wave = Math.sin((t * Math.PI * 3) + gy * 0.8) * 4;
        const wx = innerX + (innerW * t);
        const wy = baseY + wave;
        if (t === 0) ctx.moveTo(wx, wy);
        else ctx.lineTo(wx, wy);
      }
      ctx.stroke();
    }
  }

  const project = viewport
    ? (w) => viewport.project(w, innerX, innerY)
    : buildXYProject(waypoints, innerX, innerY, innerW, innerH);

  ctx.strokeStyle = '#264c73';
  ctx.lineWidth = 3;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = project(waypoints[i]);
    const p2 = project(waypoints[i + 1]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  waypoints.forEach((wp, idx) => {
    const p = project(wp);
    const markerX = p.x;
    const markerY = p.y;
    const color = idx === 0 ? '#3cb043' : idx === waypoints.length - 1 ? '#d91a3a' : '#5a7a9c';
    ctx.fillStyle = 'rgba(245,236,214,0.92)';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 12px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(String(idx + 1), markerX, markerY + 4);
  });

  ctx.restore();
  ctx.strokeStyle = 'rgba(68,96,84,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + width - 60, y + 30);
  ctx.lineTo(x + width - 60, y + 54);
  ctx.stroke();
  ctx.fillStyle = '#2f3f35';
  ctx.font = 'bold 10px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('N', x + width - 60, y + 26);
  ctx.textAlign = 'left';
}

function assetCommDisplay(asset) {
  if (Number.isFinite(asset?.frequency) && asset.frequency > 0) {
    return String(asset.frequency);
  }
  const comm = asset?.primaryComm;
  if (!comm || !Number.isFinite(comm.freq)) return '—';
  return comm.freq.toFixed(3);
}

async function buildKneeboardPngBlob(flight, family) {
  const kb = ensureKneeboardDraft(flight);
  const canvas = document.createElement('canvas');
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#efe2c2';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#d8c69f';
  ctx.fillRect(40, 40, canvas.width - 80, canvas.height - 80);
  ctx.strokeStyle = '#7c6943';
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);

  ctx.fillStyle = '#2b2417';
  ctx.font = 'bold 42px Georgia';
  ctx.fillText(`${flight.name || 'Flight'}  ${family === 'f18' ? 'F/A-18C' : 'F-16C'}`, 70, 110);
  ctx.font = '20px Georgia';
  ctx.fillText(`DATE ${kb.missionDate || ''}   TIME ${kb.missionTimeZulu || ''}   TYPE ${kb.missionType || ''}`, 70, 145);
  ctx.fillText(`WX ${kb.weather || ''}`, 70, 175);

  let y = 208;

  // Payload / loadout summary line (wrapping)
  ctx.fillStyle = '#2b2417';
  ctx.fillRect(70, y, 980, 30);
  ctx.fillStyle = '#f3ead4';
  ctx.font = 'bold 15px Georgia';
  ctx.fillText('PAYLOAD', 80, y + 20);
  ctx.strokeStyle = '#4a3f29';
  ctx.lineWidth = 1;
  ctx.strokeRect(70, y + 30, 980, 64);
  ctx.fillStyle = '#2b2417';
  ctx.font = '13px Courier New';
  const payloadLines = wrapText(ctx, flight.payloadSummary || '—', 960).slice(0, 2);
  payloadLines.forEach((line, i) => {
    ctx.fillText(line, 80, y + 50 + (i * 18));
  });
  y += 108;

  const unitRows = (flight.units || []).map((u, i) => [
    kb.unitTailNumbers?.[i] || u.tailNumber || '',
    u.name || '',
    kb.unitCallsigns?.[i] || u.callsign || '',
    kb.unitDatalinkCodes?.[i] || '',
    kb.unitLaserCodes?.[i] || '',
  ]);
  y = drawTable(ctx, 70, y, [72, 312, 252, 92, 92], 32, ['TAIL #', 'AIRCREW', 'CALLSIGN', 'DLINK', 'LASER'], unitRows, 4) + 18;

  const navWps = (flight.waypoints || [])
    .filter(w => !w.isTakeoff && !w.isLand)
    .slice(0, 10);
  const wptRows = navWps.map((w, idx) => {
    const originalIdx = flight.waypoints.indexOf(w);
    const routeData = kb.routeData?.[originalIdx] || { tot: '', push: '', remarks: '' };
    return [
      idx + 1,
      (w.name || `WP${w.seq}`).slice(0, 14),
      w.alt_ft,
      w.speed_kts || '—',
      routeData.tot || '',
      routeData.push || '',
      String(routeData.remarks || '').slice(0, 44),
    ];
  });

  y = drawTable(ctx, 70, y, [45, 165, 85, 75, 75, 75, 460], 28, ['#', 'WAYPOINT', 'ALT', 'CAS', 'TOT', 'PUSH', 'RMK'], wptRows, 10) + 18;

  const allAssets = (state.assets || []).filter(a => a);
  const assetRows = allAssets.slice(0, 6).map(a => [
    (a.type || '').slice(0, 6),
    (a.callsign || a.name || '').slice(0, 14),
    a.tacan ? `${a.tacan.channel}${a.tacan.modeChannel}` : '—',
    assetCommDisplay(a),
    a.alt_ft > 0 ? String(a.alt_ft) : '—'
  ]);
  let assetBottom = y;
  if (assetRows.length > 0) {
    assetBottom = drawTable(ctx, 70, y, [100, 220, 100, 160, 100], 28, ['TYPE', 'CALLSIGN', 'TACAN', 'FREQ', 'ALT'], assetRows, 6);
  }
  y = assetBottom + 16;

  const routeMapWidth = 980;
  // Match the preview feel: use a much taller map frame than the old 190px export box.
  const routeMapHeight = Math.round(routeMapWidth / 3.25);
  await drawRouteMap(ctx, 70, y, routeMapWidth, routeMapHeight, navWps);

  y += routeMapHeight + 14;

  ctx.fillStyle = '#2b2417';
  ctx.fillRect(70, y, 980, 38);
  ctx.fillStyle = '#f3ead4';
  ctx.font = 'bold 16px Georgia';
  ctx.fillText('NOTES', 80, y + 25);
  ctx.strokeStyle = '#4a3f29';
  ctx.strokeRect(70, y + 38, 980, 200);

  ctx.fillStyle = '#2b2417';
  ctx.font = '16px Courier New';
  const lines = wrapText(ctx, kb.notes || '', 960).slice(0, 9);
  lines.forEach((line, i) => {
    ctx.fillText(line, 80, y + 65 + (i * 20));
  });

  ctx.font = '14px Georgia';
  ctx.fillText(`Fuel: T/O ${kb.fuelTakeoff || '-'}  Joker ${kb.fuelJoker || '-'}  Bingo ${kb.fuelBingo || '-'}`, 70, 1690);

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return blob;
}

export async function exportFlightKneeboard(family, groupId, overrideName) {
  const flight = pickFlight(family, groupId);
  if (!flight) return;

  ensureKneeboardDraft(flight);
  const cardPrefix = family === 'f18' ? 'f18' : 'f16';
  const panel = document.getElementById(`inline-preview-${cardPrefix}-${groupId}`);
  const nameInput = panel?.querySelector('.export-name-inp');
  const rawName = overrideName ?? nameInput?.value ?? flight.name ?? 'flight';
  const base = sanitizeFilename(rawName, 'flight');

  const blob = await buildKneeboardPngBlob(flight, family);
  if (!blob) {
    alert('Could not generate kneeboard PNG.');
    return;
  }
  downloadBlob(blob, `${base}-kneeboard.png`);
}

export function exportFlightKneeboardButton(btn) {
  exportFlightKneeboard(btn.dataset.family, btn.dataset.gid);
}

export function restoreKneeboardForFlight(family, groupId) {
  const flight = pickFlight(family, groupId);
  if (!flight) return;
  restoreKneeboardDraft(flight);
  flight.inlinePreviewTab = 'kb';
  previewDtc(family, groupId);
}
