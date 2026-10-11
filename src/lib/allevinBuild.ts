// ========================================
// ALLEVIN MK XXVI — Adaptive Day / Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.26.0",
   mark: "MK XXVI",
   languageProtocol: "mkxxvi-adaptive-day-1",
} as const;
