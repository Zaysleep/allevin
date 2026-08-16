// ========================================
// ALLEVIN MK XI Project Lead Memory
// Purpose:
// Durable project-scoped memory for explicit decisions, rejected/superseded
// directions, and conversational progress updates.
//
// Rules:
// - Project identity is always supplied by the canonical Project State.
// - Explicit user commitments may be saved immediately; ALLEVIN does not turn
//   tentative language into a confirmed decision.
// - Reversals preserve history by superseding rather than deleting.
// - Progress memory never marks a milestone complete on its own.
// ========================================

export const ALLEVIN_PROJECT_LEAD_MEMORY_STORAGE_KEY = "allevin-project-lead-memory-mkxi";
export const ALLEVIN_PROJECT_LEAD_MEMORY_UPDATED_EVENT = "allevin-project-lead-memory-update";

export type ProjectLeadDecisionStatus = "confirmed" | "unresolved" | "assumed" | "rejected" | "superseded";
export type ProjectLeadMemorySource = "conversation" | "project" | "material" | "system";
export type ProjectLeadProgressKind = "progress" | "blocker" | "outcome" | "note";

export interface ProjectLeadDecisionRecord {
   id: string;
   projectId: string;
   projectTitle: string;
   statement: string;
   topic: string;
   status: ProjectLeadDecisionStatus;
   rationale: string;
   evidence: string[];
   affects: string[];
   source: ProjectLeadMemorySource;
   supersedesId?: string;
   supersededById?: string;
   createdAt: number;
   updatedAt: number;
}

export interface ProjectLeadProgressRecord {
   id: string;
   projectId: string;
   projectTitle: string;
   summary: string;
   kind: ProjectLeadProgressKind;
   milestoneTitle: string;
   source: ProjectLeadMemorySource;
   createdAt: number;
}

export interface ProjectLeadMemoryState {
   version: "MK XI";
   decisions: ProjectLeadDecisionRecord[];
   progress: ProjectLeadProgressRecord[];
   updatedAt: number;
}

export interface RecordProjectLeadDecisionInput {
   projectId: string;
   projectTitle: string;
   statement: string;
   status: ProjectLeadDecisionStatus;
   topic?: string;
   rationale?: string;
   evidence?: string[];
   affects?: string[];
   source?: ProjectLeadMemorySource;
   supersedesId?: string;
}

const MEMORY_LIMITS = {
   title: 180,
   id: 220,
   statement: 1800,
   rationale: 2400,
   topic: 240,
   evidence: 900,
} as const;

function clean(value?: string, limit: number = MEMORY_LIMITS.statement) {
   const text = (value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r/g, "\n")
      .trim();

   return text.length > limit ? text.slice(0, limit).trim() : text;
}

function cleanTitle(value?: string) {
   return clean(value, MEMORY_LIMITS.title).replace(/\n+/g, " ").trim();
}

function cleanId(value?: string) {
   return clean(value, MEMORY_LIMITS.id)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .trim();
}

function normalize(value?: string) {
   return clean(value, MEMORY_LIMITS.statement)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function uniqueStrings(values?: string[], limit = 12, itemLimit: number = MEMORY_LIMITS.evidence) {
   const seen = new Set<string>();
   const result: string[] = [];

   for (const value of values || []) {
      const item = clean(value, itemLimit);
      const key = normalize(item);
      if (!item || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
      if (result.length >= limit) break;
   }

   return result;
}

function safeNow(value?: number) {
   return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : Date.now();
}

function createId(prefix: string) {
   if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `${prefix}-${crypto.randomUUID()}`;
   return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeDecision(value: Partial<ProjectLeadDecisionRecord>): ProjectLeadDecisionRecord | null {
   const statement = clean(value.statement, MEMORY_LIMITS.statement);
   const projectTitle = cleanTitle(value.projectTitle);
   const projectId = cleanId(value.projectId) || normalize(projectTitle).replace(/\s+/g, "-");

   if (!statement || (!projectId && !projectTitle)) return null;

   const status: ProjectLeadDecisionStatus =
      value.status === "confirmed" || value.status === "unresolved" || value.status === "assumed" || value.status === "rejected" || value.status === "superseded" ? value.status : "unresolved";

   return {
      id: cleanId(value.id) || createId("decision"),
      projectId,
      projectTitle,
      statement,
      topic: clean(value.topic, MEMORY_LIMITS.topic) || inferDecisionTopic(statement),
      status,
      rationale: clean(value.rationale, MEMORY_LIMITS.rationale),
      evidence: uniqueStrings(value.evidence, 10),
      affects: uniqueStrings(value.affects, 10, 400),
      source: value.source === "material" || value.source === "project" || value.source === "system" ? value.source : "conversation",
      supersedesId: cleanId(value.supersedesId) || undefined,
      supersededById: cleanId(value.supersededById) || undefined,
      createdAt: safeNow(value.createdAt),
      updatedAt: safeNow(value.updatedAt || value.createdAt),
   };
}

function sanitizeProgress(value: Partial<ProjectLeadProgressRecord>): ProjectLeadProgressRecord | null {
   const summary = clean(value.summary, MEMORY_LIMITS.statement);
   const projectTitle = cleanTitle(value.projectTitle);
   const projectId = cleanId(value.projectId) || normalize(projectTitle).replace(/\s+/g, "-");
   if (!summary || (!projectId && !projectTitle)) return null;

   const kind: ProjectLeadProgressKind = value.kind === "blocker" || value.kind === "outcome" || value.kind === "note" ? value.kind : "progress";

   return {
      id: cleanId(value.id) || createId("progress"),
      projectId,
      projectTitle,
      summary,
      kind,
      milestoneTitle: cleanTitle(value.milestoneTitle),
      source: value.source === "material" || value.source === "project" || value.source === "system" ? value.source : "conversation",
      createdAt: safeNow(value.createdAt),
   };
}

function emptyState(): ProjectLeadMemoryState {
   return { version: "MK XI", decisions: [], progress: [], updatedAt: Date.now() };
}

export function readProjectLeadMemory(): ProjectLeadMemoryState {
   if (typeof window === "undefined") return emptyState();

   try {
      const stored = localStorage.getItem(ALLEVIN_PROJECT_LEAD_MEMORY_STORAGE_KEY);
      if (!stored) return emptyState();
      const parsed = JSON.parse(stored);
      const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions.map((item: Partial<ProjectLeadDecisionRecord>) => sanitizeDecision(item)).filter(Boolean) : [];
      const progress = Array.isArray(parsed?.progress) ? parsed.progress.map((item: Partial<ProjectLeadProgressRecord>) => sanitizeProgress(item)).filter(Boolean) : [];
      return {
         version: "MK XI",
         decisions: decisions as ProjectLeadDecisionRecord[],
         progress: progress as ProjectLeadProgressRecord[],
         updatedAt: safeNow(parsed?.updatedAt),
      };
   } catch {
      localStorage.removeItem(ALLEVIN_PROJECT_LEAD_MEMORY_STORAGE_KEY);
      return emptyState();
   }
}

export function writeProjectLeadMemory(state: ProjectLeadMemoryState) {
   if (typeof window === "undefined") return;

   const safeState: ProjectLeadMemoryState = {
      version: "MK XI",
      decisions: state.decisions.map((item) => sanitizeDecision(item)).filter(Boolean).slice(-300) as ProjectLeadDecisionRecord[],
      progress: state.progress.map((item) => sanitizeProgress(item)).filter(Boolean).slice(-300) as ProjectLeadProgressRecord[],
      updatedAt: Date.now(),
   };

   localStorage.setItem(ALLEVIN_PROJECT_LEAD_MEMORY_STORAGE_KEY, JSON.stringify(safeState));
   window.dispatchEvent(new CustomEvent(ALLEVIN_PROJECT_LEAD_MEMORY_UPDATED_EVENT, { detail: { updatedAt: safeState.updatedAt } }));
}

function projectMatches(projectId: string, projectTitle: string, item: { projectId?: string; projectTitle?: string }) {
   const id = cleanId(projectId);
   const itemId = cleanId(item.projectId);

   // When both records have stable project ids, the id is authoritative. This
   // prevents a deleted project from leaking old MK XI memory into a newly
   // created project that happens to reuse the same title.
   if (id && itemId) return id === itemId;

   return Boolean(normalize(projectTitle) && normalize(item.projectTitle) === normalize(projectTitle));
}

export function readProjectLeadDecisions(projectId: string, projectTitle: string) {
   return readProjectLeadMemory().decisions.filter((item) => projectMatches(projectId, projectTitle, item)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readProjectLeadProgress(projectId: string, projectTitle: string) {
   return readProjectLeadMemory().progress.filter((item) => projectMatches(projectId, projectTitle, item)).sort((a, b) => b.createdAt - a.createdAt);
}

function tokenSet(value?: string) {
   const stop = new Set(["the", "and", "that", "this", "with", "from", "for", "use", "using", "will", "we", "are", "our", "into", "instead", "actually", "going"]);
   return new Set(normalize(value).split(" ").filter((token) => token.length >= 3 && !stop.has(token)));
}

function overlapScore(a?: string, b?: string) {
   const left = tokenSet(a);
   const right = tokenSet(b);
   if (!left.size || !right.size) return 0;
   let shared = 0;
   left.forEach((token) => {
      if (right.has(token)) shared += 1;
   });
   return shared / Math.min(left.size, right.size);
}

function blockerResolutionTokens(value?: string) {
   const stop = new Set(["the", "and", "that", "this", "with", "from", "for", "was", "were", "has", "have", "been", "now", "issue", "problem", "blocker", "resolved", "fixed", "cleared", "working", "approved"]);
   return new Set(
      normalize(value)
         .split(" ")
         .map((token) => (token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token))
         .filter((token) => token.length >= 3 && !stop.has(token)),
   );
}

function progressResolvesBlocker(progress: ProjectLeadProgressRecord, blocker: ProjectLeadProgressRecord) {
   if (progress.createdAt <= blocker.createdAt || progress.kind === "blocker") return false;

   const text = normalize(progress.summary);
   const isResolution =
      /\b(?:no longer blocked|unblocked)\b/.test(text) ||
      /\b(?:fixed|resolved|cleared|approved|solved|figured out|worked out|working now|works now|working again)\b/.test(text);

   if (!isResolution) return false;

   // A short pronoun/reference resolution such as "I fixed it" should close the
   // most recent blocker. More specific wording should overlap the blocker topic.
   if (/\b(?:it|that|this|the blocker|the issue|the problem)\b/.test(text)) return true;

   const left = blockerResolutionTokens(progress.summary);
   const right = blockerResolutionTokens(blocker.summary);
   if (!left.size || !right.size) return false;

   let shared = 0;
   left.forEach((token) => {
      if (right.has(token)) shared += 1;
   });

   return shared >= 1 && shared / Math.min(left.size, right.size) >= 0.2;
}

export function getActiveProjectLeadBlocker(projectId: string, projectTitle: string, now = Date.now()) {
   const progress = readProjectLeadProgress(projectId, projectTitle);
   const recentBlockers = progress.filter((item) => item.kind === "blocker" && now - item.createdAt < 14 * 86_400_000);

   for (const blocker of recentBlockers) {
      const resolved = progress.some((item) => progressResolvesBlocker(item, blocker));
      if (!resolved) return blocker;
   }

   return undefined;
}

export function inferDecisionTopic(statement?: string) {
   const text = clean(statement, MEMORY_LIMITS.statement);
   const normalized = normalize(text);

   if (/\b(?:first version|version one|v1|initial version|first prototype)\b/.test(normalized) && /\b(?:only|include|exclude|later|monitor|monitoring|control|feature|scope|version)\b/.test(normalized)) {
      return "first-version scope";
   }

   if (/\b(?:controller|control board|microcontroller|raspberry pi|arduino)\b/.test(normalized)) {
      return "controller choice";
   }

   const forMatch = text.match(/\b(?:for|about|regarding)\s+([^.!?]{3,90})/i);
   if (forMatch?.[1]) return clean(forMatch[1], MEMORY_LIMITS.topic);

   const tokens = [...tokenSet(text)].slice(0, 5);
   return tokens.join(" ") || "project direction";
}

export function recordProjectLeadDecision(input: RecordProjectLeadDecisionInput) {
   const state = readProjectLeadMemory();
   const next = sanitizeDecision({
      id: createId("decision"),
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      statement: input.statement,
      topic: input.topic,
      status: input.status,
      rationale: input.rationale,
      evidence: input.evidence,
      affects: input.affects,
      source: input.source || "conversation",
      supersedesId: input.supersedesId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
   });

   if (!next) return null;

   const duplicate = state.decisions.find(
      (item) => projectMatches(next.projectId, next.projectTitle, item) && item.status === next.status && normalize(item.statement) === normalize(next.statement),
   );

   if (duplicate) return duplicate;

   if (next.supersedesId) {
      state.decisions = state.decisions.map((item) =>
         item.id === next.supersedesId
            ? { ...item, status: "superseded" as const, supersededById: next.id, updatedAt: Date.now() }
            : item,
      );
   }

   state.decisions.push(next);
   writeProjectLeadMemory(state);
   return next;
}

export function recordProjectLeadProgress(input: Omit<ProjectLeadProgressRecord, "id" | "createdAt">) {
   const state = readProjectLeadMemory();
   const next = sanitizeProgress({ ...input, id: createId("progress"), createdAt: Date.now() });
   if (!next) return null;

   const recentDuplicate = state.progress.find(
      (item) => projectMatches(next.projectId, next.projectTitle, item) && normalize(item.summary) === normalize(next.summary) && Date.now() - item.createdAt < 5 * 60_000,
   );
   if (recentDuplicate) return recentDuplicate;

   state.progress.push(next);
   writeProjectLeadMemory(state);
   return next;
}

export interface ParsedProjectLeadMemoryIntent {
   kind: "none" | "decision-confirm" | "decision-reject" | "decision-unresolved" | "decision-supersede" | "progress" | "blocker";
   statement: string;
   rationale: string;
}

// ========================================
// ALLEVIN MK XI B13 — Conversational decision acknowledgements
// Purpose:
// Users naturally commit with phrases such as "Okay, let's use..." or
// "Alright, go with...". Remove only the acknowledgement prefix, then let the
// existing explicit decision rules decide whether the remainder is truly a
// commitment. This does not turn tentative language into a confirmed decision.
// ========================================
function stripConversationalDecisionLeadIn(value: string) {
   return clean(value, MEMORY_LIMITS.statement)
      .replace(
         /^(?:(?:okay|ok|alright|all right|sounds good|that works|works for me|perfect|cool|great)[,!.]?\s+)+/i,
         "",
      )
      .trim();
}

function stripDecisionCue(value: string) {
   return clean(value, MEMORY_LIMITS.statement)
      .replace(/^(?:actually[, ]+)?let'?s\s+make\s+/i, "Make ")
      .replace(/^(?:actually[, ]+)?(?:we(?:'re| are)?\s+going\s+with|we(?:'ve| have)?\s+decided\s+(?:to|on)?|let'?s\s+(?:use|keep|have)|use|go\s+with|the\s+decision\s+is|i(?:'m| am)?\s+going\s+with|i\s+do\s+want|i\s+want)\s+/i, "")
      .replace(/^(?:actually[, ]+)?(?:don'?t\s+use|do\s+not\s+use|we(?:'re| are)?\s+not\s+using|reject|drop|remove)\s+/i, "")
      .replace(/^(?:maybe|perhaps|we\s+could|i(?:'m| am)?\s+(?:considering|thinking\s+about|leaning\s+toward)|consider)\s+/i, "")
      .replace(/\s*,?\s*but\s+(?:i(?:'m| am)\s+)?not\s+committed(?:\s+to\s+(?:that|it))?(?:\s+yet)?[.!?]*$/i, "")
      .replace(/\s*,?\s*(?:i(?:'m| am)\s+)?not\s+committed(?:\s+to\s+(?:that|it))?(?:\s+yet)?[.!?]*$/i, "")
      .replace(/\binstead\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
}

function splitDecisionReason(value: string) {
   const text = clean(value, MEMORY_LIMITS.statement);
   const match = text.match(/^([\s\S]*?)\s+\b(because|since|so that)\b\s+([\s\S]+)$/i);
   if (!match?.[1] || !match?.[3]) return { statement: stripDecisionCue(text), rationale: "" };

   const cue = match[2].toLowerCase() === "because" ? "Because" : match[2].toLowerCase() === "since" ? "Because" : "So that";
   const reason = clean(match[3], MEMORY_LIMITS.rationale).replace(/[.!?]+$/, "");
   return {
      statement: stripDecisionCue(match[1]),
      rationale: reason ? `${cue} ${reason}.` : "",
   };
}

function isReferentialDecisionStatement(value?: string) {
   const key = normalize(value);
   return (
      /^(?:that|it|this)(?:\b|$)/.test(key) ||
      /^(?:the )?(?:selected|current|previous|other)\b/.test(key) ||
      /^(?:that one|this one|the other one|other one|option (?:one|two|three|four|1|2|3|4)|(?:first|second|third|fourth) option)$/.test(key)
   );
}

export function parseProjectLeadMemoryIntent(prompt?: string): ParsedProjectLeadMemoryIntent {
   const text = clean(prompt, MEMORY_LIMITS.statement);
   const lower = text.toLowerCase();
   const empty: ParsedProjectLeadMemoryIntent = { kind: "none", statement: "", rationale: "" };
   if (!text) return empty;

   if (/\b(?:blocked by|blocked because|blocked on|stuck on|can'?t continue because|cannot continue because|waiting on)\b/i.test(text)) {
      return { kind: "blocker", statement: text, rationale: "" };
   }

   if (
      !/[?]$/.test(text) &&
      (/\b(?:no longer blocked|unblocked)\b/i.test(text) ||
         /\b(?:issue|problem|blocker|error|bug|delay|hold|dependency|approval|mount|condensation)\b[\s\S]{0,160}\b(?:fixed|resolved|cleared|approved|solved|handled|working)\b/i.test(text) ||
         /\b(?:figured out|worked out|solved|resolved|fixed)\b[\s\S]{0,160}\b(?:issue|problem|blocker|condensation|approach|plan)\b/i.test(text))
   ) {
      return { kind: "progress", statement: text, rationale: "" };
   }

   if (/^(?:i|we)\s+(?:(?:figured|worked)\s+out|finished|completed|drafted|built|wrote|tested|reviewed|got|made|updated|fixed|resolved|solved|changed|measured|listed|confirmed|checked|mapped|documented|collected|found)\b/i.test(text) && !/[?]$/.test(text)) {
      return { kind: "progress", statement: text, rationale: "" };
   }

   // MK XI B13: strip a harmless acknowledgement before evaluating decision
   // cues. The original text is still used for progress/blocker detection above.
   const decisionText = stripConversationalDecisionLeadIn(text);
   const decisionLower = decisionText.toLowerCase();
   const parts = splitDecisionReason(decisionText);

   if (
      (/\b(?:actually|instead|switch(?:ed|ing)?\s+to|replace\s+.+\s+with)\b/i.test(decisionText) && /\b(?:use|using|go with|going with|switch|replace|decided|want|include|exclude|make|keep|have)\b/i.test(decisionText)) ||
      /^actually[, ]+(?:i|we)\b[\s\S]*\b(?:want|prefer|include|exclude|make|keep|use|using)\b/i.test(decisionText)
   ) {
      return { kind: "decision-supersede", statement: parts.statement || text, rationale: parts.rationale };
   }

   if (/^(?:don'?t use|do not use|we(?:'re| are)? not using|reject|drop)\b/i.test(decisionText)) {
      return { kind: "decision-reject", statement: parts.statement || text, rationale: parts.rationale };
   }

   if (/^(?:maybe|perhaps|we could|i(?:'m| am)? (?:considering|thinking about|leaning toward)|consider)\b/i.test(decisionText) && !/[?]$/.test(decisionText)) {
      return { kind: "decision-unresolved", statement: parts.statement || text, rationale: parts.rationale };
   }

   if (/\bnot committed\b/i.test(decisionText) && !/[?]$/.test(decisionText)) {
      return { kind: "decision-unresolved", statement: parts.statement || text, rationale: parts.rationale };
   }

   if (/^(?:we(?:'re| are)? going with|we(?:'ve| have)? decided|let'?s (?:use|make|keep|have)|go with|the decision is|i(?:'m| am)? going with)\b/i.test(decisionText) && !/[?]$/.test(decisionText)) {
      if (isReferentialDecisionStatement(parts.statement)) return empty;
      return { kind: "decision-confirm", statement: parts.statement || text, rationale: parts.rationale };
   }

   if (decisionLower.startsWith("use ") && !/[?]$/.test(decisionText) && decisionText.split(/\s+/).length <= 18) {
      const looksLikeScheduleOrToolInstruction = /\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|minute|minutes|hour|hours|calendar|session|work block|document|material|reference|file)\b/i.test(decisionText);
      if (isReferentialDecisionStatement(parts.statement) || looksLikeScheduleOrToolInstruction) return empty;
      return { kind: "decision-confirm", statement: parts.statement || text, rationale: parts.rationale };
   }

   return empty;
}

export function recordParsedProjectLeadMemoryIntent(input: {
   prompt: string;
   projectId: string;
   projectTitle: string;
   milestoneTitle?: string;
   existingConfirmedDecisions?: string[];
}) {
   const parsed = parseProjectLeadMemoryIntent(input.prompt);
   if (parsed.kind === "none") return null;

   if (parsed.kind === "progress" || parsed.kind === "blocker") {
      const progress = recordProjectLeadProgress({
         projectId: input.projectId,
         projectTitle: input.projectTitle,
         summary: parsed.statement,
         kind: parsed.kind === "blocker" ? "blocker" : "progress",
         milestoneTitle: input.milestoneTitle || "",
         source: "conversation",
      });
      return progress ? { type: "progress" as const, record: progress } : null;
   }

   const status: ProjectLeadDecisionStatus = parsed.kind === "decision-reject" ? "rejected" : parsed.kind === "decision-unresolved" ? "unresolved" : "confirmed";
   const decisions = readProjectLeadDecisions(input.projectId, input.projectTitle);

   const candidatePool =
      parsed.kind === "decision-supersede"
         ? decisions.filter((item) => item.status === "confirmed")
         : parsed.kind === "decision-reject"
           ? decisions.filter((item) => item.status === "confirmed" || item.status === "unresolved")
           : parsed.kind === "decision-confirm"
             ? decisions.filter((item) => item.status === "unresolved")
             : [];

   const replacementThreshold = parsed.kind === "decision-confirm" ? 0.35 : 0.5;
   const parsedTopic = inferDecisionTopic(parsed.statement);
   const sameTopicPrior = [...candidatePool]
      .filter((item) => normalize(item.topic) === normalize(parsedTopic))
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
   let prior: ProjectLeadDecisionRecord | undefined =
      (parsed.kind === "decision-supersede" && sameTopicPrior) ||
      [...candidatePool].sort((a, b) => overlapScore(b.statement, parsed.statement) - overlapScore(a.statement, parsed.statement))[0];

   const priorMatches = (candidate?: ProjectLeadDecisionRecord) =>
      Boolean(
         candidate &&
            (overlapScore(candidate.statement, parsed.statement) >= replacementThreshold ||
               (parsed.kind === "decision-supersede" && normalize(candidate.topic) === normalize(parsedTopic))),
      );

   if ((!prior || !priorMatches(prior)) && (parsed.kind === "decision-supersede" || parsed.kind === "decision-reject")) {
      const derivedStatement = [...(input.existingConfirmedDecisions || [])]
         .map((statement) => clean(statement, MEMORY_LIMITS.statement))
         .filter(Boolean)
         .sort((a, b) => overlapScore(b, parsed.statement) - overlapScore(a, parsed.statement))[0];

      if (derivedStatement && overlapScore(derivedStatement, parsed.statement) >= replacementThreshold) {
         prior =
            recordProjectLeadDecision({
               projectId: input.projectId,
               projectTitle: input.projectTitle,
               statement: derivedStatement,
               status: "confirmed",
               topic: inferDecisionTopic(derivedStatement),
               source: "project",
            }) || undefined;
      }
   }

   const supersedesId = priorMatches(prior) ? prior?.id : undefined;
   const decision = recordProjectLeadDecision({
      projectId: input.projectId,
      projectTitle: input.projectTitle,
      statement: parsed.statement,
      status,
      topic: inferDecisionTopic(parsed.statement),
      rationale: parsed.rationale,
      source: "conversation",
      supersedesId,
   });

   return decision ? { type: "decision" as const, record: decision } : null;
}
