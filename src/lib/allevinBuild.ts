// ========================================
// ALLEVIN MK XVII — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.18.0",
   mark: "MK XVIII",
   languageProtocol: "mkxviii-human-assistant-1",
} as const;
