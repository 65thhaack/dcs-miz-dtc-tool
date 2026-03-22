export const state = {
  theater: 'Caucasus',
  missionName: '',
  f16Flights: [],
  f18Flights: [],
  tacanCandidates: [],
  missionDtcMap: {}, // mission DTCs from DTC/ folder, keyed by filename (without .dtc)
  personalDtc:   null,
  pendingPersonalDtc: null,
  pendingImportTarget: null,
  previewDtc:    null,
};
