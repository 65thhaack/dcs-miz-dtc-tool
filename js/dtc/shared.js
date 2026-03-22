/**
 * Shared comm and DTC utilities
 */

export function ensureFlightCommNames(flight) {
  if (!flight.commNames || typeof flight.commNames !== 'object') {
    flight.commNames = { 1: {}, 2: {} };
  }
  if (!flight.commNames[1] || typeof flight.commNames[1] !== 'object') flight.commNames[1] = {};
  if (!flight.commNames[2] || typeof flight.commNames[2] !== 'object') flight.commNames[2] = {};
}

export function getFlightCommName(flight, radioIndex, channel, fallback = '') {
  ensureFlightCommNames(flight);
  return flight.commNames[radioIndex][channel] ?? fallback;
}

export function setFlightCommName(flight, radioIndex, channel, value) {
  ensureFlightCommNames(flight);
  flight.commNames[radioIndex][channel] = value;
}

/**
 * Shared channel loop for F-16 and F-18.
 * Returns raw1/raw2: objects keyed 1–20, each { freq, channel, pCh }.
 * modulation and name are sourced by each builder independently.
 * @param {object} flight
 * @param {object} personalComm1 - personal DTC comm1 channels object (pass {} if mergeComms=false)
 * @param {object} personalComm2 - personal DTC comm2 channels object (pass {} if mergeComms=false)
 * @returns {{ raw1: object, raw2: object }}
 */
export function buildCommChannels(flight, personalComm1, personalComm2) {
  const raw1 = {}, raw2 = {};
  for (let i = 1; i <= 20; i++) {
    const pCh1 = personalComm1[`Channel_${i}`] ?? personalComm1[String(i)];
    const pCh2 = personalComm2[`Channel_${i}`] ?? personalComm2[String(i)];
    const freq1 = (pCh1?.frequency ?? pCh1?.Frequency) ?? flight.radio1?.[i];
    const freq2 = (pCh2?.frequency ?? pCh2?.Frequency) ?? flight.radio2?.[i];
    if (freq1 !== undefined) raw1[i] = { freq: parseFloat(Number(freq1).toFixed(3)), pCh: pCh1, channel: i };
    if (freq2 !== undefined) raw2[i] = { freq: parseFloat(Number(freq2).toFixed(3)), pCh: pCh2, channel: i };
  }
  return { raw1, raw2 };
}
