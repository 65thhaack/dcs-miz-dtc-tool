/**
 * Airfield lookup utility
 * Matches mission airdrome data to runway reference data
 */

import { lookupRunwaysByName, getAirdromeIdMap } from './runways.js';

/**
 * Get spawn/home airfield from flight's first waypoint
 * @param {object} flight - Flight object
 * @param {string} theater - Theater name
 * @returns {object|null} Spawn airfield object or null
 */
export function getSpawnAirdrome(flight, theater) {
  if (!flight || !flight.waypoints || flight.waypoints.length === 0) return null;

  const firstWp = flight.waypoints[0];
  if (!firstWp.airdromeId) return null;

  const airdromeMap = getAirdromeIdMap()[theater];
  if (!airdromeMap) return null;

  const airdromeName = airdromeMap[firstWp.airdromeId];
  if (!airdromeName) return null;

  const runways = lookupRunwaysByName(airdromeName, theater);
  return {
    name: airdromeName,
    airdromeId: firstWp.airdromeId,
    runways: runways || [],
    isSpawn: true,
  };
}

/**
 * Find destination airfield from mission airdrome list
 * Matches against the last waypoint to determine destination
 * @param {object} flight - Flight object with waypoints and missionAirdromes
 * @param {string} theater - Theater name
 * @returns {object|null} Destination airfield object or null
 */
export function findDestinationAirdrome(flight, theater) {
  if (!flight || !flight.waypoints || flight.waypoints.length === 0) return null;

  // Get destination waypoint (last non-land waypoint or landing waypoint)
  const waypoints = flight.waypoints;
  let destWp = null;

  // Find last waypoint
  for (let i = waypoints.length - 1; i >= 0; i--) {
    if (!waypoints[i].isTakeoff) {
      destWp = waypoints[i];
      break;
    }
  }

  if (!destWp) return null;

  // Get mission airdromes
  const airdromes = flight.missionAirdromes || [];
  if (airdromes.length === 0) return null;

  // Find closest airdrome by position
  let closest = null;
  let closestDist = Infinity;

  for (const airdrome of airdromes) {
    const dx = (airdrome.x || 0) - (destWp.x || 0);
    const dy = (airdrome.y || 0) - (destWp.y || 0);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < closestDist) {
      closestDist = dist;
      closest = airdrome;
    }
  }

  // Return airdrome if within reasonable distance (30 km)
  if (closest && closestDist < 30000) {
    // Enrich with runway data
    const runways = lookupRunwaysByName(closest.name || closest.callsign, theater);
    return {
      ...closest,
      runways: runways || [],
    };
  }

  return null;
}

/**
 * Find best airfield for flight: spawn airfield, fallback to destination
 * @param {object} flight - Flight object
 * @param {string} theater - Theater name
 * @returns {object|null} Best airfield object or null
 */
export function findBestAirdrome(flight, theater) {
  // Prefer spawn airfield if available
  const spawnAirdrome = getSpawnAirdrome(flight, theater);
  if (spawnAirdrome) return spawnAirdrome;

  // Fallback to destination airfield
  return findDestinationAirdrome(flight, theater);
}

/**
 * Get all mission airdrome options for a manual selector
 * @param {array} airdromes - Mission airdrome list from state
 * @param {string} theater - Theater name
 * @returns {array} Array of airdromes with runway data enriched
 */
export function enrichAirdromeRunways(airdromes, theater) {
  if (!Array.isArray(airdromes)) return [];

  return airdromes.map(airdrome => {
    const runways = lookupRunwaysByName(airdrome.name || airdrome.callsign, theater);
    return {
      ...airdrome,
      runways: runways || [],
    };
  });
}

/**
 * Format runway information for display
 * @param {array} runways - Array of runway objects
 * @returns {string} Formatted runway string
 */
export function formatRunways(runways) {
  if (!Array.isArray(runways) || runways.length === 0) {
    return 'Unknown';
  }

  return runways
    .map(rwy => {
      const length = rwy.length ? `${(rwy.length / 1000).toFixed(1)}km` : '';
      return `${rwy.heading1}/${rwy.heading2}${length ? ` (${length})` : ''}`;
    })
    .join(' + ');
}
