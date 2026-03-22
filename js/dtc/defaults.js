export function defaultF16Cmds() {
  const prog = (cBQ, cSQ, cBI, cSI, fBQ, fSQ) => ({
    Chaff: { BurstQuantity: cBQ, SalvoQuantity: cSQ, BurstInterval: cBI, SalvoInterval: cSI },
    Flare: { BurstQuantity: fBQ, SalvoQuantity: fSQ, BurstInterval: cBI, SalvoInterval: cSI },
  });
  return {
    MAN_1: prog(1, 1, 0.020, 1.0,  1, 1),
    MAN_2: prog(1, 1, 0.020, 0.5,  0, 0),
    MAN_3: prog(1, 1, 0.050, 1.0,  1, 1),
    MAN_4: prog(2, 1, 0.020, 0.5,  0, 0),
    MAN_5: prog(2, 1, 0.020, 1.0,  2, 1),
    MAN_6: prog(2, 1, 0.050, 2.0,  2, 1),
    AUTO_1: prog(1, 1, 0.020, 1.5, 0, 0),
    AUTO_2: prog(1, 1, 0.020, 1.0, 0, 0),
    AUTO_3: prog(1, 1, 0.020, 0.5, 0, 0),
    BYP:    prog(2, 1, 0.020, 0.5, 2, 1),
  };
}

export function defaultF18NavSettings() {
  return {
    AA_Waypoint: { AA_WP_Enabled: false, AA_WP_Number: 59 },
    ACLS: { Frequency: 225, OnOff: false },
    Altitude_Warning: { Warn_Alt_Baro: 2000, Warn_Alt_Rdr: 500 },
    Home_Waypoint: { FPAS_HOME_WP: 1 },
    ICLS: { Channel: 1, OnOff: false },
    TACAN: { Channel: 1, ChannelMode: 1, Mode: 2, OnOff: false },
  };
}

export function defaultF18Alr67() {
  return {
    CMDS: {
      CMDSProgramSettings: {
        AUTO_1: { Chaff: { Interval: 1.5, Quantity: 1, Repeat: 4 }, Flare: { Quantity: 0 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        AUTO_2: { Chaff: { Interval: 1, Quantity: 1, Repeat: 6 }, Flare: { Quantity: 0 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        AUTO_3: { Chaff: { Interval: 0.5, Quantity: 1, Repeat: 8 }, Flare: { Quantity: 0 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        BYP: { Chaff: { Interval: 1, Quantity: 2, Repeat: 1 }, Flare: { Quantity: 2 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        delay_between_programs: 0,
        MAN_1: { Chaff: { Interval: 1, Quantity: 1, Repeat: 10 }, Flare: { Quantity: 1 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        MAN_2: { Chaff: { Interval: 0.5, Quantity: 1, Repeat: 10 }, Flare: { Quantity: 1 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        MAN_3: { Chaff: { Interval: 1, Quantity: 2, Repeat: 5 }, Flare: { Quantity: 2 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        MAN_4: { Chaff: { Interval: 0.5, Quantity: 2, Repeat: 10 }, Flare: { Quantity: 2 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        MAN_5: { Chaff: { Interval: 1, Quantity: 1, Repeat: 2 }, Flare: { Quantity: 1 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
        MAN_6: { Chaff: { Interval: 0.75, Quantity: 2, Repeat: 20 }, Flare: { Quantity: 2 }, Other1: { Quantity: 0 }, Other2: { Quantity: 0 } },
      },
      CMDS_Threat_table: {
        Air: {},
        CMDS_Avionics_Threat_Table: [],
        Ground: {},
        Naval: {},
        Other: {},
      },
    },
    RWR: {
      AAA: {},
      AI: {},
      FRND: {},
      NORM: {},
      UNK: {},
      RWR_Avionics_Threat_Table: {
        AAA: [],
        AI: [],
        FRND: [],
        NORM: [],
        UNK: [],
      },
    },
  };
}

export const F18_COMM_DEFAULT_FREQS = {
  1: 305, 2: 264, 3: 265, 4: 256, 5: 254,
  6: 250, 7: 270, 8: 257, 9: 255, 10: 262,
  11: 259, 12: 268, 13: 269, 14: 260, 15: 263,
  16: 261, 17: 267, 18: 251, 19: 253, 20: 266,
};

export const F18_NAV_RULES = {
  'AA_Waypoint.AA_WP_Number':      { kind: 'int', min: 1, max: 59, step: 1 },
  'ACLS.Frequency':                { kind: 'int', min: 200, max: 400, step: 1 },
  'Altitude_Warning.Warn_Alt_Baro':{ kind: 'int', min: 0, max: 50000, step: 100 },
  'Altitude_Warning.Warn_Alt_Rdr': { kind: 'int', min: 0, max: 5000, step: 10 },
  'Home_Waypoint.FPAS_HOME_WP':    { kind: 'int', min: 1, max: 59, step: 1 },
  'ICLS.Channel':                  { kind: 'int', min: 1, max: 20, step: 1 },
  'TACAN.Channel':                 { kind: 'int', min: 1, max: 126, step: 1 },
  'TACAN.ChannelMode':             { kind: 'enum', options: [
    { value: 0, label: '0 (X)' },
    { value: 1, label: '1 (Y)' },
  ] },
  'TACAN.Mode':                    { kind: 'enum', options: [
    { value: 0, label: '0 (REC)' },
    { value: 1, label: '1 (TR)' },
    { value: 2, label: '2 (A/A TR)' },
  ] },
};
