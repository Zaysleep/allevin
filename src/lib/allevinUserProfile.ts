// ========================================
// ALLEVIN MK XII — Local Profile
// A tiny local-only preference used for greetings and Kin tone.
// ========================================

import { KIN_CONVERSATION_STORAGE_KEY } from "@/lib/kinConversation";
import { clearLifeState, LIFE_STATE_UPDATED_EVENT } from "@/lib/lifeStore";
import { ALLEVIN_PUSH_DEVICE_ID_KEY } from "@/lib/allevinServerPushClient";
import { DAILY_RHYTHM_UPDATED_EVENT } from "@/lib/dailyRhythm";

export type AllevinUserProfile = {
   displayName: string;
   startedAt: number;
};

export const ALLEVIN_USER_PROFILE_STORAGE_KEY = "allevin-user-profile";

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
   if (typeof window === "undefined") return null;
   try {
      const parsed = JSON.parse(window.localStorage.getItem(ALLEVIN_USER_PROFILE_STORAGE_KEY) || "null");
      const displayName = cleanProfileName(parsed?.displayName);
      if (!displayName) return null;
      return { displayName, startedAt: typeof parsed?.startedAt === "number" ? parsed.startedAt : Date.now() };
   } catch {
      return null;
   }
}

export function getAllevinDisplayName(fallback = "there") {
   return getAllevinUserProfile()?.displayName || fallback;
}

export function saveAllevinUserProfile(displayName: string) {
   if (typeof window === "undefined") return null;
   const cleanName = cleanProfileName(displayName);
   if (!cleanName) return null;
   const profile: AllevinUserProfile = { displayName: cleanName, startedAt: getAllevinUserProfile()?.startedAt || Date.now() };
   window.localStorage.setItem(ALLEVIN_USER_PROFILE_STORAGE_KEY, JSON.stringify(profile));
   window.dispatchEvent(new CustomEvent("allevin-user-profile-update", { detail: profile }));
   return profile;
}

export function resetAllevinLifeWorkspace({ preserveProfile = false }: { preserveProfile?: boolean } = {}) {
   if (typeof window === "undefined") return;

   const profile = preserveProfile ? window.localStorage.getItem(ALLEVIN_USER_PROFILE_STORAGE_KEY) : null;

   // Personal Alpha owns several local-first stores (life, rhythm, reality,
   // recommendations, lifestyle, conversation, notification log). "Clear
   // ALLEVIN data" should therefore clear the whole product namespace rather
   // than leaving half of the assistant's memory behind.
   const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index))
      .filter((key): key is string => Boolean(key && (key.startsWith("allevin-") || key.startsWith("allevin:"))))
      // Keep the stable transport identity long enough for the normal state
      // listeners to replace the existing server push plan with an empty one.
      // Deleting it here would orphan the old plan under an unreachable id.
      .filter((key) => key !== ALLEVIN_PUSH_DEVICE_ID_KEY);

   for (const key of keys) window.localStorage.removeItem(key);

   if (profile) window.localStorage.setItem(ALLEVIN_USER_PROFILE_STORAGE_KEY, profile);

   // Keep the old explicit calls/events for components that already listen to
   // these update channels.
   clearLifeState();
   window.localStorage.removeItem(KIN_CONVERSATION_STORAGE_KEY);
   window.dispatchEvent(new CustomEvent(LIFE_STATE_UPDATED_EVENT));
   window.dispatchEvent(new CustomEvent(DAILY_RHYTHM_UPDATED_EVENT));
   window.dispatchEvent(new CustomEvent("allevin-user-profile-update", { detail: null }));
   window.dispatchEvent(new CustomEvent("allevin-kin-conversation-updated"));
}
