
# DCS Miz Tool — Modular Restructure Design

**Date:** 2026-03-22
**Status:** Approved
**Goal:** Reduce complexity of the 3,764-line `index.html` monolith by splitting into focused ES modules, eliminating F-16/F-18 duplication where safe, and completing the planned Option B flight object refactor.

---

## 1. Constraints

- Hosted on GitHub Pages — no server, no build step
- Native ES modules only (`<script type="module">`) — no Vite, no bundler
- No behavioral changes — this is a pure structural refactor
- F-16C and F/A-18C have distinct requirements; shared code only where logic is genuinely identical

---

## 2. File Structure

```
index.html                        — ~30-line shell: <head>, static HTML skeleton, <script type="module" src="js/handlers.js">
styles.css                        — all CSS extracted verbatim

js/
  state.js                        — single exported mutable state object
  utils.js                        — deepClone, escapeAttr, toDtcLat/Lon, wpTag, findFlightById, allFlights
  coords.js                       — dcsToLatLon, latDecimalMinutes, lonDecimalMinutes, DMS formatters

  miz/
    lua-parser.js                 — LuaParser class (tokenizer + parser)
    extractor.js                  — extractFlightsByType, extractTacanCandidates

  dtc/
    defaults.js                   — defaultF16Cmds, defaultF18NavSettings, defaultF18Alr67, F18_COMM_DEFAULT_FREQS, F18_NAV_RULES
    normalize.js                  — normalizeDtc (detects F-16/F-18, validates structure, extracts partitions)
    shared.js                     — buildCommChannels (shared 1–20 loop), getFlightCommName, setFlightCommName, ensureFlightCommNames
    builder-f16.js                — buildDtc, buildDtcNative, ensureF16CmdsPrograms
    builder-f18.js                — buildF18Dtc, buildF18DtcNative, fillF18CommDefaults, normalizeF18Alr67, ensureF18TacanSelection
    export.js                     — exportFlightDtc, download trigger, getDtcMergeParts

  ui/
    flight-cards.js               — renderFlights, updateSectionVisibility, rerenderFlightCards
    preview.js                    — previewDtc, closeInlinePreview, switchInlinePreviewTabBtn, buildPreviewShell
    preview-f16.js                — buildF16PreviewHtml
    preview-f18.js                — buildF18PreviewHtml
    editors.js                    — setWaypointName, removeWaypoint, setWpType, setTargetData, setCommChannelField,
                                    setCmdsField, setF18NavSetting, setF18CommGuard, setF18TacanSelected
    modals.js                     — openFlightSelectDialogForDtc, selectFlightForPendingDtc, closeFlightSelectDialog

  map/
    map.js                        — ensureLeafletMap, openMapModal, showPreviewFlightMap, setMapTile, closeFlightMap,
                                    removeWaypointFromMap, getMapState (accessor for _mapCurrentFlight/_mapCurrentFamily)

  handlers.js                     — handleMizFile, handleDtcFile, handleFlightImportDtcFile, importDtcForFlight,
                                    viewMissionDtcForFlight, clearMiz, clearPersonalDtc, restoreMissionDtcForFlight,
                                    createStandaloneFlight, assignPersonalDtcToFlight, DOM init, drag-drop wiring,
                                    top-level event delegation (data-action routing)
```

---

## 3. State Management

`state.js` exports a single mutable object — same shape as the current global `state`. Every module that reads or writes state imports it:

```js
import { state } from '../state.js';
```

No reactivity, no pub/sub. The shared object approach is consistent with the existing architecture and avoids introducing new patterns.

---

## 4. Option B Flight Object Refactor

The `_original*` naming convention is replaced with an explicit `miz` namespace on flight objects.

**Before:**
```js
flight._originalWaypoints
flight._originalRadio1
flight._originalRadio2
```

**After:**
```js
flight.miz.waypoints   // immutable snapshot of .miz route.points[]
flight.miz.radio1      // immutable snapshot of .miz Radio[1]
flight.miz.radio2      // immutable snapshot of .miz Radio[2]
```

**Standalone flights** (DTC loaded without a .miz) set `flight.miz = null`. Read sites use:
```js
flight.miz?.waypoints ?? flight.waypoints
flight.miz?.radio1    ?? flight.radio1
flight.miz?.radio2    ?? flight.radio2
```

**Affected creation paths:**
- `extractor.js` (`extractFlightsByType`) — sets `flight.miz = { waypoints: deepClone(waypoints), radio1: deepClone(radio1), radio2: deepClone(radio2) }`
- `handlers.js` (`createStandaloneFlight`) — sets `flight.miz = null`
- `handlers.js` (`restoreMissionDtcForFlight`) — guards with `if (flight.miz)` before restoring; restores `flight.waypoints = deepClone(flight.miz.waypoints)`, `flight.radio1 = deepClone(flight.miz.radio1)`, `flight.radio2 = deepClone(flight.miz.radio2)`. Standalone flights (`flight.miz === null`) skip the restore entirely, matching current behavior.

**Read sites updated:** `renderFlights` (flight card top section reads `flight.miz.*`), `buildDtc`/`buildF18Dtc` fallback pattern.

---

## 5. Reducing F-16/F-18 Duplication

### 5a. Shared comm channel builder (`dtc/shared.js`)

Both aircraft loop channels 1–20, check merge options, and fall back to `flight.radio1/2`. This moves to a shared function:

```js
export function buildCommChannels(flight, personalComm1, personalComm2, mergeComms) {
  // Returns { raw1, raw2 } — arrays indexed 1–20 of { freq, channel }
  // freq: personalComm freq (if mergeComms) ?? flight.radio1[i]
  // Does NOT include modulation or name — each builder sources those independently
}
```

**F-16 vs F-18 input difference:** `flight.radio1[i]` is a plain frequency float for both aircraft. `buildCommChannels` only extracts `freq` from the shared loop. F-16 builders format the result as `{ Frequency, Name }` (name from `getFlightCommName`). F-18 builders format as `{ frequency, name, modulation }` — modulation is sourced from `personalComm[i].modulation ?? 0` in the F-18 builder after calling `buildCommChannels`, not inside the shared function. This keeps the shared function free of aircraft-specific fields.

### 5b. Shared preview shell (`ui/preview.js`)

Both preview builders produce the same outer structure: header bar (title, Restore/Map/Export/Close buttons), tab strip, tab content area. This is extracted as:

```js
export function buildPreviewShell(flight, family, tabs, activeTab, bodyHtml)
```

`preview-f16.js` and `preview-f18.js` call `buildPreviewShell` with their own tab definitions and body HTML. All aircraft-specific content (steerpoints, CMDS programs, NAV settings, ALR-67, TACAN) remains in the respective file.

### 5c. What stays separate

| F-16 only | F-18 only |
|-----------|-----------|
| Steerpoints 1–25 with point types (STPT/IP/TGT/VRP/PUP/OA1/OA2) | Waypoints 1–59 with 5-char labels and offset aimpoints |
| CMDS programs (MAN1–6, BurstQuantity/SalvoQuantity) | ALR-67 programs (Chaff Qty/Repeat/Interval, Flare Qty) |
| EWS/RWR passthrough | TACAN candidate selection |
| MPD/ELINT export partitions | NAV Settings (TACAN, ICLS, ACLS, AA Waypoint) |

---

## 6. Module Communication — Event Delegation

All `onclick=`, `oninput=`, and `onchange=` attributes are replaced with `data-action=` + relevant `data-*` attributes. This covers both template-string-generated HTML and the static HTML shell. A single delegated listener in `handlers.js` routes to the right function.

**Static HTML shell** — modal close buttons, map tile buttons, and map close button in `index.html` are converted to `data-action` attributes. `handlers.js` attaches the delegated listener after `DOMContentLoaded`, so these are handled without any globals remaining.

**Template strings (before):**
```html
<button onclick="removeWaypoint(this)">🗑</button>
<input oninput="setWaypointName(this)">
<button onclick="previewFlightButton(this)" data-family="f16" data-gid="...">
<button onclick="closeFlightSelectDialog()">✕</button>
<button onclick="setMapTile('dark')">Dark</button>
```

**Template strings and static HTML (after):**
```html
<button data-action="remove-waypoint" data-gid="..." data-idx="...">🗑</button>
<input data-action="set-waypoint-name" data-gid="..." data-idx="...">
<button data-action="preview-flight" data-family="f16" data-gid="...">
<button data-action="close-flight-select">✕</button>
<button data-action="set-map-tile" data-tile="dark">Dark</button>
```

**Delegated listener in `handlers.js`:**
```js
const ACTION_HANDLERS = {
  'remove-waypoint':      (e) => removeWaypoint(e.target.closest('[data-action]')),
  'set-waypoint-name':    (e) => setWaypointName(e.target),
  'preview-flight':       (e) => previewFlightButton(e.target.closest('[data-action]')),
  'close-flight-select':  ()  => closeFlightSelectDialog(),
  'set-map-tile':         (e) => setMapTile(e.target.closest('[data-action]').dataset.tile),
  // ... all actions
};

document.addEventListener('click',  e => { const el = e.target.closest('[data-action]'); ACTION_HANDLERS[el?.dataset.action]?.(e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-action]'); ACTION_HANDLERS[el?.dataset.action]?.(e); });
document.addEventListener('input',  e => { const el = e.target.closest('[data-action]'); ACTION_HANDLERS[el?.dataset.action]?.(e); });
```

---

## 7. Map Module — Internal State

`map/map.js` maintains module-scoped `_mapCurrentFlight` and `_mapCurrentFamily` variables (set when a map is opened). It exports a `getMapState()` accessor:

```js
export function getMapState() {
  return { flight: _mapCurrentFlight, family: _mapCurrentFamily };
}
```

`removeWaypointFromMap` lives in `map/map.js` alongside the other map functions, using `_mapCurrentFlight` and `_mapCurrentFamily` directly. It calls `previewDtc` (imported from `ui/preview.js`) and `showPreviewFlightMap` (local). This avoids a circular dependency: `map.js` imports from `ui/preview.js`, but `ui/preview.js` does not import from `map.js`.

---

## 8. CLAUDE.md Updates

The data separation invariant section in `CLAUDE.md` is updated to reflect the Option B naming (`flight.miz.*` instead of `flight._original*`). The "Planned: Option B refactor" note is removed as it will be complete.

---

## 9. Out of Scope

- No behavioral changes of any kind
- No new features
- No CSS redesign
- No introduction of TypeScript, a framework, or a bundler
