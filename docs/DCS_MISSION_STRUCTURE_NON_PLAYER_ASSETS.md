# DCS Mission Structure: Non-Player Assets (Tankers, AWACS, Ships)

**Updated:** March 25, 2026  
**Scope:** Detailed breakdown of where tankers, AWACS, carriers, and other non-player assets are stored in DCS mission files and how to extract their callsigns, TACAN, radio, and position data.

---

## Overview

A `.miz` file contains a Lua-encoded mission state with separate entries for **player aircraft** (groups under `coalition.blue/red/neutrals.country.plane.group`) and **non-player assets** (tankers, AWACS, ships, stationary objects, triggers). This document maps the locations and field structures for each asset type.

---

## Table of Contents

1. [Mission Root Structure](#mission-root-structure)
2. [Non-Player Aircraft: Tankers (KC-135, KC-130, etc.)](#non-player-aircraft-tankers)
3. [Non-Player Aircraft: AWACS (E-3, E-2, etc.)](#non-player-aircraft-awacs)
4. [Ships & Carriers](#ships--carriers)
5. [TACAN Beacons and Radio Data](#tacan-beacons-and-radio-data)
6. [Field Extraction Patterns](#field-extraction-patterns)
7. [Current TACAN Extraction Strategy](#current-tacan-extraction-strategy)
8. [Maps: Mission Structure at a Glance](#maps-mission-structure-at-a-glance)

---

## Mission Root Structure

### Top Level
```
mission
├── coalition
│   ├── blue
│   │   └── country[] (list of countries on blue side)
│   ├── red
│   │   └── country[] (list of countries on red side)
│   └── neutrals (or null)
│       └── country[] (list of neutral countries)
├── theatre (string: "Caucasus", "Syria", "PersianGulf", etc.)
├── currentKey (current coalition/side indicator)
├── result (mission outcome tracking)
├── maxDictId (ID counter)
├── groundControl
├── triggers
├── result
└── ... other metadata fields
```

Each `coalition[side].country[i]` is indexed by numeric key and has this structure:

```lua
{
  name = "USA",      -- country name
  plane = { group = { ... } },     -- player and non-player plane groups
  helicopter = { group = { ... } }, -- helicopter groups
  ship = { group = { ... } },        -- surface ship groups
  static = { group = { ... } }       -- stationary objects (buildings, etc.)
}
```

---

## Non-Player Aircraft: Tankers

### Location Path
```
mission.coalition[side].country[i].plane.group[groupId]
```

**Key Characteristics:**
- Stored in **the same `plane.group` array as player flights**
- Differentiated by **unit type** (e.g., `"KC-135"`, `"KC-130J"`, `"A-50"`)
- Typically **human-controlled** (skill = `"High"` or `"Client"`) or **AI-controlled** (skill = `"Expert"`, `"Excellent"`)
- **Do NOT** have a `category` = `"Plane"` or player role; they have **refueling capability**

### Structure
```lua
group[groupId] = {
  groupId = 1,                    -- unique identifier
  name = "Tanker-1",              -- group display name
  hidden = false,                 -- visibility flag
  task = "CAP",                   -- task type (may vary)
  units = {
    [1] = {
      type = "KC-135",              -- aircraft type string
      name = "Tanker-1-1",           -- unit name
      displayName = "Tanker-1-1",    -- display name (sometimes differs)
      heading = 0,                   -- initial heading in radians
      alt = 6096,                    -- altitude in meters MSL
      speed = 100,                   -- speed in m/s
      x = 123456.78,                 -- DCS theater X coordinate (meters)
      y = 987654.32,                 -- DCS theater Y coordinate (meters)
      callsign = {
        [1] = "Texaco",              -- flight callsign name (often refueling channel)
        [2] = 1,                      -- flight number
        [3] = 1,                      -- element number
        name = "Texaco 1-1"           -- computed callsign string
      },
      skill = "Expert",              -- AI skill level
      player_name = nil,             -- player name if human-controlled
      count1 = nil, count2 = nil,    -- fuel state tracking
      Radio = {
        [1] = { channels = {...} },  -- COM1 (UHF)
        [2] = { channels = {...} }   -- COM2 (VHF)
      },
      unitId = 1,                    -- unique unit identifier
      ammo = {...},                  -- ammo/fuel configuration
      livery_id = "default",         -- skin/livery
      OnBoard = {...},               -- systems state (DTC, countermeasures, etc.)
      TACAN = {...},                 -- TACAN beacon data (IF present)
      beaconProps = {...},           -- beacon properties (IF navigation suit has beacon)
      AirdromeIdentification = {...} -- airfield ID (IF stationed at field)
    }
  },
  route = {
    points = {
      [1] = { x, y, alt, speed, type, name, ... } -- waypoint 1
      [2] = { ... }                                 -- waypoint 2
      ...
    }
  },
  x = 123456.78,                 -- group center X
  y = 987654.32,                 -- group center Y
  uncontrollable = false
}
```

### Key Fields for Tanker Extraction

| Field Path | Type | Purpose |
|----------|------|---------|
| `group.name` | string | Tanker group display name (e.g., "Tanker-1") |
| `unit.type` | string | Aircraft type code (`"KC-135"`, `"KC-130J"`, `"A-50"`) |
| `unit.name` | string | Unit name (e.g., "Tanker-1-1") |
| `unit.callsign.name` | string | Full callsign (e.g., "Texaco 1-1") |
| `unit.callsign[1]` | string | Callsign flight name (e.g., "Texaco") |
| `unit.callsign[2]` | number | Flight number |
| `unit.callsign[3]` | number | Element number |
| `unit.alt` | number | Altitude in **meters MSL** |
| `unit.speed` | number | Speed in **m/s** |
| `unit.x`, `unit.y` | number | DCS theater coordinates in meters |
| `unit.unitId` | number | Unique unit ID (used for TACAN beacons) |
| `unit.skill` | string | AI skill (`"Expert"`, `"Excellent"`, `"High"`, `"Client"`) |
| `unit.player_name` | string | Player name if slot is available/human-controlled |
| `unit.TACAN` | object | TACAN beacon object (if this unit broadcasts TACAN) |
| `unit.Radio[1]` | object | COM1 (UHF) radio preset object |
| `unit.Radio[2]` | object | COM2 (VHF) radio preset object |

### TACAN Field in Unit (If Present)
```lua
unit.TACAN = {
  id = "Texaco",                    -- beacon identifier/callsign
  channel = 109,                    -- TACAN channel (1-126)
  channelMode = "X",                -- mode: "X" or "Y"  (may also be "Automatic" → defaults to X)
  callsign = "Texaco",              -- beacon callsign/label
  position = { x = 123456, y = 987654 }, -- beacon position (may differ slightly from unit)
  unitId = 1,                       -- reference to the unit broadcasting this
}
```

### Radio Structure in Unit
```lua
unit.Radio[1] = {   -- COM1 (UHF)
  channels = {
    [1] = { freq = 305.000, modulation = 0, name = "Tower" },   -- channel 1
    [2] = { freq = 264.500, modulation = 0, name = "Awacs" },   -- channel 2
    ...
    [20] = { freq = 251.000, modulation = 0, name = "Guard" }   -- channel 20
  }
}

unit.Radio[2] = {   -- COM2 (VHF)
  channels = {
    [1] = { freq = 121.500, modulation = 0, name = "Guard" },
    [2] = { freq = 134.000, modulation = 0, name = "Flight" },
    ...
  }
}
```

**Modulation:** 0 = AM (typical for military aviation)

---

## Non-Player Aircraft: AWACS

### Location Path
```
mission.coalition[side].country[i].plane.group[groupId]
```

**Key Characteristics:**
- Stored in **the same `plane.group` array as tankers and player flights**
- Typically **high-altitude** (~10,000 m / 30,000 ft)
- Unit types: `"E-3A"`, `"E-3D"` (NATO), `"A-50"` (Russian), `"KJ-2000"` (Chinese)
- AI-controlled; skill = `"Expert"` or `"Client"`
- Often **slower cruising speed** (150–200 m/s instead of 250+ for fighters)
- May have **specialized avionics** including radar and EWS suite

### Structure
Identical layout to tankers (above). Example:

```lua
group[groupId] = {
  groupId = 2,
  name = "AWACS",
  units = {
    [1] = {
      type = "E-3A",                -- AWACS type
      name = "AWACS-1",
      alt = 10668,                  -- ~35,000 ft
      speed = 175,                  -- m/s (~340 kts)
      x = 150000, y = 200000,
      callsign = {
        [1] = "Magic",              -- NATO callsign for E-3A
        [2] = 1,
        [3] = 1,
        name = "Magic 1-1"
      },
      unitId = 2,
      TACAN = {
        callsign = "Magic",
        channel = 110,
        channelMode = "X"
      },
      Radio = { [1] = {...}, [2] = {...} }
    }
  },
  route = { points = {...} }
}
```

### Key Fields for AWACS Extraction

| Field Path | Type | Purpose |
|----------|------|---------|
| `unit.type` | string | Aircraft type (`"E-3A"`, `"A-50"`, `"KJ-2000"`, etc.) |
| `unit.callsign.name` | string | Full callsign (e.g., "Magic 1-1", "Awacs 1-1") |
| `unit.callsign[1]` | string | Flight name (e.g., "Magic") |
| `unit.alt` | number | Altitude in meters MSL (typically 8,000–12,000 m) |
| `unit.speed` | number | Speed in m/s |
| `unit.x`, `unit.y` | number | DCS theater coordinates |
| `unit.TACAN` | object | TACAN beacon (if installed) |
| `unit.Radio[1]`, `unit.Radio[2]` | object | COM1, COM2 radio presets |

---

## Ships & Carriers

### Location Path
```
mission.coalition[side].country[i].ship.group[groupId]
```

**CRITICAL DIFFERENCE FROM AIRCRAFT:** Ships are stored in **`country.ship.group`**, NOT `country.plane.group`.

### Carrier Structure

```lua
group[groupId] = {
  groupId = 10,
  name = "Stennis-1",               -- carrier group display name
  units = {
    [1] = {
      type = "CVN-74",              -- carrier type (CVN-70, CVN-71, CVN-72, CVN-74, etc.)
      name = "Stennis",             -- unit name
      heading = 0.5,                -- heading in radians
      alt = 0,                       -- altitude (always 0 for ships)
      speed = 5,                     -- speed in m/s (~10 knots typical)
      x = 500000, y = 600000,       -- DCS theater coordinates
      unitId = 10,                  -- unique ID (used for TACAN/beacons)
      callsign = {
        [1] = "Stennis",            -- ship name or callsign
        name = "Stennis"
      },
      TACAN = {
        callsign = "CVN",           -- carriers often broadcast "CVN"
        channel = 74,               -- TACAN channel
        channelMode = "X",          -- mode
        unitId = 10                 -- reference to this ship
      },
      Radio = {
        [1] = { channels = {...} }, -- COM1 (VHF for maritime)
        [2] = { channels = {...} }  -- COM2
      },
      tacan_id = 10,                -- may also have explicit tacan_id field
      AirdromeIdentification = {    -- flight deck identification (if present)
        id = "Stennis",
        callsign = "CVN"
      }
    }
  },
  route = {
    points = {
      [1] = { x=500000, y=600000, alt=0, speed=5, ... }  -- waypoint 1
      ...
    }
  },
  x = 500000, y = 600000           -- group center
}
```

### Destroyer/Frigate Structure

```lua
group[groupId] = {
  groupId = 11,
  name = "Destroyer-1",
  units = {
    [1] = {
      type = "DDG-51",              -- destroyer type
      name = "Arleigh Burke",
      alt = 0,
      speed = 8,                    -- ~15 knots
      x = 510000, y = 610000,
      unitId = 11,
      callsign = { name = "Arleigh Burke" },
      Radio = { ... },
      -- May or may not have TACAN
    }
  }
}
```

### Key Fields for Ship Extraction

| Field Path | Type | Purpose |
|----------|------|---------|
| `group.name` | string | Group/Task Force name |
| `unit.type` | string | Ship class (`"CVN-74"`, `"DDG-51"`, `"LCS-1"`, etc.) |
| `unit.name` | string | Ship name (e.g., "Stennis", "Arleigh Burke") |
| `unit.callsign.name` | string | Callsign or ship name |
| `unit.x`, `unit.y` | number | DCS theater coordinates |
| `unit.heading` | number | Ship heading in radians |
| `unit.speed` | number | Speed in m/s (knots × 0.51444) |
| `unit.alt` | number | Always 0 for ships (sea level) |
| `unit.unitId` | number | Unique ID (for TACAN reference) |
| `unit.TACAN` | object | TACAN beacon data (if broadcaster) |
| `unit.Radio[1]`, `unit.Radio[2]` | object | COM1, COM2 radio presets |
| `unit.AirdromeIdentification` | object | Flight deck ID (carriers only) |
| `unit.tacan_id` | number | May also have explicit TACAN ID (less common) |

---

## TACAN Beacons and Radio Data

### TACAN Beacons: Distributed Across Mission

TACAN beacons are **not centralized** in a single mission array. Instead, they are **embedded within unit objects** or **in specialized beacon containers**. The current tool's `extractTacanCandidates()` function uses a **deep walk** to find them anywhere in the mission tree.

### Beacon Data Structures

#### Structure 1: `unit.TACAN` (Most Common)
```lua
unit.TACAN = {
  id = "Stennis",
  channel = 74,
  channelMode = "X",
  callsign = "CVN",            -- beacon callsign/label
  position = { x = ..., y = ... },
  unitId = 10,                 -- back-reference to unit
  modeChannel = "X",           -- alternative field name for mode
  elevation = 0,               -- beacon elevation (usually 0 for ships, varies for airfields)
}
```

#### Structure 2: `unit.beaconProps` (Advanced Beacons)
```lua
unit.beaconProps = {
  type = "TACAN_TRANSPONDER",
  callsign = "Stennis",
  channel = 74,
  mode = "X",
  -- ... other properties
}
```

#### Structure 3: Airfield/Beacon Container (Less Common)
```lua
-- Beacons may also appear in:
mission.result.coalition[side].country[].beacons = {
  [1] = { ... TACAN object ... }
}
```

### Radio Channels: Structure and Frequency Range

Both tankers and ships can have radio presets:

```lua
unit.Radio = {
  [1] = {                                    -- COM1
    channels = {
      [1] = { freq = 305.00, name = "TOWER", modulation = 0 },
      [2] = { freq = 264.50, name = "AWACS", modulation = 0 },
      ...
      [20] = { freq = 251.00, name = "GUARD", modulation = 0 }
    }
  },
  [2] = {                                    -- COM2
    channels = {
      [1] = { freq = 121.50, name = "GUARD", modulation = 0 },
      [2] = { freq = 134.00, name = "FLIGHT", modulation = 0 },
      ...
    }
  }
}
```

**Frequency Ranges:**
- **COM1 (UHF):** 225–400 MHz (typical: 225–330 MHz for military)
- **COM2 (VHF):** 30–90 MHz, or 108–137 MHz (ILS/VOR/civilian traffic)
- **Modulation:** Typically 0 (AM)

---

## Field Extraction Patterns

### Common Extraction Paths

#### For Tankers and AWACS (Aircraft in `plane.group`)

```javascript
// Iterate all non-player groups in plane.group
for (const side of ['blue', 'red', 'neutrals']) {
  const countries = mission.coalition[side]?.country || {};
  for (const countryIdx in countries) {
    const country = countries[countryIdx];
    const planeGroups = country?.plane?.group || {};
    for (const groupId in planeGroups) {
      const group = planeGroups[groupId];
      if (!group.units) continue;
      
      for (const unitIdx in group.units) {
        const unit = group.units[unitIdx];
        
        // Identify tanker vs AWACS
        const isTanker = ['KC-135', 'KC-130J', 'A-50', 'KC-390'].includes(unit.type);
        const isAwacs = ['E-3A', 'E-3D', 'A-50', 'KJ-2000'].includes(unit.type);
        
        // Extract fields
        const callsign = unit.callsign?.name || '';
        const tacan = unit.TACAN;
        const radio1 = unit.Radio?.[1];
        const radio2 = unit.Radio?.[2];
        const alt = unit.alt;         // meters
        const x = unit.x;
        const y = unit.y;
      }
    }
  }
}
```

#### For Ships and Carriers (Under `ship.group`)

```javascript
for (const side of ['blue', 'red', 'neutrals']) {
  const countries = mission.coalition[side]?.country || {};
  for (const countryIdx in countries) {
    const country = countries[countryIdx];
    const shipGroups = country?.ship?.group || {};  // <-- NOTE: ship, not plane
    for (const groupId in shipGroups) {
      const group = shipGroups[groupId];
      if (!group.units) continue;
      
      for (const unitIdx in group.units) {
        const unit = group.units[unitIdx];
        
        // Identify carrier vs destroyer
        const isCarrier = unit.type.startsWith('CVN');
        const isDestroyer = unit.type.startsWith('DDG');
        
        // Extract fields
        const shipName = unit.name;
        const callsign = unit.callsign?.name || unit.name;
        const tacan = unit.TACAN;
        const radio1 = unit.Radio?.[1];
        const radio2 = unit.Radio?.[2];
        const head = unit.heading;     // radians
        const speed = unit.speed;      // m/s
        const x = unit.x;
        const y = unit.y;
      }
    }
  }
}
```

### Special Cases: TACAN in Different Locations

The `extractTacanCandidates()` function finds TACAN beacons by walking the **entire mission tree**, looking for objects with:
- `channel` (1–126)
- `channelMode` or `ChannelMode` (or inferred from `modeChannel`)
- `x` and `y` (position)
- One of: `unitId`, `callsign`, `display_name`, or path hint `/tacan/beacon/tcn/`

**Beacons may exist at paths like:**
- `coalition.blue.country[0].plane.group[1].units[1].TACAN`
- `coalition.red.country[2].ship.group[5].units[1].TACAN`
- `mission.theatre.airdromes[0].tacan` (stationary beacons)
- `coalition.blue.result.TACAN` (rarely)

---

## Current TACAN Extraction Strategy

### How `extractTacanCandidates()` Works

1. **Deep Walk:** Recursively traverse every object in the mission tree
2. **Filter:** Look for objects with `channel`, `channelMode`, and position data
3. **Deduplicate:** Use `tcnCandidateKey()` to avoid duplicates:
   ```javascript
   [channel, modeChannel, unitId, display_name, x.toFixed(1), y.toFixed(1)].join('|')
   ```
4. **Output:** Sorted by channel, then display name

### Extracted TACAN Object Structure

```javascript
{
  channel: 74,                    // TACAN channel (1–126)
  modeChannel: "X",              // or "Y"
  callsign: "CVN",               // beacon identifier
  display_name: "CVN_74X",       // [callsign]_[channel][mode] fallback
  unitId: 10,                    // reference to unit
  elevation: 0,                  // meters (alt for airfields, 0 for ships)
  x: 500000, y: 600000,          // DCS coordinates
  unitPointNum: 1                // route waypoint (default 1)
}
```

### Advantages of the Deep-Walk Strategy
- **Captures all TACAN beacons** regardless of their nesting level
- **No schema assumptions**—works even if beacons appear in unexpected paths
- **Deduplication ensures** no duplicates in UI

### Limitations
- May accidentally capture "TACAN-like" objects in non-beacon contexts (rare)
- No direct parent link back to unit/group (must cross-reference via `unitId`)

---

## Maps: Mission Structure at a Glance

### Complete Coalition Structure

```
mission
└─ coalition
   ├─ blue
   │  └─ country[]
   │     ├─ name: "USA"
   │     ├─ plane
   │     │  └─ group[]               ← All aircraft (player flights, tankers, AWACS)
   │     │     ├─ groupId
   │     │     ├─ name
   │     │     ├─ units[]            ← Individual aircraft
   │     │     │  ├─ type            ← "F-16C_50", "KC-135", "E-3A", etc.
   │     │     │  ├─ name
   │     │     │  ├─ callsign
   │     │     │  ├─ alt
   │     │     │  ├─ speed
   │     │     │  ├─ x, y            ← Position
   │     │     │  ├─ unitId
   │     │     │  ├─ Radio[]         ← COM1/COM2
   │     │     │  ├─ TACAN           ← Beacon (if present)
   │     │     │  └─ beaconProps     ← Advanced beacon (if present)
   │     │     └─ route
   │     │        └─ points[]        ← Waypoints
   │     │
   │     ├─ helicopter              ← Similar structure to plane
   │     │  └─ group[]
   │     │
   │     ├─ ship
   │     │  └─ group[]               ← All ships (carriers, destroyers, etc.)
   │     │     ├─ groupId
   │     │     ├─ name               ← Task Force / Group name
   │     │     ├─ units[]            ← Individual ships
   │     │     │  ├─ type            ← "CVN-74", "DDG-51", "LCS-1", etc.
   │     │     │  ├─ name            ← Ship name
   │     │     │  ├─ x, y            ← Position
   │     │     │  ├─ heading         ← Radians
   │     │     │  ├─ speed           ← m/s (knots × 0.51444)
   │     │     │  ├─ alt             ← Always 0
   │     │     │  ├─ unitId
   │     │     │  ├─ TACAN           ← Beacon (if broadcaster)
   │     │     │  ├─ Radio[]         ← COM1/COM2
   │     │     │  └─ AirdromeIdentification (carriers only)
   │     │     └─ route
   │     │        └─ points[]
   │     │
   │     └─ static
   │        └─ group[]               ← Stationary buildings, structures
   │           └─ units[]
   │              └─ (positions, no movement)
   │
   ├─ red
   │  └─ country[]                  ← Identical structure as blue
   │
   └─ neutrals                       ← Optional neutral countries
      └─ country[]                  ← Same structure
```

### Asset Lookup Decision Tree

```
Asset Type? (from mission)
│
├─ Player Flight (F-16, F/A-18, etc.)
│  └─ coalition[side].country[].plane.group[]
│     → Extract waypoints, radio, CMDS
│
├─ Tanker (KC-135, KC-130J, A-50)
│  └─ coalition[side].country[].plane.group[]  ← Same as player!
│     → Extract TACAN, callsign, radio, altitude, position
│
├─ AWACS (E-3A, E-3D, A-50, KJ-2000)
│  └─ coalition[side].country[].plane.group[]  ← Same as player!
│     → Extract TACAN, callsign, radio, altitude, position
│
├─ Carrier (CVN-70, CVN-71, etc.)
│  └─ coalition[side].country[].ship.group[]   ← DIFFERENT path!
│     → Extract TACAN (often callsign="CVN"), radio, heading, position
│
├─ Destroyer (DDG-51, DDG-52, etc.)
│  └─ coalition[side].country[].ship.group[]   ← DIFFERENT path!
│     → Extract TACAN (if present), radio, name, position
│
├─ Helicopter (UH-60A, CH-53E, etc.)
│  └─ coalition[side].country[].helicopter.group[]
│     → Similar to aircraft, may have TACAN/radio
│
└─ Stationary (Buildings, SAM sites, etc.)
   └─ coalition[side].country[].static.group[]
      → Position only, no TACAN/radio/altitude
```

---

## Summary

### Quick Reference: Asset Type → Location & Key Fields

| Asset Type | Path | Type Field | Callsign | TACAN | Radio | Alt | Position |
|-----------|------|-----------|----------|-------|-------|-----|----------|
| **Player Flight** | `coalition[side].country[].plane.group[]` | `"F-16C_50"`, `"FA-18C"`, etc. | ✓ | ✓ (custom) | ✓ | ✓ | x, y |
| **Tanker** | `coalition[side].country[].plane.group[]` | `"KC-135"`, `"KC-130J"` | ✓ | ✓ (often) | ✓ | ✓ | x, y |
| **AWACS** | `coalition[side].country[].plane.group[]` | `"E-3A"`, `"A-50"` | ✓ | ✓ (often) | ✓ | ✓ (high) | x, y |
| **Carrier** | `coalition[side].country[].ship.group[]` | `"CVN-74"`, etc. | ✓ | ✓ (usually `"CVN"`) | ✓ | 0 | x, y |
| **Destroyer** | `coalition[side].country[].ship.group[]` | `"DDG-51"`, etc. | ✓ | ✓ (if equipped) | ✓ | 0 | x, y |
| **Helicopter** | `coalition[side].country[].helicopter.group[]` | `"UH-60A"`, `"CH-53E"` | ✓ | ✓ (custom) | ✓ | ✓ | x, y |

**Key Insight:** Tankers and AWACS are stored in the **same `plane.group` array** as player flights. **Ships are in a `ship.group` in the same `country` object.**

---

## Implementation Notes

### For Future Tool Expansion

If the tool is extended to display/export tanker/AWACS/carrier information:

1. **Reuse existing player flight path:** `coalition[side].country[].plane.group[]` already captures tankers and AWACS—just filter by unit type in `extractFlightsByType()` or a new `extractNonPlayerAssets()` function.

2. **Add ship extractor:** Create a parallel `extractNonPlayerShips()` function that iterates `coalition[side].country[].ship.group[]`.

3. **TACAN deduplication:** Current `extractTacanCandidates()` already finds all TACAN beacons regardless of asset type. No changes needed.

4. **Display data:** Add non-player asset cards alongside player flight cards, showing callsign, TACAN channel (if any), radio presets, and position.

5. **Radio merging:** If merging personal DTC with tanker/AWACS missions, use the same `unit.Radio[1]` / `unit.Radio[2]` merge strategy as player flights.

---

## Example: Extracting Tanker Data

```javascript
// Find all tankers in the mission
function extractTankers(mission) {
  const tankers = [];
  const tankerTypes = ['KC-135', 'KC-130J', 'A-50', 'KC-390'];
  
  for (const side of ['blue', 'red', 'neutrals']) {
    const countries = mission.coalition[side]?.country || {};
    for (const countryIdx in countries) {
      const country = countries[countryIdx];
      const planeGroups = country?.plane?.group || {};
      
      for (const groupId in planeGroups) {
        const group = planeGroups[groupId];
        if (!group.units) continue;
        
        for (const unitIdx in group.units) {
          const unit = group.units[unitIdx];
          if (!tankerTypes.includes(unit.type)) continue;
          
          tankers.push({
            side,
            country: country.name,
            groupName: group.name,
            unitName: unit.name,
            type: unit.type,
            callsign: unit.callsign?.name || '',
            tacan: unit.TACAN || null,
            radio1: unit.Radio?.[1] || null,
            radio2: unit.Radio?.[2] || null,
            altitude: unit.alt,
            speed: unit.speed,
            position: { x: unit.x, y: unit.y }
          });
        }
      }
    }
  }
  
  return tankers;
}
```

---

## References

- **CLAUDE.md** — DCS mission format reference in this project
- **`js/miz/extractor.js`** — Current player flight extraction logic
- **`js/miz/lua-parser.js`** — Lua mission file parser
