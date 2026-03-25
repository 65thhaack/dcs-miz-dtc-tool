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
1. Iterate all coalition sides (`blue`, `red`, `neutrals`) → countries → both `plane.group[]` and `helicopter.group[]`. Note: the existing `extractFlightsByType` only iterates `plane.group[]`; iterating `helicopter.group[]` is new behavior added here. Helicopter groups use structurally identical `route.points[]` and `Radio[]` Lua fields as plane groups.
2. Skip groups where any unit matches `isF16Type` or `isF18Type`.
3. Skip groups where no unit has `skill === "Client"` or `skill === "Player"`. Note: this is an intentional divergence from `extractFlightsByType`, which includes all matching groups regardless of skill. `extractOtherFlights` is player/client-exclusive by design — AI-only groups are excluded.
4. For each qualifying group, extract:
   - `groupId`, `name`, `aircraftType` (from first unit's `type` — DCS groups are homogeneous by aircraft type so all units share the same type), `side`, `country`
   - `units[]` — array of `{ name, callsign, skill }`
   - `waypoints[]` — same extraction logic as existing extractor (coordinate conversion, alt in ft, speed in kts). Coordinates stored as `lat`/`lon` (decimal degrees available from existing conversion).
   - `radios[]` — array of all `Radio[n]` channel objects found on the first unit (variable length, e.g. 2 for most aircraft, 3 for A-10C). Iterate `n = 1, 2, 3, ...` until `ref.Radio[n]` is undefined. Each entry is a plain object keyed by integer channel number with raw MHz float values: `{ 1: 305.0, 2: 264.0, ... }` — matching the shape of existing `radio1`/`radio2` fields. This shape is confirmed correct: the existing `comRows` helper uses `Number(radio[ch]).toFixed(3)`, which operates on scalar MHz floats.

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
  radios: [],     // array of channel maps, one per radio { 1: MHz, 2: MHz, ... }
}
```

No miz/working-copy split. These flights are display-only; a single set of fields suffices.

**Storage:** `state.otherFlights = extractOtherFlights(mission, state.theater)`

`state.js` must add `otherFlights: []` to the initial state object so the field is never `undefined` before a `.miz` is loaded.

---

## 2. Rendering

### New file: `js/ui/other-flight-cards.js`

**Exported function:** `renderOtherFlights(flights)`

**Container:** `#other-flights-container`

**Card prefix:** `'other'` — used for tab panel IDs (`tp-other-${groupId}-wpt`, `tp-other-${groupId}-c1`, etc.) and flight card IDs (`fc-other-${groupId}`). Tab buttons carry `data-card-prefix="other"` and `data-action="on-flight-tab-click"`, reusing the existing delegated tab-switch handler without modification.

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

**Tabs:** Waypoints tab (always first, `data-panel="wpt"`) + one COM tab per entry in `radios[]`, labeled COM1, COM2, COM3… with `data-panel="c1"`, `data-panel="c2"`, `data-panel="c3"`, etc. (one-indexed, `c`-prefixed — matching the existing F-16/F-18 convention used by `on-flight-tab-click`). Corresponding panel `id` attributes must use the same suffix: `tp-other-${groupId}-c1`, `tp-other-${groupId}-c2`, etc. If `radios` is empty, only the Waypoints tab is shown.

**Waypoints table columns:** `#` | `Name` | `Latitude` | `Longitude` | `Altitude (ft)`

- Unlike F-16/F-18 cards, the **Type**, **Role**, and **Speed** columns are omitted — no DTC steerpoint type selection is needed and speed is not relevant for display-only context.
- Coordinates in **decimal degrees** (e.g. `36.4094° N`, `041.7823° E`) — chosen because these are display-only cards with no DTC steerpoint format requirements (unlike F-16 decimal-minutes or F/A-18 DMS).
- Takeoff/land rows may be shown or skipped; follow the same pattern as existing cards (skip `isTakeoff`/`isLand` rows).

**COM tables:** Channel # | Frequency (MHz) — same as existing. Empty fallback: `<tr><td colspan="2">No COM data</td></tr>`.

**Collapse toggle:** Click on `.flight-head-left` to expand/collapse. `toggleFlightFromHead` is pure DOM (toggles `.collapsed` CSS class only) and works on any `.flight-card` without modification.

**Section count badge:** Call `setSectionCount('other', flights.length)` from `renderOtherFlights` (reusing the existing `setSectionCount` helper). The section header in `index.html` must include a `<span class="section-count" id="section-count-other"></span>`.

**No:** Preview/Edit button, export button, DTC pills, inline preview panel.

---

## 3. HTML Structure

### New section in `index.html` (inside `#results`, below the F/A-18C section body):

```html
<div id="other-section" style="display:none">
  <div class="section-header" id="section-header-other" style="margin-top:28px">
    <div class="section-left" data-action="toggle-section" data-section="other">
      <span class="section-chevron" id="section-chevron-other">▼</span>
      <span class="section-title">Other Aircraft</span>
      <span class="section-count" id="section-count-other"></span>
    </div>
    <div class="controls"></div>
  </div>

  <div class="section-body" id="section-body-other">
    <div id="other-flights-container"></div>
    <div class="empty" id="no-others" style="display:none">
      <div class="ico">🔍</div>
      <p>No other player flights found in this mission.</p>
    </div>
  </div>
</div>
```

The wrapper `<div id="other-section">` starts hidden (`style="display:none"`). It is placed inside `#results` so it is automatically hidden when `#results` is hidden. The handler toggles visibility via `document.getElementById('other-section').style.display`.

---

## 4. Handler Wiring

### Changes to `js/handlers.js`

1. Import `extractOtherFlights` from `js/miz/extractor.js`.
2. Import `renderOtherFlights` from `js/ui/other-flight-cards.js`.
3. After the F-16/F-18 extraction calls, add:
   ```js
   state.otherFlights = extractOtherFlights(mission, state.theater);
   renderOtherFlights(state.otherFlights);
   // show/hide Other Aircraft section
   const otherSection = document.getElementById('other-section');
   if (otherSection) otherSection.style.display = state.otherFlights.length ? '' : 'none';
   ```
4. Wire collapse toggle for other-flight cards using the existing delegated event handler pattern (same `data-action="toggle-flight-from-head"` attribute on `.flight-head-left`). No handler changes needed.
5. In `clearMiz`: **required** — set `state.otherFlights = []`, call `renderOtherFlights([])` to clear the container, and set `document.getElementById('other-section').style.display = 'none'`. This is the only reset path for `otherFlights`; omitting it leaves stale cards visible after the user clears the mission.
6. Do NOT modify `allFlights()` in `js/utils.js`. That utility feeds `clearPersonalDtc` and `findFlightById`, which have no relevance to display-only other-aircraft flights. Other aircraft intentionally have no personal DTC or standalone mode.

---

## 5. Files Changed / Created

| File | Change |
|------|--------|
| `js/state.js` | Add `otherFlights: []` to initial state |
| `js/miz/extractor.js` | Add `extractOtherFlights()` |
| `js/ui/other-flight-cards.js` | **New** — `renderOtherFlights()` |
| `js/handlers.js` | Import + call both new functions; show/hide section; update `clearMiz` |
| `index.html` | Add Other Aircraft section inside `#results`; import new module |
| `styles.css` | Minimal or none — reuse existing `.flight-card` classes |

---

## 6. Out of Scope

- Editing waypoints or radio presets for other aircraft
- DTC export for any other aircraft type
- Filtering by coalition side
- Map integration for other aircraft waypoints
