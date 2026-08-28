// ========================================
// ALLEVIN MK XVII — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.17.2",
   mark: "MK XVII.2",
   languageProtocol: "mkxvii-contextual-copy-1",
} as const;
