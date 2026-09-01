// ========================================
// ALLEVIN MK XX — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.20.1",
   mark: "MK XX",
   languageProtocol: "mkxx-reminder-intelligence-2",
} as const;
