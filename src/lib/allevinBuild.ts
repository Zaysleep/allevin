// ========================================
// ALLEVIN MK XXI — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.21.0",
   mark: "MK XXI",
   languageProtocol: "mkxxi-setup-reset-1",
} as const;
