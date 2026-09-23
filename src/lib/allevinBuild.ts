// ========================================
// ALLEVIN MK XXV — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.25.1",
   mark: "MK XXV",
   languageProtocol: "mkxxv-reliable-reminders-1",
} as const;
