// ========================================
// ALLEVIN MK XIX — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.19.1",
   mark: "MK XIX",
   languageProtocol: "mkxix-recurring-care-2",
} as const;
