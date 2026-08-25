import { DAILY_RHYTHM_STORAGE_KEY } from "@/lib/dailyRhythm";
import { LIFE_STATE_STORAGE_KEY } from "@/lib/lifeStore";

const UNDO_STORAGE_KEY = "allevin-assistant-undo-mkxii";
const MAX_UNDO = 12;

interface UndoSnapshot {
   id: string;
   at: number;
   label: string;
   lifeState: string | null;
   rhythm: string | null;
}

function readUndo(): UndoSnapshot[] {
   if (typeof window === "undefined") return [];
   try {
      const value = JSON.parse(window.localStorage.getItem(UNDO_STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.slice(-MAX_UNDO) : [];
   } catch {
      return [];
   }
}

function writeUndo(items: UndoSnapshot[]) {
   if (typeof window === "undefined") return;
   window.localStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(items.slice(-MAX_UNDO)));
}

export function captureAssistantUndo(label: string) {
   if (typeof window === "undefined") return;
   const snapshot: UndoSnapshot = {
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      at: Date.now(),
      label: label.slice(0, 160),
      lifeState: window.localStorage.getItem(LIFE_STATE_STORAGE_KEY),
      rhythm: window.localStorage.getItem(DAILY_RHYTHM_STORAGE_KEY),
   };
   writeUndo([...readUndo(), snapshot]);
}

export function undoLastAssistantChange() {
   if (typeof window === "undefined") return { restored: false, label: "" };
   const history = readUndo();
   const snapshot = history.pop();
   if (!snapshot) return { restored: false, label: "" };

   if (snapshot.lifeState === null) window.localStorage.removeItem(LIFE_STATE_STORAGE_KEY);
   else window.localStorage.setItem(LIFE_STATE_STORAGE_KEY, snapshot.lifeState);

   if (snapshot.rhythm === null) window.localStorage.removeItem(DAILY_RHYTHM_STORAGE_KEY);
   else window.localStorage.setItem(DAILY_RHYTHM_STORAGE_KEY, snapshot.rhythm);

   writeUndo(history);
   window.dispatchEvent(new CustomEvent("allevin-life-state-updated"));
   window.dispatchEvent(new CustomEvent("allevin-daily-rhythm-updated"));
   return { restored: true, label: snapshot.label };
}

export function clearAssistantUndo() {
   if (typeof window !== "undefined") window.localStorage.removeItem(UNDO_STORAGE_KEY);
}
