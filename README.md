# DCS F-16 and F-18 DTC Tool

Parse DCS mission files and generate Data Transfer Cartridge (DTC) files for F-16C Viper and F/A-18C Lot 20 aircraft.

## Quick Start

1. **Open a mission file** — Click the "Mission File (.miz)" upload card or drag-and-drop your DCS `.miz` mission file
2. **Review flights** — The tool automatically extracts all F-16C and F/A-18C player flights with their data:
   - Waypoints (steerpoints) with altitude, speed, and location
   - Radio presets (COM1/UHF and COM2/VHF frequencies)
   - Countermeasure programs, EWS settings, and other avionics data
3. **Optional: Merge personal DTC** — Upload your own `.dtc` profile to merge personal radio/EWS/TACAN data into all exports
4. **Export DTC** — Two export paths are available per flight:
   - **Export Miz as DTC** — Quick export directly from the flight card using raw mission data
   - **Preview/Edit → Export Merged DTC** — Open the preview panel to review and edit, then export the fully merged DTC

## Features

### Mission Data Extraction
- **F-16C Flights** — Extracts steerpoints 1–25 from mission route data
- **F/A-18C Flights** — Extracts waypoints with custom labels and offset aimpoints
- **Radio Presets** — COM1 (UHF) and COM2 (VHF) frequencies with channel names
- **Countermeasures** — CMDS (chaff/flare) programs with burst quantity, salvo quantity, burst interval, and salvo interval — all editable before export
- **EWS Settings** — RWR mode flags and other electronic warfare data
- **Navigation Settings** — TACAN, ICLS, Bullseye, and Air-to-Air waypoint offsets

### Viewing & Editing
- **Inline preview** — See all DTC data in a formatted table before export; opening preview hides the quick-export button to avoid duplicate exports
- **Route maps** — Click "Map" to visualize mission waypoints vs. DTC steerpoints on an interactive map
- **Edit before export** — Modify waypoint names, altitudes, speeds, frequencies, and other data
- **Waypoint roles** — Change each steerpoint's role (STPT, IP, TGT, VRP, PUP, OA1, OA2) in the preview panel; roles are saved into the exported DTC and restored when that DTC is reimported as a personal profile
- **CMDS editing** — Edit countermeasure programs (Chaff/Flare burst quantity, salvo quantity, burst interval, salvo interval) directly in the preview panel; changes are reflected in the exported DTC
- **Custom export filename** — Each export button has an editable filename field pre-filled with the flight name; change it before exporting to control the output `.dtc` filename

### Personal DTC Merge
- Upload a saved personal `.dtc` profile from your DCS user folder
- The tool automatically merges CMDS, radio presets, and EWS data into all flight exports
- Keep your custom settings consistent across multiple mission DTCs
- **Clear buttons** — Both the mission file and personal DTC cards have a **✕ Clear** button to unload them independently without refreshing the page
- **Mission DTC chip** — When a mission contains a built-in default DTC, a chip appears on the flight card; click **View** to inspect it in the preview panel. If you've loaded a personal DTC that overrides it, the button changes to **Restore** — clicking it removes the personal DTC override and reverts the flight back to its mission defaults

## File Formats

### Input Files
- **`.miz`** — DCS mission file (ZIP archive containing `mission` Lua file)
- **`.dtc`** — Personal DTC profile (JSON format, optional)

### Output Files
- **`.dtc`** — Exported DTC file for a single flight, ready to import in DCS

## Workflow

### Typical Mission Export

```
1. Open your DCS mission (.miz)
2. Review the extracted F-16C/F-18 flights
3. For each flight you want to use:
   a. Quick export: edit the filename field and click "Export Miz as DTC"
      — OR —
   b. Click "Preview/Edit" to open the inline preview:
      - Review steerpoints, radio presets, and other settings
      - Edit waypoint roles, CMDS programs, frequencies as needed
      - Edit the filename field and click "Export Merged DTC"
      - Click "✕ Close" when done
4. In DCS Mission Editor:
   - Open your mission
   - Go to the flight settings
   - Import the .dtc file into the aircraft
   - Fly the mission!
```

### Merging Personal DTC

```
1. Export your personal DTC from DCS Mission Editor
2. Open this tool with your mission
3. Click the "Personal DTC Profile" card
4. Select your saved .dtc file
5. All flight exports will now include your custom radio/EWS/TACAN settings
6. A "✓ CMDS merged" indicator confirms the merge
```

## Coordinate System

The tool works with **DCS theater-relative coordinates** (X/Y in meters):
- Waypoints use raw DCS coordinates, not latitude/longitude
- Altitude is in meters MSL (or feet when exported to DTC)
- Each DCS theater (Caucasus, Syria, Persian Gulf, etc.) has its own origin offset

## F-16C vs F/A-18C

| Feature | F-16C | F/A-18C |
|---------|-------|---------|
| Steerpoints | 1–25 (DTC), 1–99 (mission) | 1–59 waypoints with labels |
| UHF Radio | 20 channels | 20 channels |
| VHF Radio | 20 channels | 20 channels |
| Countermeasures | CMDS Programs 1–6 | CMDS Programs 1–6 |
| Waypoint Labels | Auto-numbered | Custom 5-char labels |

## Troubleshooting

### Mission Won't Load
- Ensure the file is a valid DCS `.miz` (ZIP) file with a `mission` Lua file inside
- Try opening the mission in DCS Mission Editor first to verify it's not corrupted

### No Flights Found
- The mission must contain at least one **player-controlled** F-16C or F/A-18C flight
- Pre-planned flights and AI flights are not extracted
- Check the mission in DCS Mission Editor to confirm player flights exist

### DTC Import Fails in DCS
- Verify the aircraft type matches (F-16C or F/A-18C) in the exported DTC
- Check that frequencies are within valid ranges for your aircraft radio system
- Try importing the DTC in DCS Mission Editor instead of the in-game DTC selector

## Advanced

### Native DTC System (DCS 2.9.25.21123+)

DCS now supports native `.dtc` files embedded in `.miz` archives:
- If a mission contains a native DTC, the tool will prioritize NAV PTS data when available
- Steerpoints may differ between mission `route.points[]` and native DTC partition
- CMDS programs from a mission-embedded DTC are editable in the CMDS tab; edits are included in the exported file even without a personal DTC loaded
- Always verify your exported DTC matches the intended flight path

## Support

For issues or feature requests, check the project repository or CLAUDE.md for development notes.
