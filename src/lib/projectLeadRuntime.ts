// ========================================
// ALLEVIN MK XI Project Lead Runtime — Build 6
// Purpose:
// Turn canonical project state, milestone checkpoints, durable decisions, and
// the shared Project Work Journal into calm senior-level project leadership.
//
// MK XI workspace rule:
// - Milestones provide sequence without becoming a navigation burden.
// - Explicit milestone references must resolve to that exact milestone, not today's focus.
// - Its unchecked checkpoints define what still needs attention now.
// - Open options are remembered without automatically becoming blockers.
// - Meaningful conversation updates are appended to the same milestone journal
//   the user sees in Projects.
// ========================================

import { readCanonicalProjectState, refreshCanonicalProjectState, type CanonicalProjectState } from "@/lib/projectStateAuthority";
import {
   getActiveProjectLeadBlocker,
   inferDecisionTopic,
   parseProjectLeadMemoryIntent,
   readProjectLeadDecisions,
   readProjectLeadProgress,
   recordParsedProjectLeadMemoryIntent,
   recordProjectLeadDecision,
   type ProjectLeadDecisionRecord,
} from "@/lib/projectLeadMemory";
import { buildPortfolioRundown } from "@/lib/projectPortfolioIntelligence";
import {
   appendProjectWorkJournalEntry,
   formatMilestoneCheckpoint,
   readProjectMilestoneWorkJournal,
   readProjectWorkJournal,
   type ProjectWorkJournalEntry,
   type ProjectWorkJournalKind,
} from "@/lib/projectWorkJournal";

export interface ProjectLeadRuntimeConversationContext {
   lastAssistantResponse?: string;
   lastUserPrompt?: string;
   lastRecommendation?: string;
}

export interface ProjectLeadRuntimeResult {
   handled: boolean;
   response: string;
   intent:
      | "none"
      | "briefing"
      | "decision-memory"
      | "decision-write"
      | "progress-write"
      | "progress-memory"
      | "judgment"
      | "health"
      | "calendar-coordination"
      | "portfolio"
      | "reference-action";
   stateChanged: boolean;
}

function clean(value?: string, limit = 4000) {
   const text = (value || "").replace(/<[^>]+>/g, "").replace(/\r/g, "\n").trim();
   return text.length > limit ? text.slice(0, limit).trim() : text;
}

function normalize(value?: string) {
   return clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function sentence(value?: string) {
   const text = clean(value, 1800).replace(/\s+/g, " ").trim();
   if (!text) return "";
   const match = text.match(/^(.+?[.!?])(?:\s|$)/);
   const first = match?.[1] || text;
   return /[.!?]$/.test(first) ? first : `${first}.`;
}

function displayStatement(value?: string) {
   const text = clean(value, 1800).replace(/\s+/g, " ").trim();
   if (!text) return "";
   const shaped = `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
   return /[.!?]$/.test(shaped) ? shaped : `${shaped}.`;
}

function stateIdentity(state: CanonicalProjectState) {
   return { projectId: state.identity.projectId, projectTitle: state.identity.title };
}

function noProject() {
   return "Open or create a project first. Once one is active, I can keep its decisions, updates, and current milestone together.";
}

function formatDate(timestamp?: number) {
   if (!timestamp) return "";
   return new Date(timestamp).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sameText(left?: string, right?: string) {
   return Boolean(normalize(left) && normalize(left) === normalize(right));
}

function tokenSet(value?: string) {
   const stop = new Set([
      "about",
      "after",
      "again",
      "also",
      "been",
      "before",
      "could",
      "does",
      "from",
      "have",
      "into",
      "know",
      "that",
      "their",
      "there",
      "these",
      "this",
      "what",
      "when",
      "where",
      "which",
      "with",
      "would",
      "your",
   ]);

   return new Set(
      normalize(value)
         .split(" ")
         .filter((token) => token.length >= 3 && !stop.has(token)),
   );
}

function overlapScore(left?: string, right?: string) {
   const a = tokenSet(left);
   const b = tokenSet(right);
   if (!a.size || !b.size) return 0;
   let shared = 0;
   a.forEach((token) => {
      if (b.has(token)) shared += 1;
   });
   return shared / Math.min(a.size, b.size);
}

function mergedDecisions(state: CanonicalProjectState) {
   // Decision readbacks are explicit-only. Project facts and resources can inform
   // judgment, but they are not commitments until the user actually commits.
   return readProjectLeadDecisions(state.identity.projectId, state.identity.title).sort((a, b) => b.updatedAt - a.updatedAt);
}

function activeCheckpointState(state: CanonicalProjectState) {
   const milestone = state.activeMilestone;
   const criteria = (milestone?.completionCriteria || []).map(formatMilestoneCheckpoint).filter(Boolean);
   const completed = (milestone?.completedCriteria || []).map(formatMilestoneCheckpoint).filter(Boolean);
   const pending = criteria.filter((criterion) => !completed.some((item) => sameText(item, criterion)));
   return {
      total: criteria.length,
      complete: Math.max(0, criteria.length - pending.length),
      criteria,
      pending,
      next: pending[0] || "",
   };
}

function getCurrentMilestoneJournal(state: CanonicalProjectState) {
   if (!state.activeMilestone) return [] as ProjectWorkJournalEntry[];
   return readProjectMilestoneWorkJournal(
      state.identity.projectId,
      state.identity.title,
      state.activeMilestone.id,
      state.activeMilestone.title,
   );
}


type RuntimeProjectMilestone = NonNullable<CanonicalProjectState["project"]["tracking"]>["milestones"][number];

function orderedProjectMilestones(state: CanonicalProjectState) {
   return [...(state.project.tracking?.milestones || [])].sort((left, right) => left.order - right.order);
}

function milestoneCheckpointState(milestone?: RuntimeProjectMilestone | null) {
   const criteria = (milestone?.completionCriteria || []).map(formatMilestoneCheckpoint).filter(Boolean);
   const completed = (milestone?.completedCriteria || []).map(formatMilestoneCheckpoint).filter(Boolean);
   const pending = criteria.filter((criterion) => !completed.some((item) => sameText(item, criterion)));
   return {
      total: criteria.length,
      complete: Math.max(0, criteria.length - pending.length),
      criteria,
      completed,
      pending,
      next: pending[0] || "",
   };
}

function findReferencedMilestone(state: CanonicalProjectState, prompt: string) {
   const milestones = orderedProjectMilestones(state);
   if (!milestones.length) return null;

   const normalizedPrompt = normalize(prompt);
   const numberMatch = normalizedPrompt.match(/\bmilestone\s+(\d{1,2})\b/);
   if (numberMatch) {
      const index = Number(numberMatch[1]) - 1;
      if (index >= 0 && index < milestones.length) return milestones[index];
   }

   const direct = milestones.find((milestone) => {
      const title = normalize(milestone.title);
      return Boolean(title && normalizedPrompt.includes(title));
   });
   if (direct) return direct;

   const ranked = milestones
      .map((milestone) => ({ milestone, score: overlapScore(prompt, milestone.title) }))
      .sort((left, right) => right.score - left.score);

   return ranked[0]?.score >= 0.6 ? ranked[0].milestone : null;
}

function isQuestionLikeMilestoneItem(value?: string) {
   const text = clean(value, 1200).trim();
   if (!text) return false;
   return /\?$/.test(text) || /^(?:what|which|who|where|when|why|how|is|are|do|does|did|can|could|should|would|will|has|have)\b/i.test(text);
}

function isTentativeMilestoneWorkStatement(value?: string) {
   const text = normalize(value);
   if (!text) return true;

   // Work Area text is user-authored project evidence, but exploratory language
   // stays exploratory. MK XI should carry explicit working facts forward without
   // silently upgrading "maybe" or "still need to decide" into project truth.
   return /\b(?:maybe|might|perhaps|possibly|considering|thinking about|not sure|unsure|still need|need to decide|needs to decide|trying to decide|could use|could be|may use|may be)\b/.test(text);
}

function extractEstablishedMilestoneWorkStatements(value?: string) {
   const body = clean(value, 4000);
   if (!body) return [] as string[];

   const candidates = body
      .split(/\n+|(?<=[.!?])\s+/)
      .map((item) => clean(item, 1200).replace(/^[\-•]+\s*/, "").trim())
      .filter(Boolean)
      .filter((item) => !isQuestionLikeMilestoneItem(item))
      .filter((item) => !isTentativeMilestoneWorkStatement(item));

   return [...new Map(candidates.map((item) => [normalize(item), item])).values()].filter(Boolean);
}

function friendlyJournalContext(value?: string) {
   const text = clean(value, 1800).replace(/\s+/g, " ").trim();
   if (!text) return "";

   // Keep the substance of a saved update without forcing internal project-
   // management vocabulary back into the conversation. If the user literally
   // wrote "I'm blocked", preserve the meaning as something still needing work.
   return text
      .replace(/^i(?:'m| am) blocked because i still need to\s+/i, "You still need to ")
      .replace(/^i(?:'m| am) blocked because\s+/i, "Still needs attention: ")
      .replace(/^blocked because\s+/i, "Still needs attention: ");
}

function buildMilestoneReferenceReadback(state: CanonicalProjectState, milestone: RuntimeProjectMilestone) {
   const milestones = orderedProjectMilestones(state);
   const milestoneNumber = Math.max(1, milestones.findIndex((item) => item.id === milestone.id) + 1);
   const current = milestone.id === state.activeMilestone?.id;
   const checkpoints = milestoneCheckpointState(milestone);
   const journal = readProjectMilestoneWorkJournal(state.identity.projectId, state.identity.title, milestone.id, milestone.title);
   const latest = [...journal]
      .reverse()
      .find((entry) => entry.kind === "update" || entry.kind === "decision" || entry.kind === "resolved" || entry.kind === "blocker");
   const workArea = sentence(milestone.workingContent);

   // MK XI B7: milestone recall distinguishes *evidence* from *prompts*. A
   // checkpoint can be marked complete while still being phrased as a question;
   // that question is not itself an answer. Only explicit milestone decisions,
   // resolved/decision journal entries, or declarative completed criteria are
   // described as established project knowledge.
   const establishedWork = extractEstablishedMilestoneWorkStatements(milestone.workingContent);
   const establishedCandidates = [
      ...(milestone.decisions || []),
      ...journal.filter((entry) => entry.kind === "decision" || entry.kind === "resolved").map((entry) => entry.text),
      ...establishedWork,
      ...checkpoints.completed.filter((item) => !isQuestionLikeMilestoneItem(item)),
   ];
   const established = [...new Map(establishedCandidates.map((item) => [normalize(item), clean(item, 1200)])).values()].filter(Boolean);

   const parts: string[] = [`Milestone ${milestoneNumber} is ${milestone.title}.`];

   if (established.length) {
      parts.push(`Established: ${established.slice(0, 2).join("; ")}${established.length > 2 ? "; and more" : ""}.`);
   } else {
      parts.push("I don’t have a saved conclusion for that milestone yet.");
   }

   // Do not immediately repeat a Work Area sentence that was already promoted
   // into established project knowledge above. Tentative/open work still appears
   // as context without being mislabeled as a conclusion.
   if (workArea && !establishedWork.some((item) => sameText(item, workArea))) {
      parts.push(`Saved work: ${workArea}`);
   } else if (!workArea && latest) {
      const latestContext = friendlyJournalContext(latest.text);
      if (latestContext) parts.push(`Latest saved context: ${displayStatement(latestContext)}`);
   }

   if (current && checkpoints.next) {
      parts.push(`Next unchecked checkpoint: ${checkpoints.next}`);
   }

   return parts.slice(0, 4).join(" ");
}

function getLatestUsefulJournalEntry(state: CanonicalProjectState) {
   const entries = getCurrentMilestoneJournal(state);
   return [...entries]
      .reverse()
      .find((entry) => entry.kind === "update" || entry.kind === "decision" || entry.kind === "blocker" || entry.kind === "resolved");
}

function getLatestConfirmedDecision(state: CanonicalProjectState) {
   return mergedDecisions(state).find((item) => item.status === "confirmed");
}

function currentOpenOption(state: CanonicalProjectState) {
   return mergedDecisions(state).find((item) => item.status === "unresolved");
}

function optionBlocksCurrentCheckpoint(state: CanonicalProjectState, option?: ProjectLeadDecisionRecord) {
   if (!option) return false;
   const checkpoints = activeCheckpointState(state).pending;
   return checkpoints.some((checkpoint) => overlapScore(checkpoint, `${option.statement} ${option.topic}`) >= 0.45);
}

function appendRuntimeJournal(
   state: CanonicalProjectState,
   input: { kind: ProjectWorkJournalKind; text: string; createdAt?: number },
) {
   if (!state.activeMilestone || !clean(input.text)) return null;
   return appendProjectWorkJournalEntry({
      projectId: state.identity.projectId,
      projectTitle: state.identity.title,
      milestoneId: state.activeMilestone.id,
      milestoneTitle: state.activeMilestone.title,
      kind: input.kind,
      text: clean(input.text, 4000),
      source: "aidock",
      createdAt: input.createdAt,
   });
}

function looksLikeResolvedUpdate(value?: string) {
   const text = normalize(value);
   return (
      /\b(?:no longer blocked|unblocked|fixed|resolved|cleared|solved|working now|works now|working again)\b/.test(text) ||
      /\b(?:figured out|worked out)\b/.test(text)
   );
}

export function buildProjectLeadBriefing(state: CanonicalProjectState = readCanonicalProjectState()) {
   if (!state.hasProject) return noProject();

   const milestone = clean(state.activeMilestone?.title, 600);
   const checkpoints = activeCheckpointState(state);
   const blocker = getActiveProjectLeadBlocker(state.identity.projectId, state.identity.title);
   const latest = getLatestUsefulJournalEntry(state);
   const confirmed = getLatestConfirmedDecision(state);
   const parts: string[] = [];

   parts.push(milestone ? `${state.identity.title} is on ${milestone}.` : `${state.identity.title} is active.`);

   if (checkpoints.total) {
      if (checkpoints.pending.length) {
         parts.push(`You’ve cleared ${checkpoints.complete} of ${checkpoints.total} checkpoints. Next: ${checkpoints.next}`);
      } else {
         parts.push(`All ${checkpoints.total} checkpoints for this milestone are checked.`);
      }
   } else if (state.recommendation.nextMove && normalize(state.recommendation.nextMove) !== normalize(milestone)) {
      parts.push(`The next move is ${state.recommendation.nextMove.replace(/[.!?]+$/, "")}.`);
   }

   if (blocker) {
      parts.push(`Needs attention: ${displayStatement(blocker.summary)}`);
   } else if (latest && Date.now() - latest.createdAt < 14 * 86_400_000) {
      parts.push(`Latest update: ${displayStatement(latest.text)}`);
   }

   if (confirmed && parts.length < 4 && (!latest || normalize(latest.text) !== normalize(confirmed.statement))) {
      parts.push(`Current direction: ${displayStatement(confirmed.statement)}`);
   }

   const session = state.calendar.nextProjectSession;
   if (session && parts.length < 4) parts.push(`Your next project session is ${formatDate(session.startTime)}.`);

   return parts.slice(0, 4).join(" ");
}

export function buildProjectLeadOpeningLine(state: CanonicalProjectState = readCanonicalProjectState()) {
   if (!state.hasProject) return "";

   const milestone = clean(state.activeMilestone?.title, 500);
   const checkpoints = activeCheckpointState(state);
   if (milestone && checkpoints.next) return `You’re working on ${milestone}. The next checkpoint is ${checkpoints.next}`;
   if (milestone) return `You’re working on ${milestone}.`;
   if (state.recommendation.nextMove) return `For ${state.identity.title}, I’d start with ${state.recommendation.nextMove}.`;
   return `${state.identity.title} is ready when you are.`;
}

function buildCurrentMilestoneReadback(state: CanonicalProjectState) {
   const milestone = state.activeMilestone;
   if (!milestone) {
      return `${state.identity.title} is active, but there is no current milestone selected yet.`;
   }

   const checkpoints = activeCheckpointState(state);
   const latest = getLatestUsefulJournalEntry(state);
   const parts = [`You’re currently working on ${milestone.title}.`];

   if (checkpoints.next) {
      parts.push(`Next checkpoint: ${checkpoints.next}`);
   } else if (state.recommendation.nextMove && !sameText(state.recommendation.nextMove, milestone.title)) {
      parts.push(`Next move: ${state.recommendation.nextMove}`);
   }

   if (latest && Date.now() - latest.createdAt < 14 * 86_400_000) {
      parts.push(`Latest work: ${displayStatement(latest.text)}`);
   }

   return parts.slice(0, 3).join(" ");
}

function buildDecisionReadback(state: CanonicalProjectState, mode: "confirmed" | "unresolved" | "rejected" | "history") {
   const decisions = mergedDecisions(state);
   const filtered = mode === "history" ? decisions : decisions.filter((item) => item.status === mode);
   if (!filtered.length) {
      if (mode === "confirmed") return "There are no explicit confirmed decisions recorded yet.";
      if (mode === "unresolved") return "There are no explicit open options recorded yet.";
      if (mode === "rejected") return "There are no rejected directions recorded yet.";
      return "There is no saved decision history yet.";
   }

   return filtered
      .slice(0, 8)
      .map((item) => {
         const status = item.status === "superseded" ? "changed later" : item.status === "unresolved" ? "open" : item.status;
         return `${displayStatement(item.statement)}${mode === "history" ? ` — ${status}` : ""}`;
      })
      .join("\n");
}

function latestDecisionChangePair(state: CanonicalProjectState) {
   const decisions = mergedDecisions(state);
   const replacement = decisions.find((item) => item.status === "confirmed" && Boolean(item.supersedesId));
   if (!replacement?.supersedesId) return null;
   const previous = decisions.find((item) => item.id === replacement.supersedesId);
   return previous ? { previous, replacement } : null;
}

function buildRecentDecisionChange(state: CanonicalProjectState) {
   const pair = latestDecisionChangePair(state);
   if (!pair) return buildDecisionReadback(state, "history");
   return `You changed the project direction. Before: ${displayStatement(pair.previous.statement)} Now: ${displayStatement(pair.replacement.statement)}`;
}

function buildDecisionWhy(state: CanonicalProjectState, prompt: string) {
   const decisions = mergedDecisions(state);
   const promptKey = normalize(prompt);
   const isPronounChangeQuestion = /^(?:why did we|why did i|why)\s+(?:change|switch|replace)\s+(?:that|it|this)(?:\s+decision)?$/.test(promptKey);

   if (isPronounChangeQuestion) {
      const pair = latestDecisionChangePair(state);
      if (!pair) return "I don’t have a changed decision to explain yet.";
      const reason = clean(pair.replacement.rationale, 1200);
      return reason
         ? `Previous direction: ${displayStatement(pair.previous.statement)} Current direction: ${displayStatement(pair.replacement.statement)} ${reason}`
         : `Previous direction: ${displayStatement(pair.previous.statement)} Current direction: ${displayStatement(pair.replacement.statement)} You didn’t give a reason with that change, so I won’t invent one.`;
   }

   const asksAboutChange = /\b(?:change|changed|switch|switched|replace|replaced|stop using|stopped using)\b/.test(promptKey);
   const candidates = asksAboutChange
      ? [...decisions.filter((item) => item.status === "superseded"), ...decisions.filter((item) => item.status !== "superseded")]
      : decisions;
   const candidate = candidates
      .map((item) => {
         const score = overlapScore(prompt, `${item.statement} ${item.topic}`);
         return { item, score };
      })
      .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt)[0];

   if (!candidate || candidate.score < 0.2) return "I don’t have a saved decision matching that yet.";

   if (candidate.item.status === "superseded" && candidate.item.supersededById) {
      const replacement = decisions.find((item) => item.id === candidate.item.supersededById);
      if (replacement) {
         const reason = clean(replacement.rationale, 1200);
         return reason
            ? `${displayStatement(candidate.item.statement)} changed to ${displayStatement(replacement.statement)} ${reason}`
            : `${displayStatement(candidate.item.statement)} changed to ${displayStatement(replacement.statement)} No reason was saved with the change.`;
      }
   }

   if (candidate.item.rationale) return `${displayStatement(candidate.item.statement)} ${candidate.item.rationale}`;
   return `${displayStatement(candidate.item.statement)} No explicit reason was saved with it.`;
}

function buildDecisionStatus(state: CanonicalProjectState, prompt: string) {
   const decisions = mergedDecisions(state);
   if (!decisions.length) return "No explicit decision matching that has been saved yet.";

   const ranked = decisions
      .map((item) => ({ item, score: overlapScore(prompt, `${item.statement} ${item.topic}`) }))
      .sort((a, b) => b.score - a.score || b.item.updatedAt - a.item.updatedAt);
   const match = ranked[0];
   if (!match || match.score < 0.2) return "No explicit decision matching that has been saved yet.";

   const statement = displayStatement(match.item.statement);
   if (match.item.status === "confirmed") return `Yes. ${statement} That is a confirmed project decision.`;
   if (match.item.status === "unresolved" || match.item.status === "assumed") return `No. ${statement} That is still an open option, not a confirmed decision.`;
   if (match.item.status === "rejected") return `No. ${statement} That direction was ruled out for this project.`;
   if (match.item.status === "superseded") return `${statement} That was a decision, but it was changed later.`;
   return `${statement} It is recorded as ${match.item.status}.`;
}

function buildRecentChangeImpact(state: CanonicalProjectState, context?: ProjectLeadRuntimeConversationContext) {
   const checkpoints = activeCheckpointState(state);
   const previous = sentence(context?.lastUserPrompt).replace(/[.!?]+$/, "");
   const priorLooksLikeMeasurement = /\b(?:measured|measurement|dimensions?|inches?|feet|wide|deep|tall|long|available space|available room)\b/i.test(previous);

   if (priorLooksLikeMeasurement && checkpoints.next) {
      return `It sharpens the current milestone rather than changing the sequence. Use those dimensions as a real design boundary while you answer: ${checkpoints.next}`;
   }

   if (checkpoints.next) return `It changes the information you’re working with, but not the milestone yet. Carry it into the next checkpoint: ${checkpoints.next}`;
   if (state.recommendation.nextMove) return `It changes the inputs more than the sequence. Keep ${state.recommendation.nextMove} as the next move and use the new information in that decision.`;
   return "It adds useful project context, but there isn’t enough saved structure yet to say the sequence should change.";
}

function findRelevantProjectUpdate(state: CanonicalProjectState, prompt: string) {
   const journal = readProjectWorkJournal(state.identity.projectId, state.identity.title);
   const progress = readProjectLeadProgress(state.identity.projectId, state.identity.title);
   const candidates: Array<{ text: string; createdAt: number; score: number }> = [];
   const lower = normalize(prompt);

   const topicBonus = (text: string) => {
      const source = normalize(text);
      let bonus = 0;
      if (/\b(?:space|size|dimension|measurement|wide|deep|tall|height|width|depth)\b/.test(lower) && /\b(?:space|size|dimension|measured|measurement|wide|deep|tall|height|width|depth|inch|inches|feet)\b/.test(source)) bonus += 0.75;
      if (/\b(?:budget|cost|price|spend)\b/.test(lower) && /\b(?:budget|cost|price|spend|dollar|\$)\b/.test(source)) bonus += 0.75;
      if (/\b(?:blocker|blocked|holding|stuck)\b/.test(lower) && /\b(?:block|blocked|stuck|waiting|issue|problem)\b/.test(source)) bonus += 0.75;
      return bonus;
   };

   journal.forEach((entry) => candidates.push({ text: entry.text, createdAt: entry.createdAt, score: overlapScore(prompt, entry.text) + topicBonus(entry.text) }));
   progress.forEach((entry) => candidates.push({ text: entry.summary, createdAt: entry.createdAt, score: overlapScore(prompt, entry.summary) + topicBonus(entry.summary) }));

   const best = candidates.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt)[0];
   if (!best || best.score < 0.34) return null;
   return displayStatement(best.text);
}

function getProjectHealth(state: CanonicalProjectState) {
   const blocker = getActiveProjectLeadBlocker(state.identity.projectId, state.identity.title);
   const highRisk = state.risks.find((item) => item.severity === "high");
   const ageDays = state.recentActivity.updatedAt ? (Date.now() - state.recentActivity.updatedAt) / 86_400_000 : 0;

   if (blocker && Date.now() - blocker.createdAt < 14 * 86_400_000) return { state: "blocked", reason: blocker.summary };
   if (highRisk) return { state: "at risk", reason: highRisk.consequence || highRisk.title };
   if (ageDays >= 10) return { state: "stale", reason: "The project has not moved recently." };
   if (!state.activeMilestone && !state.recommendation.nextMove) return { state: "unclear", reason: "There is not yet a grounded next move." };
   return { state: "moving", reason: "The current milestone has a clear work area." };
}

function futureDeferCandidate(state: CanonicalProjectState) {
   const milestones = state.project.tracking?.milestones || [];
   const activeId = state.activeMilestone?.id;
   const remaining = milestones.filter((item) => item.id !== activeId && item.status !== "complete");
   return (
      remaining.find((item) => /\b(?:later|next version|future|optional|polish|expand|advanced|dashboard|nice to have)\b/i.test(item.title)) ||
      remaining[remaining.length - 1]
   );
}

function buildSeniorJudgment(state: CanonicalProjectState, prompt: string) {
   const lower = normalize(prompt);
   const health = getProjectHealth(state);
   const milestone = state.activeMilestone?.title || "the current milestone";
   const checkpoints = activeCheckpointState(state);
   const nextCheckpoint = checkpoints.next;
   const risk = state.risks.find((item) => item.severity === "high") || state.risks.find((item) => item.severity === "medium") || state.risks[0];

   if (/what would you do first|what should i do first|where would you start|where should i start/.test(lower)) {
      if (nextCheckpoint) return `I’d answer this first: ${nextCheckpoint} That is the next checkpoint in ${milestone}, so it moves the project forward without opening another workstream.`;
      return state.recommendation.nextMove ? `I’d start with ${state.recommendation.nextMove}.` : "I’d make the intended first version concrete before buying or building anything.";
   }

   if (/\bshould i\b[\s\S]*\b(?:buy|order|purchase|start building|build it|start assembling)\b|\bcan i just\b[\s\S]*\b(?:buy|order|start building|build)\b/.test(lower)) {
      if (nextCheckpoint) return `Not yet. First answer: ${nextCheckpoint} Then you can judge the part against the requirement instead of letting the part define the design.`;
      return "Not yet. I’d define the requirement that component needs to satisfy before ordering it.";
   }

   if (/overcomplicat|too much|too complex|scope creep/.test(lower)) {
      const defer = futureDeferCandidate(state);
      if (checkpoints.pending.length) {
         return `The project itself is still reasonable. Keep your attention on the ${checkpoints.pending.length} remaining ${checkpoints.pending.length === 1 ? "checkpoint" : "checkpoints"} in ${milestone}.${defer ? ` I’d leave “${defer.title}” for later.` : " I wouldn’t add another workstream yet."}`;
      }
      return "I don’t see obvious scope creep in the current milestone. Finish it before adding another layer.";
   }

   if (/ready|should i build|start building|begin building|are we set/.test(lower)) {
      const blocker = getActiveProjectLeadBlocker(state.identity.projectId, state.identity.title);
      if (blocker) return `Not yet. This still needs attention: ${displayStatement(blocker.summary)} Resolve that first.`;
      if (health.state === "at risk") return `Not yet. ${health.reason} I’d address that risk before committing to the build.`;
      if (checkpoints.pending.length) {
         const preview = checkpoints.pending.slice(0, 3).join("; ");
         return `Not quite. ${checkpoints.pending.length} ${checkpoints.pending.length === 1 ? "checkpoint is" : "checkpoints are"} still open in ${milestone}: ${preview} Those are the answers the build should be based on.`;
      }
      return "Yes. The current milestone is checked off and nothing specific is holding it up. Move into the next milestone rather than expanding the scope.";
   }

   if (/what.*missing|overlook|blind spot|what.*risk/.test(lower)) {
      if (checkpoints.pending.length) {
         const list = checkpoints.pending.slice(0, 3).map((item, index) => `${index + 1}) ${item}`).join(" ");
         return `The clearest gaps are already in the current milestone: ${list} I’d answer those before inventing new work.`;
      }
      if (risk) return `${risk.title || "The main risk"}: ${risk.consequence || risk.mitigation}.`;
      return "I don’t see a specific missing requirement in the current milestone. I’d move forward rather than add speculative work.";
   }

   if (/what would you cut|what should i cut|cut from version|simplify/.test(lower)) {
      const defer = futureDeferCandidate(state);
      if (defer) return `I’d defer “${defer.title}” from the first version. Keep version one focused on proving the core result and finishing the current milestone before adding later-version work.`;
      return `I’d cut anything that is not required by the current milestone’s checkpoints. Finish ${milestone} first, then decide what deserves to survive into the next step.`;
   }

   return `${state.identity.title} is ${health.state}. ${health.reason}`;
}

function buildHoldingUpResponse(state: CanonicalProjectState) {
   const blocker = getActiveProjectLeadBlocker(state.identity.projectId, state.identity.title);
   if (blocker) return `Needs attention: ${displayStatement(blocker.summary)}`;

   const checkpoints = activeCheckpointState(state);
   const option = currentOpenOption(state);
   if (checkpoints.next) {
      const rawOptionText = clean(option?.statement, 1200).replace(/[.!?]+$/, "");
      const optionText = rawOptionText ? `${rawOptionText.charAt(0).toUpperCase()}${rawOptionText.slice(1)}` : "";
      const optionNote = option && !optionBlocksCurrentCheckpoint(state, option) && optionText ? ` ${optionText} is still an open option, but it does not block this checkpoint.` : "";
      return `Nothing specific is holding this milestone up. You’re still working through ${state.activeMilestone?.title || "the current milestone"}. Next checkpoint: ${checkpoints.next}${optionNote}`;
   }

   return "Nothing specific is holding this milestone up right now. It is ready to move forward.";
}

function buildCalendarCoordination(state: CanonicalProjectState, prompt: string) {
   const session = state.calendar.nextProjectSession;
   const checkpoint = activeCheckpointState(state).next;
   const next = checkpoint || state.recommendation.nextMove;
   const lower = normalize(prompt);

   if (/do i need to schedule|is .* scheduled|already scheduled/.test(lower)) {
      if (session) return `No extra block is needed right now. Your next ${state.identity.title} session is ${formatDate(session.startTime)}: ${session.title}.`;
      return next ? `There isn’t project time scheduled for the current work: ${next}` : "There is no upcoming project session, and there also isn’t a clear enough next move to schedule yet.";
   }

   if (/does .*session.*match|still match|outdated session|stale session/.test(lower)) {
      if (!session) return "There is no upcoming project session to compare with the current milestone.";
      const milestone = normalize(state.activeMilestone?.title);
      const sessionText = normalize(`${session.title} ${session.description} ${session.recommendedNextAction} ${session.projectStage}`);
      const nextTokens = normalize(next).split(" ").filter((token) => token.length >= 4);
      const matches = (milestone && sessionText.includes(milestone)) || nextTokens.some((token) => sessionText.includes(token));
      return matches
         ? `Yes. The next session still supports ${state.activeMilestone?.title || "the current milestone"}: ${session.title}.`
         : `Not quite. The next session is ${session.title}, but the current milestone is focused on ${next || "different work"}. I’d revise the session before using it.`;
   }

   return session ? `Your next project session is ${formatDate(session.startTime)}: ${session.title}.` : "There is no upcoming project session scheduled.";
}

function resolveReferenceStatement(context?: ProjectLeadRuntimeConversationContext) {
   const assistant = sentence(context?.lastAssistantResponse);
   if (assistant) return assistant.replace(/[.!?]+$/, "");
   const recommendation = sentence(context?.lastRecommendation);
   if (recommendation) return recommendation.replace(/[.!?]+$/, "");
   const user = sentence(context?.lastUserPrompt);
   return user.replace(/[.!?]+$/, "");
}

function handleReferenceAction(state: CanonicalProjectState, prompt: string, context?: ProjectLeadRuntimeConversationContext): ProjectLeadRuntimeResult | null {
   const lower = normalize(prompt);
   const statement = resolveReferenceStatement(context);

   if (/save that as (?:a )?decision|make that (?:the )?decision|lock that in/.test(lower)) {
      if (!statement) return { handled: true, response: "Tell me the decision you want to lock in, and I’ll save it with this project.", intent: "reference-action", stateChanged: false };
      const record = recordProjectLeadDecision({ ...stateIdentity(state), statement, status: "confirmed", topic: inferDecisionTopic(statement), source: "conversation" });
      if (record) {
         appendRuntimeJournal(state, { kind: "decision", text: record.statement, createdAt: record.updatedAt });
         refreshCanonicalProjectState({ emit: true });
      }
      return { handled: true, response: record ? `Saved to the current milestone: ${displayStatement(record.statement)}` : "I couldn’t save that decision cleanly.", intent: "reference-action", stateChanged: Boolean(record) };
   }

   if (/reject that|don'?t use that|drop that|not that one/.test(lower)) {
      if (!statement) return { handled: true, response: "Tell me which direction you want to reject, and I’ll keep it out of the current project decisions.", intent: "reference-action", stateChanged: false };
      const record = recordProjectLeadDecision({ ...stateIdentity(state), statement, status: "rejected", topic: inferDecisionTopic(statement), source: "conversation" });
      if (record) {
         appendRuntimeJournal(state, { kind: "decision", text: `Ruled out: ${record.statement}`, createdAt: record.updatedAt });
         refreshCanonicalProjectState({ emit: true });
      }
      return { handled: true, response: record ? `Ruled out for this project: ${displayStatement(record.statement)}` : "I couldn’t save that rejection cleanly.", intent: "reference-action", stateChanged: Boolean(record) };
   }

   return null;
}

function recordRuntimeMemoryToJournal(state: CanonicalProjectState, stored: ReturnType<typeof recordParsedProjectLeadMemoryIntent>, originalPrompt: string) {
   if (!stored) return;

   if (stored.type === "decision") {
      const kind: ProjectWorkJournalKind = stored.record.status === "unresolved" ? "open-option" : "decision";
      appendRuntimeJournal(state, { kind, text: stored.record.statement, createdAt: stored.record.updatedAt });
      return;
   }

   const kind: ProjectWorkJournalKind = stored.record.kind === "blocker" ? "blocker" : looksLikeResolvedUpdate(originalPrompt) ? "resolved" : "update";
   appendRuntimeJournal(state, { kind, text: stored.record.summary, createdAt: stored.record.createdAt });
}

export function handleProjectLeadRuntimePrompt(prompt: string, context?: ProjectLeadRuntimeConversationContext): ProjectLeadRuntimeResult {
   const state = readCanonicalProjectState();
   const lower = normalize(prompt);
   const unhandled: ProjectLeadRuntimeResult = { handled: false, response: "", intent: "none", stateChanged: false };

   if (/portfolio rundown|what needs me most|which project needs|across my projects|rundown of (?:all|my) projects|all-project rundown/.test(lower)) {
      return { handled: true, response: buildPortfolioRundown(), intent: "portfolio", stateChanged: false };
   }

   if (!state.hasProject) return unhandled;

   const reference = handleReferenceAction(state, prompt, context);
   if (reference) return reference;

   if (/^(?:is|was|are) .+ decided(?: yet)?$|have we decided (?:on|about) .+|did we decide (?:on|about) .+/.test(lower)) {
      return { handled: true, response: buildDecisionStatus(state, prompt), intent: "decision-memory", stateChanged: false };
   }

   if (/what have we (?:actually )?decided|what did we decide|confirmed decisions|what decisions/.test(lower)) {
      return { handled: true, response: buildDecisionReadback(state, "confirmed"), intent: "decision-memory", stateChanged: false };
   }

   if (/what.*still.*decide|open decisions|open options|unresolved decisions|what isn'?t decided/.test(lower)) {
      return { handled: true, response: buildDecisionReadback(state, "unresolved"), intent: "decision-memory", stateChanged: false };
   }

   if (/what.*reject|rejected decisions|what did we rule out/.test(lower)) {
      return { handled: true, response: buildDecisionReadback(state, "rejected"), intent: "decision-memory", stateChanged: false };
   }

   const asksDecisionHistory =
      /decision history|changed our mind|what did we change/.test(lower) ||
      (lower === "what changed" && /updated the project direction|changed later|supersed|decision/.test(normalize(context?.lastAssistantResponse)));

   if (asksDecisionHistory) {
      return { handled: true, response: lower === "what changed" ? buildRecentDecisionChange(state) : buildDecisionReadback(state, "history"), intent: "decision-memory", stateChanged: false };
   }

   if (/why did we|why did i|why.*decision|why.*stop using|why.*switch|why.*change/.test(lower)) {
      return { handled: true, response: buildDecisionWhy(state, prompt), intent: "decision-memory", stateChanged: false };
   }

   const parsedMemory = parseProjectLeadMemoryIntent(prompt);
   if (parsedMemory.kind !== "none") {
      const stored = recordParsedProjectLeadMemoryIntent({
         prompt,
         ...stateIdentity(state),
         milestoneTitle: state.activeMilestone?.title,
         existingConfirmedDecisions: readProjectLeadDecisions(state.identity.projectId, state.identity.title)
            .filter((decision) => decision.status === "confirmed")
            .map((decision) => decision.statement),
      });

      if (stored) {
         recordRuntimeMemoryToJournal(state, stored, prompt);
         refreshCanonicalProjectState({ emit: true });
      }

      if (stored?.type === "decision") {
         if (stored.record.status === "unresolved") {
            return { handled: true, response: `I’ll keep that as an open option: ${displayStatement(stored.record.statement)}`, intent: "decision-write", stateChanged: true };
         }
         if (stored.record.status === "rejected") {
            return { handled: true, response: `Ruled out for this project: ${displayStatement(stored.record.statement)}`, intent: "decision-write", stateChanged: true };
         }
         if (stored.record.supersedesId) {
            return { handled: true, response: `Updated the project direction and kept the earlier decision in history: ${displayStatement(stored.record.statement)}`, intent: "decision-write", stateChanged: true };
         }
         return { handled: true, response: `Saved to the current milestone: ${displayStatement(stored.record.statement)}`, intent: "decision-write", stateChanged: true };
      }

      if (stored?.type === "progress") {
         if (stored.record.kind === "blocker") {
            return { handled: true, response: "I’ve added that to this milestone as something that needs attention.", intent: "progress-write", stateChanged: true };
         }
         if (looksLikeResolvedUpdate(prompt)) {
            return { handled: true, response: "Added that update to the current milestone. I’ll treat the earlier issue as resolved.", intent: "progress-write", stateChanged: true };
         }
         return { handled: true, response: `Added to the current milestone: ${displayStatement(stored.record.summary)}`, intent: "progress-write", stateChanged: true };
      }
   }

   // MK XI B5 — resolve explicit milestone references before the generic
   // "current milestone" shortcut. A question such as "How should milestone 1
   // influence the current milestone?" is a synthesis request, not a request to
   // merely repeat today's focus. Leaving synthesis unhandled here deliberately
   // sends it to AIDock's full project reasoning path, which receives every
   // milestone workspace, material, decision, and the canonical current focus.
   const referencedMilestone = findReferencedMilestone(state, prompt);
   const milestoneReferences = lower.match(/\bmilestone\s+\d{1,2}\b/g) || [];
   const referencesCurrentMilestone = /\b(?:current milestone|current focus|what we(?:'re| are) working on now)\b/.test(lower);
   const asksCrossMilestoneReasoning =
      milestoneReferences.length > 1 ||
      Boolean(
         referencedMilestone &&
            (referencesCurrentMilestone || state.activeMilestone?.id !== referencedMilestone.id) &&
            /\b(?:compare|affect|influence|apply|carry forward|carry over|use|based on|inform|connect|change|shape|guide|learned|established)\b/.test(lower),
      );
   const asksMilestoneRecap =
      /\b(?:what is|what was|what were|what did we|what have we|what do we know|recap|summarize|summary|remind me|tell me about|show me|review|look back|what happened|establish|established)\b/.test(lower);

   if (referencedMilestone && asksMilestoneRecap && !asksCrossMilestoneReasoning) {
      return { handled: true, response: buildMilestoneReferenceReadback(state, referencedMilestone), intent: "progress-memory", stateChanged: false };
   }

   if (asksCrossMilestoneReasoning) {
      return unhandled;
   }

   if (
      /what am i (?:currently )?working on|what are we (?:currently )?working on|what(?:'s| is) the current milestone|current milestone|what(?:'s| is) my current focus|where am i in (?:the )?project/.test(lower)
   ) {
      return { handled: true, response: buildCurrentMilestoneReadback(state), intent: "briefing", stateChanged: false };
   }

   if (/give me (?:a )?brief|give me the rundown|brief me|where are we|where were we|catch me up|project rundown/.test(lower)) {
      return { handled: true, response: buildProjectLeadBriefing(state), intent: "briefing", stateChanged: false };
   }

   if (/does (?:that|this) change|does (?:that|this) affect|change what we should do next|change the next step|does this alter/.test(lower)) {
      return { handled: true, response: buildRecentChangeImpact(state, context), intent: "judgment", stateChanged: false };
   }

   if (/what do (?:you|we) know about|what did i (?:say|tell you) about|what have i told you about|remind me what i (?:said|told you) about/.test(lower)) {
      const update = findRelevantProjectUpdate(state, prompt);
      if (update) return { handled: true, response: update, intent: "progress-memory", stateChanged: false };
   }

   if (/overcomplicat|too much|too complex|scope creep|ready|what.*missing|overlook|blind spot|what would you cut|what should i cut|cut from version|simplify|what.*risk|what would you do first|what should i do first|where would you start|where should i start|should i .*\b(?:buy|order|purchase|start building|build it|start assembling)\b|can i just .*\b(?:buy|order|start building|build)\b/.test(lower)) {
      return { handled: true, response: buildSeniorJudgment(state, prompt), intent: "judgment", stateChanged: false };
   }

   if (/project health|how.*project doing|is .*blocked|what.*holding.*up|why haven'?t we moved|stale/.test(lower)) {
      return { handled: true, response: buildHoldingUpResponse(state), intent: "health", stateChanged: false };
   }

   if (/do i need to schedule|already scheduled|is .* scheduled|does .*session.*match|still match|outdated session|stale session/.test(lower)) {
      return { handled: true, response: buildCalendarCoordination(state, prompt), intent: "calendar-coordination", stateChanged: false };
   }

   return unhandled;
}
