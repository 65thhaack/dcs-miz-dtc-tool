export const state = {
  theater: 'Caucasus',
  missionName: '',
  f16Flights: [],
  f18Flights: [],
  assets: [], // tankers, AWACS, carriers, ships
  airdromes: [], // airfield data extracted from mission
  tacanCandidates: [],
  missionDtcMap: {}, // mission DTCs from DTC/ folder, keyed by filename (without .dtc)
  personalDtc:   null,
  pendingPersonalDtc: null,
  pendingImportTarget: null,
  previewDtc:    null,
};
