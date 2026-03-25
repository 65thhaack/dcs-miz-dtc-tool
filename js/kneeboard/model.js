import { deepClone } from '../utils.js';

function defaultLoadoutRows() {
  return Array.from({ length: 9 }, (_, i) => ({
    station: String(i + 1),
    type: '',
  }));
}

function defaultRouteData(flight) {
  const routeData = {};
  (flight?.waypoints || []).forEach((wp, idx) => {
    if (!wp?.isTakeoff && !wp?.isLand) {
      routeData[idx] = { tot: '', push: '', remarks: '' };
    }
  });
  return routeData;
}

function codePrefixForFlight(flight) {
  const type = String(flight?.aircraftType || '').toUpperCase();
  return type.includes('FA-18') || type.includes('F/A-18') || type.includes('F-18') ? '17' : '16';
}

function tailSuffix(tail, fallbackIdx) {
  const digits = String(tail || '').replace(/\D+/g, '');
  if (digits) return digits.slice(-2).padStart(2, '0');
  return String((fallbackIdx || 0) + 1).padStart(2, '0');
}

export function createKneeboardDraft(flight) {
  const missionDate = new Date().toISOString().slice(0, 10);
  const unitCallsigns = {};
  const unitTailNumbers = {};
  const unitDatalinkCodes = {};
  const unitLaserCodes = {};
  const prefix = codePrefixForFlight(flight);
  if (flight && Array.isArray(flight.units)) {
    flight.units.forEach((u, i) => {
      unitCallsigns[i] = u.callsign || '';
      unitTailNumbers[i] = u.tailNumber || '';
      const code = `${prefix}${tailSuffix(u.tailNumber, i)}`;
      unitDatalinkCodes[i] = code;
      unitLaserCodes[i] = code;
    });
  }
  return {
    missionDate,
    missionTot: '',
    missionTimeZulu: '',
    missionType: '',
    weather: '',
    packageName: '',
    laserCode: '',
    notes: '',
    fuelTakeoff: '',
    fuelJoker: '',
    fuelBingo: '',
    unitCallsigns,
    unitTailNumbers,
    unitDatalinkCodes,
    unitLaserCodes,
    routeData: defaultRouteData(flight),
    loadout: defaultLoadoutRows(),
    _baseLoadout: defaultLoadoutRows(),
    _createdAt: Date.now(),
    _flightName: flight?.name || 'Flight',
  };
}

export function ensureKneeboardDraft(flight) {
  if (!flight) return null;
  if (!flight.kneeboard) {
    flight.kneeboard = createKneeboardDraft(flight);
  }
  if (!Array.isArray(flight.kneeboard.loadout) || !flight.kneeboard.loadout.length) {
    flight.kneeboard.loadout = defaultLoadoutRows();
  }
  if (!flight.kneeboard.unitCallsigns || typeof flight.kneeboard.unitCallsigns !== 'object') {
    flight.kneeboard.unitCallsigns = {};
    (flight.units || []).forEach((u, i) => {
      flight.kneeboard.unitCallsigns[i] = u.callsign || '';
    });
  }
  if (!flight.kneeboard.unitTailNumbers || typeof flight.kneeboard.unitTailNumbers !== 'object') {
    flight.kneeboard.unitTailNumbers = {};
    (flight.units || []).forEach((u, i) => {
      flight.kneeboard.unitTailNumbers[i] = u.tailNumber || '';
    });
  }
  const prefix = codePrefixForFlight(flight);
  if (!flight.kneeboard.unitDatalinkCodes || typeof flight.kneeboard.unitDatalinkCodes !== 'object') {
    flight.kneeboard.unitDatalinkCodes = {};
  }
  if (!flight.kneeboard.unitLaserCodes || typeof flight.kneeboard.unitLaserCodes !== 'object') {
    flight.kneeboard.unitLaserCodes = {};
  }
  (flight.units || []).forEach((u, i) => {
    const defaultCode = `${prefix}${tailSuffix(flight.kneeboard.unitTailNumbers?.[i] || u.tailNumber, i)}`;
    if (!flight.kneeboard.unitDatalinkCodes[i]) flight.kneeboard.unitDatalinkCodes[i] = defaultCode;
    if (!flight.kneeboard.unitLaserCodes[i]) flight.kneeboard.unitLaserCodes[i] = defaultCode;
  });
  if (!flight.kneeboard.routeData || typeof flight.kneeboard.routeData !== 'object') {
    flight.kneeboard.routeData = defaultRouteData(flight);
  }
  (flight.waypoints || []).forEach((wp, idx) => {
    if (wp?.isTakeoff || wp?.isLand) return;
    if (!flight.kneeboard.routeData[idx] || typeof flight.kneeboard.routeData[idx] !== 'object') {
      flight.kneeboard.routeData[idx] = { tot: '', push: '', remarks: '' };
    }
  });
  return flight.kneeboard;
}

export function restoreKneeboardDraft(flight) {
  if (!flight) return;
  const fresh = createKneeboardDraft(flight);
  flight.kneeboard = deepClone(fresh);
}
