# Other Aircraft Display — Design Spec

**Date:** 2026-03-25
**Status:** Approved

## Overview

Add read-only display cards for all non-F-16C/F-18C player/client flights in a loaded `.miz` file. These cards show aircraft type, flight name, waypoints, and comm channels. No DTC export or editing functionality is provided. They appear below the F-16C and F/A-18C sections.

## Scope

- **Included:** All `plane.group[]` and `helicopter.group[]` entries where at least one unit has `skill === "Client"` or `skill === "Player"`, and the aircraft type is not F-16C or F/A-18C.
- **Excluded:** Purely AI flights, F-16C flights, F/A-18C flights.
- **No DTC features:** No Preview/Edit button, no export controls, no personal DTC merge, no DTC pills.

---

## 1. Data Extraction

### New function: `extractOtherFlights(mission, theater)`

**Location:** `js/miz/extractor.js`

**Logic:**
1. Iterate all coalition sides (`blue`, `red`, `neutrals`) → countries → both `plane.group[]` and `helicopter.group[]`.
2. Skip groups where any unit matches `isF16Type` or `isF18Type`.
3. Skip groups where no unit has `skill === "Client"` or `skill === "Player"`.
4. For each qualifying group, extract:
   - `groupId`, `name`, `aircraftType` (from first unit's `type`), `side`, `country`
   - `units[]` — array of `{ name, callsign, skill }`
   - `waypoints[]` — same extraction logic as existing extractor (coordinate conversion, alt in ft, speed in kts). Coordinates stored as `lat`/`lon` (decimal degrees available from existing conversion).
   - `radios[]` — array of all `Radio[n]` channel objects found on the first unit (variable length, e.g. 2 for most aircraft, 3 for A-10C). Each entry is the normalized channels object `{ 1: { freq, name }, 2: ... }`.

**Flight object shape (otherFlights):**
```js
{
  groupId,
  name,
  aircraftType,   // raw DCS type string, e.g. "A-10C_2", "Ka-50_3"
  side,
  country,
  units: [{ name, callsign, skill }],
  waypoints: [],  // same structure as existing extractor
  radios: [],     // array of channel maps, one per radio
}
```

No miz/working-copy split. These flights are display-only; a single set of fields suffices.

**Storage:** `state.otherFlights = extractOtherFlights(mission, state.theater)`

---

## 2. Rendering

### New file: `js/ui/other-flight-cards.js`

**Exported function:** `renderOtherFlights(flights)`

**Container:** `#other-flights-container`

### Card structure

Matches the existing collapsed card style (`.flight-card.collapsed`):

```
┌─────────────────────────────────────────────────────┐
│ ▼  A-10C II · HAWG 1-1                              │
│    blue · USA · 4 aircraft · 12 route points         │
├─────────────────────────────────────────────────────┤
│  [Pilot1] [Pilot2] [Pilot3] [Pilot4]                │
├─────────────────────────────────────────────────────┤
│  Waypoints │ COM1 │ COM2 │ COM3                      │
├─────────────────────────────────────────────────────┤
│  Waypoints table / COM table (active tab)            │
└─────────────────────────────────────────────────────┘
```

**Header:** aircraft type label + flight name; meta line with side · country · unit count · waypoint count.

**Tabs:** One tab per entry in `radios[]` labeled COM1, COM2, COM3…, plus a Waypoints tab. Same tab switching behavior as existing cards.

**Waypoints table columns:** `#` | `Name` | `Latitude` | `Longitude` | `Altitude (ft)`

- Coordinates in **decimal degrees** (e.g. `36.4094° N`, `041.7823° E`)
- No speed column (less critical for display-only context)
- No waypoint type badge needed (no STPT/IP/TGT selection)

**COM tables:** Channel # | Frequency (MHz) — same as existing.

**Collapse toggle:** Click on `.flight-head-left` to expand/collapse. Same chevron rotation pattern as existing cards. Cards start collapsed.

**No:** Preview/Edit button, export button, DTC pills, inline preview panel.

---

## 3. HTML Structure

### New section in `index.html` (below F/A-18C section):

```html
<section id="other-section" class="hidden">
  <h2 class="section-title">Other Aircraft</h2>
  <div id="other-flights-container"></div>
  <p id="other-empty" class="empty-msg hidden">No other player flights found.</p>
</section>
```

Section is shown only when `state.otherFlights.length > 0`.

---

## 4. Handler Wiring

### Changes to `js/handlers.js`

1. Import `extractOtherFlights` from `js/miz/extractor.js`.
2. Import `renderOtherFlights` from `js/ui/other-flight-cards.js`.
3. After the F-16/F-18 extraction calls, add:
   ```js
   state.otherFlights = extractOtherFlights(mission, state.theater);
   renderOtherFlights(state.otherFlights);
   document.getElementById('other-section').classList.toggle('hidden', state.otherFlights.length === 0);
   ```
4. Wire collapse toggle for other-flight cards using the existing delegated event handler pattern (same `data-action="toggle-flight-from-head"` attribute on `.flight-head-left`).
5. On `.miz` reload/reset, clear `#other-flights-container` and re-hide `#other-section`.

---

## 5. Files Changed / Created

| File | Change |
|------|--------|
| `js/miz/extractor.js` | Add `extractOtherFlights()` |
| `js/ui/other-flight-cards.js` | **New** — `renderOtherFlights()` |
| `js/handlers.js` | Import + call both new functions; show/hide section |
| `index.html` | Add Other Aircraft section; import new module |
| `styles.css` | Minimal or none — reuse existing `.flight-card` classes |

---

## 6. Out of Scope

- Editing waypoints or radio presets for other aircraft
- DTC export for any other aircraft type
- Filtering by coalition side
- Map integration for other aircraft waypoints
