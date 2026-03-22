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
    editors.js                    — setWaypointName, removeWaypoint, setWpType, setTargetData, setCommChannelField, setCmdsField, setF18NavSetting, setF18CommGuard, setF18TacanSelected
    modals.js                     — openFlightSelectDialogForDtc, selectFlightForPendingDtc, closeFlightSelectDialog

  map/
    map.js                        — ensureLeafletMap, openMapModal, showPreviewFlightMap, setMapTile

  handlers.js                     — handleMizFile, handleDtcFile, clearMiz, clearPersonalDtc, restoreMissionDtcForFlight,
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
- `handlers.js` (`restoreMissionDtcForFlight`) — restores from `flight.miz.waypoints`, `flight.miz.radio1/2`

**Read sites updated:** `renderFlights` (flight card top section reads `flight.miz.*`), `buildDtc`/`buildF18Dtc` fallback pattern.

---

## 5. Reducing F-16/F-18 Duplication

### 5a. Shared comm channel builder (`dtc/shared.js`)

Both aircraft loop channels 1–20, check merge options, and fall back to `flight.radio1/2`. This moves to a shared function:

```js
export function buildCommChannels(flight, personalComm1, personalComm2, mergeComms) {
  // returns { raw1, raw2 } — arrays of { freq, name, modulation, channel }
  // each builder formats into its own key/value shape
}
```

F-16 uses `Frequency`/`Name` keys. F-18 uses `frequency`/`name`/`modulation`. Both call `buildCommChannels` and format the result.

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

All `onclick=` attributes in HTML template strings are replaced with `data-action=` + relevant `data-*` attributes. A single delegated listener in `handlers.js` routes to the right function.

**Template strings (before):**
```html
<button onclick="removeWaypoint(this)">🗑</button>
<input oninput="setWaypointName(this)">
<button onclick="previewFlightButton(this)" data-family="f16" data-gid="...">
```

**Template strings (after):**
```html
<button data-action="remove-waypoint" data-gid="..." data-idx="...">🗑</button>
<input data-action="set-waypoint-name" data-gid="..." data-idx="...">
<button data-action="preview-flight" data-family="f16" data-gid="...">
```

**Delegated listener in `handlers.js`:**
```js
const ACTION_HANDLERS = {
  'remove-waypoint':    (e) => removeWaypoint(e.target.closest('[data-action]')),
  'set-waypoint-name':  (e) => setWaypointName(e.target),
  'preview-flight':     (e) => previewFlightButton(e.target.closest('[data-action]')),
  // ... all actions
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  ACTION_HANDLERS[el.dataset.action]?.(e);
});

document.addEventListener('change', e => { /* same pattern for change events */ });
document.addEventListener('input',  e => { /* same pattern for input events  */ });
```

All template-string-generating functions (`buildF16PreviewHtml`, `buildF18PreviewHtml`, `renderFlights`) are updated to emit `data-action` attributes instead of `onclick`/`oninput`/`onchange`.

---

## 7. CLAUDE.md Updates

The data separation invariant section in `CLAUDE.md` is updated to reflect the Option B naming (`flight.miz.*` instead of `flight._original*`). The "Planned: Option B refactor" note is removed as it will be complete.

---

## 8. Out of Scope

- No behavioral changes of any kind
- No new features
- No CSS redesign
- No introduction of TypeScript, a framework, or a bundler
- Per-flight DTC import merge option UI (`handleFlightImportDtcFile`) — retains existing behavior
