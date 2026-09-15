// ========================================
// ALLEVIN MK XXV — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.25.0",
   mark: "MK XXV",
   languageProtocol: "mkxxv-personal-interests-1",
} as const;
