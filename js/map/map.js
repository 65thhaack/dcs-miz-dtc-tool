// js/map/map.js
import { state } from '../state.js';
import { dcsToLatLon, latDms, lonDms, latDecimalMinutes, lonDecimalMinutes } from '../coords.js';
import { allFlights } from '../utils.js';
import { previewDtc } from '../ui/preview.js';
import { buildDtcNative } from '../dtc/builder-f16.js';
import { buildF18DtcNative } from '../dtc/builder-f18.js';

// ── Module-scoped map state ──────────────────────────────────────────────────
let _leafletMap = null;
let _leafletLayerGroup = null;
let _leafletTileLayer = null;
let _mapFlightLayers = [];  // [{ flight, polyline, markers, color, legendEl }]
let _selectedMapIdx = -1;
let _mapCurrentFlight = null;
let _mapCurrentFamily = null;

const MAP_COLORS = [
  '#58a6ff','#3fb950','#f0883e','#bc8cff','#67e8f9',
  '#fbbf24','#fb7185','#a3e635','#34d399','#e879f9',
];

const MAP_TILES = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    opts: { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 },
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    opts: { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd', maxZoom: 19 },
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    opts: { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://opentopomap.org">OpenTopoMap</a>', maxZoom: 17 },
  },
};

// ── Public state accessor ────────────────────────────────────────────────────
export function getMapState() {
  return { flight: _mapCurrentFlight, family: _mapCurrentFamily };
}

// ── Internal helpers ─────────────────────────────────────────────────────────
function resetMapState() {
  _leafletLayerGroup.clearLayers();
  _mapFlightLayers = [];
  _selectedMapIdx = -1;
}

function fitMapToLatLngs(latlngs) {
  setTimeout(() => {
    _leafletMap.invalidateSize();
    if (latlngs.length > 1) {
      _leafletMap.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50] });
    } else if (latlngs.length === 1) {
      _leafletMap.setView(latlngs[0], 10);
    }
  }, 60);
}

function getFlightMissionMapPoints(flight) {
  return flight.waypoints.map((wp, idx) => ({
    idx,
    lat: wp.lat,
    lon: wp.lon,
    label: wp.isTakeoff ? 'T' : wp.isLand ? 'L' : String(wp.seq),
    title: wp.isTakeoff ? 'Takeoff' : wp.isLand ? 'Landing' : `Mission STPT ${wp.seq}`,
    name: wp.name || '',
    alt_ft: wp.alt_ft,
    alt_type: wp.alt_type,
    speed_kts: wp.speed_kts,
    role: wp.pointType || 'STPT',
    kind: wp.isTakeoff ? 'takeoff' : wp.isLand ? 'landing' : 'nav',
  }));
}

function getFlightDtcMapPoints(family, flight) {
  if (family === 'f18') {
    const navPts = buildF18DtcNative(flight).data?.WYPT?.NAV_PTS || [];
    return navPts.map((pt, idx) => {
      const { lat, lon } = dcsToLatLon(pt.x || 0, pt.y || 0, state.theater);
      return {
        idx,
        lat,
        lon,
        label: String(pt.wypt_num || idx + 1),
        title: `DTC STPT ${pt.wypt_num || idx + 1}`,
        name: pt.text_note || pt.note || '',
        alt_ft: Math.round((pt.alt || 0) * 3.28084),
        alt_type: 'BARO',
        speed_kts: 0,
        role: 'STPT',
      };
    });
  }

  const navPts = buildDtcNative(flight).data?.MPD?.NAV_PTS || [];
  return navPts.map((pt, idx) => {
    const { lat, lon } = dcsToLatLon(pt.x || 0, pt.y || 0, state.theater);
    return {
      idx,
      lat,
      lon,
      label: String(pt.number || idx + 1),
      title: `DTC STPT ${pt.number || idx + 1}`,
      name: pt.note || '',
      alt_ft: Math.round(pt.routeAltitude || 0),
      alt_type: 'BARO',
      speed_kts: 0,
      role: pt.type || 'STPT',
    };
  });
}

function buildMapPopupHtml(color, header, point, formatLatitude, formatLongitude) {
  return `<div style="font-family:-apple-system,sans-serif;font-size:12px;line-height:1.7;min-width:170px">
    <b style="color:${color};font-size:13px">${header}</b>
    <br><span style="color:#aaa">${point.title}</span>
    ${point.name ? `<br>${point.name}` : ''}
    ${point.role ? `<br><span style="color:#888">${point.role}</span>` : ''}
    <br>${formatLatitude(point.lat)}<br>${formatLongitude(point.lon)}
    <br>${point.alt_ft.toLocaleString()} ft <span style="color:#888;font-size:10px">${point.alt_type}</span>
    ${point.speed_kts ? `<br>${point.speed_kts} kts` : ''}
  </div>`;
}

function selectMapFlight(fi) {
  _selectedMapIdx = fi;
  const none = fi === -1;
  _mapFlightLayers.forEach((layer, i) => {
    const active = none || i === fi;
    layer.polyline.setStyle({
      weight:  active ? 3.5 : 1.5,
      opacity: active ? 1   : 0.2,
    });
    layer.markers.forEach(m => {
      const el = m.getElement();
      if (el) el.style.opacity = active ? '1' : '0.2';
    });
    layer.legendEl.style.background = i === fi ? 'rgba(255,255,255,0.08)' : '';
    layer.legendEl.style.fontWeight  = i === fi ? '700' : '';
  });
}

// ── Exported functions ───────────────────────────────────────────────────────
export function ensureLeafletMap() {
  if (_leafletMap) return;

  const modal = document.getElementById('map-modal');
  _leafletMap = L.map('map-el', { zoomControl: true });
  setMapTile('dark');
  _leafletLayerGroup = L.layerGroup().addTo(_leafletMap);
  modal.querySelector('.map-modal-overlay').addEventListener('click', function(e) {
    if (e.target === this) closeFlightMap();
  });
  _leafletMap.on('click', () => selectMapFlight(-1));
}

export function openMapModal(title, hint) {
  ensureLeafletMap();
  document.getElementById('map-title').textContent = title;
  document.getElementById('map-hint').textContent = hint;
  document.getElementById('map-modal').style.display = 'flex';
  resetMapState();
}

export function showPreviewFlightMap(family, groupId) {
  const flights = family === 'f18' ? state.f18Flights : state.f16Flights;
  const flight = flights.find(f => String(f.groupId) === String(groupId));
  if (!flight) return;

  const isF18 = family === 'f18';
  const formatLatitude = isF18 ? latDms : latDecimalMinutes;
  const formatLongitude = isF18 ? lonDms : lonDecimalMinutes;
  const missionPoints = getFlightMissionMapPoints(flight);
  const dtcPoints = getFlightDtcMapPoints(family, flight);
  const allLatlngs = [
    ...missionPoints.map(point => [point.lat, point.lon]),
    ...dtcPoints.map(point => [point.lat, point.lon]),
  ];

  if (!allLatlngs.length) return;

  _mapCurrentFlight = flight;
  _mapCurrentFamily = family;

  openMapModal(`${flight.name} — Mission vs DTC`, 'Blue dashed = mission route · Amber = DTC steerpoints');

  const navWps = flight.waypoints
    .map((wp, originalIdx) => ({ wp, originalIdx }))
    .filter(({ wp }) => !wp.isTakeoff && !wp.isLand);

  const legend = document.getElementById('map-legend');
  legend.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:5px;font-size:11px">
        <span style="width:10px;height:10px;border-radius:50%;border:2px solid #58a6ff;flex-shrink:0"></span>Mission
      </div>
      <div style="display:flex;align-items:center;gap:5px;font-size:11px">
        <span style="width:10px;height:10px;border-radius:50%;background:#fbbf24;flex-shrink:0"></span>DTC
      </div>
    </div>
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:6px">Steerpoints</div>
    ${navWps.length ? navWps.map(({ wp, originalIdx }, i) => `
    <div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">
      <button class="wp-del-btn" type="button" title="Remove" data-idx="${originalIdx}" data-action="remove-waypoint-from-map">🗑</button>
      <span style="color:var(--muted);font-size:11px;width:18px;flex-shrink:0">${i + 1}</span>
      <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${wp.name || '<span style="color:var(--muted)">—</span>'}</span>
      <span style="font-size:10px;color:var(--muted);flex-shrink:0">${wp.alt_ft.toLocaleString()}ft</span>
    </div>`).join('') : '<div style="font-size:12px;color:var(--muted)">No steerpoints</div>'}`;

  const missionLatlngs = missionPoints.map(point => [point.lat, point.lon]);
  if (missionLatlngs.length > 1) {
    L.polyline(missionLatlngs, {
      color: '#58a6ff',
      weight: 2.5,
      opacity: 0.8,
      dashArray: '6,4',
    }).addTo(_leafletLayerGroup);
  }

  missionPoints.forEach(point => {
    const borderStyle = point.kind === 'nav'
      ? '2px solid #58a6ff'
      : '2px dashed rgba(88,166,255,0.95)';
    const marker = L.marker([point.lat, point.lon], {
      icon: L.divIcon({
        html: `<div style="width:22px;height:22px;border-radius:50%;background:rgba(13,17,23,0.92);border:${borderStyle};display:flex;align-items:center;justify-content:center;color:#58a6ff;font-size:10px;font-weight:800;font-family:-apple-system,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,0.7)">${point.label}</div>`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -13],
      }),
    }).bindPopup(buildMapPopupHtml('#58a6ff', `${flight.name} · Mission`, point, formatLatitude, formatLongitude), { maxWidth: 260 });
    marker.addTo(_leafletLayerGroup);
  });

  const dtcLatlngs = dtcPoints.map(point => [point.lat, point.lon]);
  if (dtcLatlngs.length > 1) {
    L.polyline(dtcLatlngs, {
      color: '#fbbf24',
      weight: 3.5,
      opacity: 0.95,
    }).addTo(_leafletLayerGroup);
  }

  dtcPoints.forEach(point => {
    const marker = L.marker([point.lat, point.lon], {
      icon: L.divIcon({
        html: `<div style="width:18px;height:18px;border-radius:50%;background:#fbbf24;border:2px solid rgba(255,255,255,0.92);display:flex;align-items:center;justify-content:center;color:#0d1117;font-size:9px;font-weight:800;font-family:-apple-system,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,0.7)">${point.label}</div>`,
        className: '',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
        popupAnchor: [0, -12],
      }),
    }).bindPopup(buildMapPopupHtml('#fbbf24', `${flight.name} · DTC`, point, formatLatitude, formatLongitude), { maxWidth: 260 });
    marker.addTo(_leafletLayerGroup);
  });

  fitMapToLatLngs(allLatlngs);
}

export function showAllFlightsMap() {
  const flights = allFlights();
  if (!flights.length) return;

  openMapModal('All Flights — Route Map', 'Click a route or legend row to highlight a single flight.');

  const legend = document.getElementById('map-legend');
  legend.innerHTML = '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px">Flights</div>';

  const allLatlngs = [];

  flights.forEach((flight, fi) => {
    const color = MAP_COLORS[fi % MAP_COLORS.length];
    const isF18 = flight.aircraftType === 'FA-18C_hornet';
    const fmtLat = isF18 ? latDms : latDecimalMinutes;
    const fmtLon = isF18 ? lonDms : lonDecimalMinutes;

    const latlngs = flight.waypoints.map(wp => [wp.lat, wp.lon]);
    allLatlngs.push(...latlngs);

    const polyline = L.polyline(latlngs, { color, weight: 2.5, opacity: 0.85, dashArray: '6,4' })
      .addTo(_leafletLayerGroup);

    const markers = [];
    flight.waypoints.forEach(wp => {
      const label = wp.isTakeoff ? 'T' : wp.isLand ? 'L' : String(wp.seq);
      const borderStyle = wp.isTakeoff || wp.isLand
        ? '2px dashed rgba(255,255,255,0.7)'
        : '2px solid rgba(255,255,255,0.85)';
      const icon = L.divIcon({
        html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:${borderStyle};display:flex;align-items:center;justify-content:center;color:#0d1117;font-size:10px;font-weight:800;font-family:-apple-system,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,0.7)">${label}</div>`,
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -13],
      });
      const popupHtml = `<div style="font-family:-apple-system,sans-serif;font-size:12px;line-height:1.7;min-width:160px">
        <b style="color:${color};font-size:13px">${flight.name}</b>
        <br><span style="color:#aaa">${wp.isTakeoff ? 'Takeoff' : wp.isLand ? 'Landing' : `STPT ${wp.seq}`}</span>
        ${wp.name ? `<br>${wp.name}` : ''}
        <br>${fmtLat(wp.lat)}<br>${fmtLon(wp.lon)}
        <br>${wp.alt_ft.toLocaleString()} ft <span style="color:#888;font-size:10px">${wp.alt_type}</span>
        ${wp.speed_kts ? `<br>${wp.speed_kts} kts` : ''}
      </div>`;
      const marker = L.marker([wp.lat, wp.lon], { icon })
        .bindPopup(popupHtml, { maxWidth: 260 })
        .addTo(_leafletLayerGroup);
      markers.push(marker);
    });

    // Click any element of this flight → select it
    const onClick = (e) => { L.DomEvent.stopPropagation(e); selectMapFlight(fi); };
    polyline.on('click', onClick);
    markers.forEach(m => m.on('click', onClick));

    // Legend row
    const legendEl = document.createElement('div');
    legendEl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:5px;cursor:pointer;font-size:12px;transition:background .12s';
    legendEl.innerHTML = `<span style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0;box-shadow:0 0 4px ${color}88"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${flight.name}</span><span style="margin-left:auto;font-size:10px;color:var(--muted);flex-shrink:0">${isF18 ? 'F-18' : 'F-16'}</span>`;
    legendEl.title = flight.name;
    legendEl.addEventListener('click', () => selectMapFlight(fi === _selectedMapIdx ? -1 : fi));
    legend.appendChild(legendEl);

    _mapFlightLayers.push({ flight, polyline, markers, color, legendEl });
  });

  fitMapToLatLngs(allLatlngs);
}

export function setMapTile(name) {
  if (!_leafletMap || !MAP_TILES[name]) return;
  if (_leafletTileLayer) _leafletMap.removeLayer(_leafletTileLayer);
  const { url, opts } = MAP_TILES[name];
  _leafletTileLayer = L.tileLayer(url, opts).addTo(_leafletMap);
  _leafletTileLayer.bringToBack();
  ['dark','light','terrain'].forEach(n => {
    const btn = document.getElementById('map-tile-' + n);
    if (!btn) return;
    if (n === name) { btn.classList.remove('btn-outline'); }
    else { btn.classList.add('btn-outline'); }
  });
}

export function closeFlightMap() {
  document.getElementById('map-modal').style.display = 'none';
}

export function removeWaypointFromMap(btn) {
  const flight = _mapCurrentFlight;
  const family = _mapCurrentFamily;
  const idx = parseInt(btn.dataset.idx, 10);
  if (!flight || !Number.isInteger(idx) || idx < 0 || idx >= flight.waypoints.length) return;
  flight.waypoints.splice(idx, 1);
  let seq = 0;
  for (const wp of flight.waypoints) {
    if (!wp.isTakeoff && !wp.isLand) wp.seq = ++seq;
  }
  // Re-render the preview panel if it's open
  const previewEl = document.getElementById(`inline-preview-${family}-${flight.groupId}`);
  if (previewEl?.classList.contains('open')) {
    flight.inlinePreviewTab = 'wpt';
    previewDtc(family, flight.groupId);
  }
  // Redraw the map
  showPreviewFlightMap(family, flight.groupId);
}
