// ========================================
// ALLEVIN MK XXIV — Shared Build Identity
// One constant is imported by both browser and server code so a deployed
// Home Screen app can prove that it is talking to the matching API build.
// ========================================

export const ALLEVIN_BUILD = {
   version: "0.24.0",
   mark: "MK XXIV",
   languageProtocol: "mkxxiv-reliable-follow-through-1",
} as const;
