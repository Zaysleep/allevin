// ========================================
// ALLEVIN MK VI Tester Profile Helper
// Purpose:
// Lightweight local-only profile and tester workspace reset utilities.
// Testers do not need accounts. Their name and workspace stay in their browser.
// ========================================

export type AllevinUserProfile = {
   displayName: string;
   startedAt: number;
   testingMode: boolean;
};

export const ALLEVIN_USER_PROFILE_STORAGE_KEY = "allevin-user-profile";

const TESTER_WORKSPACE_STORAGE_KEYS = [
   // Current MK VI workspace data
   "allevin-adaptive-work-canvas",
   "allevin-project-library",
   "allevin-project-materials-mkvi",
   "allevin-calendar-events-mki",
   "allevin-cognition-state",
   "allevin-cognition-active-response-mode",

   // Project memory / guidance data
   "allevin-mkii-project-memory",
   "allevin-project-memory",
   "allevin-global-workflow-timeline",
   "allevin-thread-memory-v2",
   "allevin-project-deleted",
   "allevin-project-deleted-keys",

   // Legacy cleanup keys kept so old tester data does not resurface
   "allevin-internal-output-hub",
   "allevin-project-tracking-map",
   "allevin-calendar-notes-mki",
   "allevin-calendar-deleted-events",
   "allevin-calendar-deleted-keys",
   "allevin-thread-recovery-deleted",
   "allevin-thread-recovery-deleted-keys",
   "allevin-direct-calendar-approval-guard",
];

function cleanProfileName(value?: string) {
   return (value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
}

export function getAllevinUserProfile(): AllevinUserProfile | null {
   if (typeof window === "undefined") {
      return null;
   }

   try {
      const stored = window.localStorage.getItem(ALLEVIN_USER_PROFILE_STORAGE_KEY);

      if (!stored) {
         return null;
      }

      const parsed = JSON.parse(stored);

      const displayName = cleanProfileName(parsed?.displayName);

      if (!displayName) {
         return null;
      }

      return {
         displayName,
         startedAt: typeof parsed?.startedAt === "number" ? parsed.startedAt : Date.now(),
         testingMode: parsed?.testingMode !== false,
      };
   } catch {
      window.localStorage.removeItem(ALLEVIN_USER_PROFILE_STORAGE_KEY);

      return null;
   }
}

export function getAllevinDisplayName(fallback = "there") {
   return getAllevinUserProfile()?.displayName || fallback;
}

export function hasAllevinUserProfile() {
   return Boolean(getAllevinUserProfile()?.displayName);
}

export function saveAllevinUserProfile(displayName: string) {
   if (typeof window === "undefined") {
      return null;
   }

   const cleanName = cleanProfileName(displayName);

   if (!cleanName) {
      return null;
   }

   const profile: AllevinUserProfile = {
      displayName: cleanName,
      startedAt: Date.now(),
      testingMode: true,
   };

   window.localStorage.setItem(ALLEVIN_USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));

   window.dispatchEvent(new CustomEvent("allevin-user-profile-update", { detail: profile }));

   return profile;
}

export function clearAllevinUserProfile() {
   if (typeof window === "undefined") {
      return;
   }

   window.localStorage.removeItem(ALLEVIN_USER_PROFILE_STORAGE_KEY);

   window.dispatchEvent(new CustomEvent("allevin-user-profile-update"));
}

export function resetAllevinTesterWorkspace({ preserveProfile = true }: { preserveProfile?: boolean } = {}) {
   if (typeof window === "undefined") {
      return;
   }

   const profile = preserveProfile ? window.localStorage.getItem(ALLEVIN_USER_PROFILE_STORAGE_KEY) : null;

   TESTER_WORKSPACE_STORAGE_KEYS.forEach((key) => {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
   });

   if (!preserveProfile) {
      window.localStorage.removeItem(ALLEVIN_USER_PROFILE_STORAGE_KEY);
   } else if (profile) {
      window.localStorage.setItem(ALLEVIN_USER_PROFILE_STORAGE_KEY, profile);
   }

   window.dispatchEvent(new CustomEvent("allevin-workspace-reset"));
   window.dispatchEvent(new CustomEvent("allevin-project-library-update"));
   window.dispatchEvent(new CustomEvent("allevin-project-memory-update"));
   window.dispatchEvent(new CustomEvent("allevin-project-materials-update"));
   window.dispatchEvent(new CustomEvent("allevin-memory-update"));
   window.dispatchEvent(new CustomEvent("allevin-calendar-events-updated", { detail: { source: "tester-reset" } }));
   window.dispatchEvent(new Event("storage"));
}
