// ========================================
// ALLEVIN MK XI Project Work Journal
// Purpose:
// Keep user-facing project updates as a calm, structured project log that both
// Projects and AIDock can read without exposing internal reasoning machinery.
// ========================================

export const ALLEVIN_PROJECT_WORK_JOURNAL_STORAGE_KEY = "allevin-project-work-journal-mkxi";
export const ALLEVIN_PROJECT_WORK_JOURNAL_UPDATED_EVENT = "allevin-project-work-journal-update";

export type ProjectWorkJournalKind = "update" | "decision" | "open-option" | "blocker" | "resolved" | "question" | "note";
export type ProjectWorkJournalSource = "user" | "aidock" | "project";

export interface ProjectWorkJournalEntry {
   id: string;
   projectId: string;
   projectTitle: string;
   milestoneId: string;
   milestoneTitle: string;
   kind: ProjectWorkJournalKind;
   text: string;
   source: ProjectWorkJournalSource;
   createdAt: number;
}

interface ProjectWorkJournalState {
   version: "MK XI";
   entries: ProjectWorkJournalEntry[];
   updatedAt: number;
}

const LIMITS = {
   id: 220,
   title: 180,
   text: 4000,
} as const;

function clean(value?: string, limit: number = LIMITS.text) {
   const text = (value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r/g, "\n")
      .trim();

   return text.length > limit ? text.slice(0, limit).trim() : text;
}

function cleanId(value?: string) {
   return clean(value, LIMITS.id)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .trim();
}

function cleanTitle(value?: string) {
   return clean(value, LIMITS.title).replace(/\n+/g, " ").trim();
}

function normalize(value?: string) {
   return clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function createId(prefix: string) {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
   return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isKind(value: unknown): value is ProjectWorkJournalKind {
   return value === "update" || value === "decision" || value === "open-option" || value === "blocker" || value === "resolved" || value === "question" || value === "note";
}

function isSource(value: unknown): value is ProjectWorkJournalSource {
   return value === "user" || value === "aidock" || value === "project";
}

function sanitizeEntry(value: Partial<ProjectWorkJournalEntry>): ProjectWorkJournalEntry | null {
   const text = clean(value.text);
   const projectTitle = cleanTitle(value.projectTitle);
   const projectId = cleanId(value.projectId) || normalize(projectTitle).replace(/\s+/g, "-");
   const milestoneTitle = cleanTitle(value.milestoneTitle);
   const milestoneId = cleanId(value.milestoneId) || normalize(milestoneTitle).replace(/\s+/g, "-");

   if (!text || (!projectId && !projectTitle)) return null;

   return {
      id: cleanId(value.id) || createId("work"),
      projectId,
      projectTitle,
      milestoneId,
      milestoneTitle,
      kind: isKind(value.kind) ? value.kind : "update",
      text,
      source: isSource(value.source) ? value.source : "user",
      createdAt: typeof value.createdAt === "number" && Number.isFinite(value.createdAt) && value.createdAt > 0 ? value.createdAt : Date.now(),
   };
}

function emptyState(): ProjectWorkJournalState {
   return { version: "MK XI", entries: [], updatedAt: Date.now() };
}

export function readProjectWorkJournalState(): ProjectWorkJournalState {
   if (typeof window === "undefined") return emptyState();

   try {
      const raw = localStorage.getItem(ALLEVIN_PROJECT_WORK_JOURNAL_STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed = JSON.parse(raw);
      const entries = Array.isArray(parsed?.entries)
         ? parsed.entries.map((item: Partial<ProjectWorkJournalEntry>) => sanitizeEntry(item)).filter(Boolean)
         : [];
      return {
         version: "MK XI",
         entries: entries as ProjectWorkJournalEntry[],
         updatedAt: typeof parsed?.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now(),
      };
   } catch {
      return emptyState();
   }
}

function writeProjectWorkJournalState(state: ProjectWorkJournalState) {
   if (typeof window === "undefined") return;

   const safeEntries = state.entries
      .map((item) => sanitizeEntry(item))
      .filter(Boolean)
      .slice(-600) as ProjectWorkJournalEntry[];

   const next: ProjectWorkJournalState = {
      version: "MK XI",
      entries: safeEntries,
      updatedAt: Date.now(),
   };

   localStorage.setItem(ALLEVIN_PROJECT_WORK_JOURNAL_STORAGE_KEY, JSON.stringify(next));
   window.dispatchEvent(new CustomEvent(ALLEVIN_PROJECT_WORK_JOURNAL_UPDATED_EVENT, { detail: { updatedAt: next.updatedAt } }));
   window.dispatchEvent(new CustomEvent("allevin-project-state-update", { detail: { source: "project-work-journal", updatedAt: next.updatedAt } }));
}

function projectMatches(projectId: string, projectTitle: string, item: Pick<ProjectWorkJournalEntry, "projectId" | "projectTitle">) {
   const id = cleanId(projectId);
   const itemId = cleanId(item.projectId);
   if (id && itemId) return id === itemId;
   return Boolean(normalize(projectTitle) && normalize(item.projectTitle) === normalize(projectTitle));
}

function milestoneMatches(milestoneId: string, milestoneTitle: string, item: Pick<ProjectWorkJournalEntry, "milestoneId" | "milestoneTitle">) {
   const id = cleanId(milestoneId);
   const itemId = cleanId(item.milestoneId);
   if (id && itemId) return id === itemId;
   return Boolean(normalize(milestoneTitle) && normalize(item.milestoneTitle) === normalize(milestoneTitle));
}

export function readProjectWorkJournal(projectId: string, projectTitle: string) {
   return readProjectWorkJournalState().entries
      .filter((item) => projectMatches(projectId, projectTitle, item))
      .sort((a, b) => a.createdAt - b.createdAt);
}

export function readProjectMilestoneWorkJournal(projectId: string, projectTitle: string, milestoneId: string, milestoneTitle: string) {
   return readProjectWorkJournal(projectId, projectTitle)
      .filter((item) => milestoneMatches(milestoneId, milestoneTitle, item))
      .sort((a, b) => a.createdAt - b.createdAt);
}

export function appendProjectWorkJournalEntry(input: Omit<ProjectWorkJournalEntry, "id" | "createdAt"> & { createdAt?: number }) {
   const state = readProjectWorkJournalState();
   const entry = sanitizeEntry({ ...input, id: createId("work"), createdAt: input.createdAt || Date.now() });
   if (!entry) return null;

   const duplicate = [...state.entries]
      .reverse()
      .find(
         (item) =>
            projectMatches(entry.projectId, entry.projectTitle, item) &&
            milestoneMatches(entry.milestoneId, entry.milestoneTitle, item) &&
            item.kind === entry.kind &&
            normalize(item.text) === normalize(entry.text) &&
            Math.abs(entry.createdAt - item.createdAt) < 5 * 60_000,
      );

   if (duplicate) return duplicate;

   state.entries.push(entry);
   writeProjectWorkJournalState(state);
   return entry;
}

export function stripMilestoneCheckpointPrefix(value?: string) {
   return clean(value, 1800)
      .replace(/^A supported answer is recorded for:\s*/i, "")
      .replace(/^A supported answer is recorded for\s*/i, "")
      .trim();
}

export function formatMilestoneCheckpoint(value?: string) {
   const text = stripMilestoneCheckpointPrefix(value).replace(/[.!?]+$/, "").trim();
   if (!text) return "";
   if (/^(?:what|which|who|where|when|why|how|is|are|do|does|did|can|could|should|would|will|has|have)\b/i.test(text)) return `${text}?`;
   return text;
}

export function formatWorkJournalForIntelligence(entries: ProjectWorkJournalEntry[]) {
   return entries
      .slice(-30)
      .map((entry) => {
         const label =
            entry.kind === "decision"
               ? "Decision"
               : entry.kind === "open-option"
                 ? "Open option"
                 : entry.kind === "blocker"
                   ? "Blocker"
                   : entry.kind === "resolved"
                     ? "Resolved"
                     : entry.kind === "question"
                       ? "Question"
                       : "Update";
         return `${label}: ${entry.text}`;
      })
      .join("\n");
}
