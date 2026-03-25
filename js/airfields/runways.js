/**
 * Runway and airdrome reference database for DCS airfields.
 * Data is loaded from JSON files instead of being hardcoded.
 * Sources:
 * - airdrome-ids.json: Maps theater → (airdrome ID → airport name)
 * - runways-data.json: Runway information by theater and airport
 */

// In-memory cache for loaded data
let AIRDROME_ID_MAP = null;
let RUNWAY_DATA = null;

/**
 * Load airdrome and runway data from JSON files
 * Call this once at app startup
 * @returns {Promise<void>}
 */
export async function loadAirfieldData() {
  try {
    // Load airdrome ID mapping
    const adromeIdResponse = await fetch('./js/airfields/airdrome-ids.json');
    if (!adromeIdResponse.ok) throw new Error(`Failed to load airdrome-ids.json: ${adromeIdResponse.status}`);
    AIRDROME_ID_MAP = await adromeIdResponse.json();

    // Load runway data
    const runwaysResponse = await fetch('./js/airfields/runways-data.json');
    if (!runwaysResponse.ok) throw new Error(`Failed to load runways-data.json: ${runwaysResponse.status}`);
    RUNWAY_DATA = await runwaysResponse.json();

    console.log('✓ Airfield data loaded successfully');
  } catch (error) {
    console.error('Failed to load airfield data:', error);
    // Initialize empty objects as fallback
    AIRDROME_ID_MAP = {};
    RUNWAY_DATA = {};
  }
}

/**
 * Get airdrome ID map (theater → ID → name)
 * @returns {object}
 */
export function getAirdromeIdMap() {
  return AIRDROME_ID_MAP || {};
}

/**
 * Get runway data (theater → airport name → runways)
 * @returns {object}
 */
export function getRunwayData() {
  return RUNWAY_DATA || {};
}

/**
 * Look up runway data by theater and airfield name
 * @param {string} airdromeName - Airdrome display name
 * @param {string} theater - Theater name (e.g., 'Caucasus')
 * @returns {array|null} Array of runway objects or null if not found
 */
export function lookupRunwaysByName(airdromeName, theater) {
  if (!airdromeName || !theater || !RUNWAY_DATA) return null;

  const theaterData = RUNWAY_DATA[theater];
  if (!theaterData) return null;

  // Try exact match first (case-insensitive)
  const normalized = airdromeName.toLowerCase();
  for (const [key, data] of Object.entries(theaterData)) {
    if (key.toLowerCase() === normalized) {
      return data.runways || null;
    }
  }

  // Try partial match if no exact match
  for (const [key, data] of Object.entries(theaterData)) {
    if (key.toLowerCase().includes(normalized) || normalized.includes(key.toLowerCase())) {
      return data.runways || null;
    }
  }

  return null;
}
