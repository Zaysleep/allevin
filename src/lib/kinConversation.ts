// ========================================
// ALLEVIN MK XII — Kin Conversation
// Lightweight local continuity for the persistent Kin assistant.
// ========================================

export type KinMessageRole = "user" | "assistant";

export interface KinMessage {
   id: string;
   role: KinMessageRole;
   content: string;
   createdAt: number;
}

export const KIN_CONVERSATION_STORAGE_KEY = "allevin-kin-conversation-mkxii";
export const KIN_CONVERSATION_UPDATED_EVENT = "allevin-kin-conversation-updated";

function makeId() {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `kin-${crypto.randomUUID()}`;
   return `kin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clean(value: unknown, limit = 5000) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, limit);
}

export function readKinConversation(): KinMessage[] {
   if (typeof window === "undefined") return [];
   try {
      const parsed = JSON.parse(window.localStorage.getItem(KIN_CONVERSATION_STORAGE_KEY) || "[]");
      if (!Array.isArray(parsed)) return [];
      return parsed
         .map((message) => ({
            id: clean(message?.id, 180) || makeId(),
            role: message?.role === "user" ? ("user" as const) : ("assistant" as const),
            content: clean(message?.content),
            createdAt: typeof message?.createdAt === "number" ? message.createdAt : Date.now(),
         }))
         .filter((message) => message.content)
         .slice(-50);
   } catch {
      return [];
   }
}

export function appendKinMessage(role: KinMessageRole, content: string) {
   if (typeof window === "undefined") return [];
   const safe = clean(content);
   if (!safe) return readKinConversation();
   const messages = [...readKinConversation(), { id: makeId(), role, content: safe, createdAt: Date.now() }].slice(-50);
   window.localStorage.setItem(KIN_CONVERSATION_STORAGE_KEY, JSON.stringify(messages));
   window.dispatchEvent(new CustomEvent(KIN_CONVERSATION_UPDATED_EVENT));
   return messages;
}

export function clearKinConversation() {
   if (typeof window === "undefined") return;
   window.localStorage.removeItem(KIN_CONVERSATION_STORAGE_KEY);
   window.dispatchEvent(new CustomEvent(KIN_CONVERSATION_UPDATED_EVENT));
}
