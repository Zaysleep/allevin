// ========================================
// ALLEVIN MK VIII Project Lead Guidance Engine
// Purpose:
// Turn a Project Intelligence Packet into
// one project-understanding-aware judgment
// before AIDock adds natural, project-aware conversational delivery.
// ========================================

import type { ProjectBuildStep, ProjectDependencySignal, ProjectEvidenceSignal, ProjectIntelligencePacket, ProjectMaterialSignal, ProjectReasoningProfile, ProjectRiskSignal } from "@/lib/projectIntelligenceEngine";

export type ProjectGuidanceIntent =
   | "project-identity"
   | "project-understanding"
   | "project-facts"
   | "completed-milestones"
   | "persistent-decisions"
   | "budget-memory"
   | "material-history"
   | "priority-fact"
   | "subject-unlock"
   | "challenge-recommendation"
   | "ordered-actions"
   | "senior-assessment"
   | "completed-project-strength"
   | "completed-project-risk"
   | "completed-project-observations"
   | "conditional-option-reconsideration"
   | "completed-decision-retrospective"
   | "decision-impact"
   | "decision-status"
   | "assumptions"
   | "premature-decision"
   | "next-action-detail"
   | "milestone-completion-evidence"
   | "project-change"
   | "project-update"
   | "conversation-transform"
   | "current-milestone"
   | "milestone-rationale"
   | "next-milestone"
   | "milestone-completion"
   | "milestone-change"
   | "milestone-fit"
   | "recommendation-fit"
   | "missing-information"
   | "skip-risk"
   | "next-action"
   | "rationale"
   | "priority-decision"
   | "priority-rationale"
   | "decision-quality"
   | "work-readiness-standard"
   | "progress-points"
   | "relationship"
   | "conversation-summary"
   | "unresolved"
   | "build-order"
   | "risk"
   | "readiness"
   | "simplification"
   | "project-lead"
   | "materials"
   | "material-impact"
   | "material-milestone"
   | "material-completion"
   | "material-source"
   | "material-carryover"
   | "milestone-inputs"
   | "budget-status"
   | "budget-scope"
   | "decision-requirements"
   | "material-next"
   | "material-tension"
   | "material-decisions"
   | "material-rationale"
   | "material-recommendation"
   | "hierarchy-explanation"
   | "hierarchy-comparison"
   | "option-comparison"
   | "option-recommendation"
   | "option-vs-existing"
   | "option-counterargument"
   | "option-change-condition"
   | "purchase-deferral"
   | "milestone-focus"
   | "evidence"
   | "decision"
   | "general";

export type ProjectCoachingMode = "direct" | "recommendation" | "tradeoff" | "challenge" | "brainstorm" | "review" | "risk-review" | "decision-confirmation";

export type ProjectGuidanceSubjectKind = "project" | "fact" | "milestone" | "decision" | "recommendation" | "risk" | "update" | "none";

export interface ProjectGuidanceSubject {
   kind: ProjectGuidanceSubjectKind;
   title: string;
   detail: string;
   id?: string;
}

export interface ProjectGuidanceConversationContext {
   previousIntent?: ProjectGuidanceIntent;
   lastUserPrompt?: string;
   lastAssistantResponse?: string;
   lastRecommendation?: string;
   lastMilestoneTitle?: string;
   lastSubject?: ProjectGuidanceSubject;
   recentMessages?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface ProjectGuidanceInput {
   prompt: string;
   packet: ProjectIntelligencePacket;
   fallbackNextAction?: string;
   conversation?: ProjectGuidanceConversationContext;
}

export interface ProjectGuidanceResult {
   handled: boolean;
   intent: ProjectGuidanceIntent;
   response: string;
   judgment: string;
   reason: string;
   nextAction: string;
   watchOut: string;
   profile: ProjectReasoningProfile;
   currentUnderstanding: string;
   assessment: string;
   evidenceUsed: string[];
   confidence: number;
   coachingMode: ProjectCoachingMode;
   subject: ProjectGuidanceSubject;
}

interface ProfileGuidanceDraft {
   currentUnderstanding: string;
   assessment: string;
   recommendation: string;
   reason: string;
   watchOut: string;
   evidenceUsed: string[];
}

interface CompletedBuildFeedbackConflict {
   build: ProjectBuildStep;
   feedback: string;
}

const NEGATIVE_FEEDBACK_SIGNALS = [
   "unclear",
   "confusing",
   "broken",
   "missing",
   "does not",
   "doesn't",
   "did not",
   "didn't",
   "not working",
   "still needs",
   "still unclear",
   "hard to",
   "difficult",
   "issue",
   "problem",
   "failed",
   "failure",
   "bug",
   "blocked",
   "cannot",
   "can't",
];

const MATCH_STOP_WORDS = new Set([
   "about",
   "after",
   "again",
   "against",
   "before",
   "build",
   "building",
   "completed",
   "current",
   "feature",
   "feedback",
   "from",
   "into",
   "more",
   "project",
   "should",
   "system",
   "that",
   "their",
   "there",
   "these",
   "they",
   "this",
   "user",
   "users",
   "using",
   "with",
   "work",
   "working",
]);

// ========================================
// Text helpers
// ========================================

function compactText(value?: string, limit = 3000) {
   const clean = (value || "").replace(/\s+/g, " ").trim();
   return clean.length > limit ? clean.slice(0, limit).trim() : clean;
}

function normalizePrompt(value?: string) {
   return compactText(value).toLowerCase();
}

function includesAny(value: string, candidates: string[]) {
   return candidates.some((candidate) => value.includes(candidate));
}

function ensureSentence(value?: string) {
   const clean = compactText(value);

   if (!clean) {
      return "";
   }

   return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function getFirstMeaningfulSentence(value?: string, limit = 280) {
   const clean = compactText(value, 1800);

   if (!clean) {
      return "";
   }

   const sentence = clean.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || clean;

   return sentence.length > limit ? `${sentence.slice(0, limit).trim()}...` : sentence;
}

function uniqueStrings(values: string[], limit = 12) {
   const seen = new Set<string>();
   const result: string[] = [];

   for (const value of values) {
      const clean = compactText(value, 700);
      const key = clean.toLowerCase();

      if (!clean || seen.has(key)) {
         continue;
      }

      seen.add(key);
      result.push(clean);

      if (result.length >= limit) {
         break;
      }
   }

   return result;
}

// ========================================
// ALLEVIN MK VIII — Clear project readbacks
// Purpose:
// Keep project summaries, unresolved decisions, and milestone transitions
// natural, specific, and separate from generic task lists.
// ========================================

const DECISION_READBACK_STOP_WORDS = new Set(["about", "after", "before", "each", "from", "have", "into", "project", "should", "still", "that", "their", "there", "these", "this", "what", "when", "where", "which", "with", "work"]);

function getDecisionReadbackTokens(value?: string) {
   return new Set(
      compactText(value, 1800)
         .toLowerCase()
         .split(/[^a-z0-9]+/)
         .filter((token) => token.length >= 3 && !DECISION_READBACK_STOP_WORDS.has(token)),
   );
}

function getDecisionReadbackOverlap(left?: string, right?: string) {
   const leftTokens = getDecisionReadbackTokens(left);
   const rightTokens = getDecisionReadbackTokens(right);

   if (!leftTokens.size || !rightTokens.size) {
      return 0;
   }

   let overlap = 0;

   leftTokens.forEach((token) => {
      if (rightTokens.has(token)) {
         overlap += 1;
      }
   });

   return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function isDecisionReadbackCandidate(value?: string) {
   const clean = compactText(value, 1200).replace(/[.!?]+$/, "");

   if (!clean) {
      return false;
   }

   if (/^(?:who|what|when|where|why|how|which|whether)\b/i.test(clean)) {
      return true;
   }

   if (/^(?:decide|choose|determine|confirm|finalize|define|clarify|select|approve|settle|specify|resolve)\b/i.test(clean)) {
      return true;
   }

   // These verbs usually describe work to perform rather than a choice that
   // remains unsettled. They belong in milestones or open work, not in a
   // decision readback unless the sentence is explicitly phrased as a choice.
   if (/^(?:build|create|map|identify|compare|review|research|write|test|implement|complete|prepare|install|inspect|send|schedule|deploy|launch)\b/i.test(clean)) {
      return false;
   }

   return /\b(?:need to decide|need to choose|not yet decided|have not decided|haven't decided|still undecided|whether)\b/i.test(clean);
}

function formatUnresolvedDecisionReadbackItem(value?: string) {
   let clean = compactText(value, 1200)
      .replace(/[.!?]+$/, "")
      .trim();

   if (!clean) {
      return "";
   }

   // ALLEVIN MK VIII wording cleanup: turn vague order questions into a
   // readable project decision without tying the language to one domain.
   if (/^what order makes sense$/i.test(clean)) {
      clean = "What order should the work follow";
   }

   return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
}

function getUnresolvedDecisionReadbackItems(understanding: ProjectIntelligencePacket["projectUnderstanding"]) {
   const activeMilestone = understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId) || understanding.milestones.find((milestone) => milestone.status === "active");
   const candidates = [...(activeMilestone && isDecisionReadbackCandidate(activeMilestone.title) ? [activeMilestone.title] : []), ...understanding.unresolvedDecisions.map((decision) => decision.statement)];
   const result: string[] = [];

   for (const candidate of candidates) {
      const clean = compactText(candidate, 1200).replace(/[.!?]+$/, "");

      if (!isDecisionReadbackCandidate(clean)) {
         continue;
      }

      const isDuplicate = result.some((existing) => {
         const exactMatch = normalizePrompt(existing) === normalizePrompt(clean);
         const semanticMatch = getDecisionReadbackOverlap(existing, clean) >= 0.6;
         return exactMatch || semanticMatch;
      });

      if (!isDuplicate) {
         const readableDecision = formatUnresolvedDecisionReadbackItem(clean);

         if (readableDecision) {
            result.push(readableDecision);
         }
      }

      if (result.length >= 8) {
         break;
      }
   }

   return result;
}

function formatProjectSituationReadback(value?: string) {
   const clean = compactText(value, 5000)
      // Preserve separate status facts even when storage flattened bullets or
      // paragraphs into one line.
      .replace(/,?\s+(?:but|and)\s*(?=[.!?])/gi, "")
      .replace(/([a-z0-9)])\s+(?=(?:I|We)\s+(?:am|are|have|also have|still have|do not|don't|have not|haven't|need|want|plan)\b)/g, "$1. ")
      .replace(/([a-z0-9)])\s+(?=(?:The project|This project|Those directions|No\b|Nothing\b|None\b|It\b|There\b))/g, "$1. ")
      .replace(/\.{2,}/g, ".")
      .replace(/\s+([,.;!?])/g, "$1")
      .trim();

   if (!clean) {
      return "";
   }

   return clean
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => ensureSentence(sentence))
      .filter(Boolean)
      .join(" ");
}

function getProjectFactTokens(value?: string) {
   return new Set(
      compactText(value, 4000)
         .toLowerCase()
         .split(/[^a-z0-9]+/)
         .filter((token) => token.length >= 3 && !["the", "this", "that", "with", "from", "into", "project", "work", "current", "should", "could", "would", "about"].includes(token)),
   );
}

function getProjectFactOverlapRatio(left?: string, right?: string) {
   const leftTokens = getProjectFactTokens(left);
   const rightTokens = getProjectFactTokens(right);

   if (!leftTokens.size || !rightTokens.size) return 0;

   let overlap = 0;
   leftTokens.forEach((token) => {
      if (rightTokens.has(token)) overlap += 1;
   });

   return overlap / Math.min(leftTokens.size, rightTokens.size);
}

function uniqueProjectFacts(values: string[], limit = 8) {
   const result: string[] = [];

   for (const value of values) {
      const clean = compactText(value, 1800);
      if (!clean) continue;

      const duplicate = result.some((existing) => normalizePrompt(existing) === normalizePrompt(clean) || getProjectFactOverlapRatio(existing, clean) >= 0.84);

      if (!duplicate) result.push(clean);
      if (result.length >= limit) break;
   }

   return result;
}

function getImmediateFollowingMilestoneLabel(value?: string) {
   const clean = compactText(value, 1200).replace(/[.!?]+$/, "");

   if (!clean) {
      return "";
   }

   // A generated title can occasionally contain two verb-led checkpoints
   // joined by a comma. Only surface the immediate next checkpoint here.
   return clean.split(/,\s+(?=(?:define|decide|choose|confirm|finalize|clarify|map|identify|build|create|test|prepare|review|deploy|launch|inspect|compare)\b)/i)[0]?.trim() || clean;
}

function formatCount(value: number) {
   const words: Record<number, string> = {
      1: "one",
      2: "two",
      3: "three",
      4: "four",
      5: "five",
      6: "six",
      7: "seven",
      8: "eight",
      9: "nine",
      10: "ten",
   };

   return words[value] || String(value);
}

function getBuildLabel(build?: ProjectBuildStep) {
   return build ? `Build ${build.number} — ${build.title}` : "";
}

function normalizeMatchToken(value: string) {
   let token = value.toLowerCase().replace(/[^a-z0-9]/g, "");

   if (token.length > 5 && token.endsWith("ing")) {
      token = token.slice(0, -3);
   } else if (token.length > 4 && token.endsWith("ed")) {
      token = token.slice(0, -2);
   } else if (token.length > 4 && token.endsWith("es")) {
      token = token.slice(0, -2);
   } else if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
      token = token.slice(0, -1);
   }

   return token;
}

function getMatchTokens(value?: string) {
   return new Set(
      compactText(value, 4000)
         .toLowerCase()
         .split(/[^a-z0-9]+/)
         .map(normalizeMatchToken)
         .filter((token) => token.length >= 4 && !MATCH_STOP_WORDS.has(token)),
   );
}

function getTextOverlapScore(left?: string, right?: string) {
   const leftTokens = getMatchTokens(left);
   const rightTokens = getMatchTokens(right);
   let overlap = 0;

   for (const token of leftTokens) {
      if (rightTokens.has(token)) {
         overlap += 1;
      }
   }

   return overlap;
}

function hasNegativeFeedbackLanguage(value?: string) {
   const lower = compactText(value).toLowerCase();
   return NEGATIVE_FEEDBACK_SIGNALS.some((signal) => lower.includes(signal));
}

function getHighestPriorityDependency(packet: ProjectIntelligencePacket) {
   return packet.dependencies.find((dependency) => dependency.state === "unsatisfied") || packet.dependencies.find((dependency) => dependency.state === "unknown");
}

function getHighestRisk(packet: ProjectIntelligencePacket) {
   const severityRank: Record<ProjectRiskSignal["severity"], number> = {
      high: 3,
      medium: 2,
      low: 1,
   };

   return [...packet.risks].sort((left, right) => severityRank[right.severity] - severityRank[left.severity])[0];
}

function getRelevantMaterialForBuild(materials: ProjectMaterialSignal[], build?: ProjectBuildStep) {
   if (!build) {
      return undefined;
   }

   return materials.find((material) => material.relevantBuildIds.includes(build.id));
}

function findCompletedBuildFeedbackConflict(packet: ProjectIntelligencePacket): CompletedBuildFeedbackConflict | undefined {
   const negativeFeedback = packet.profileSignals.testerFeedback.filter(hasNegativeFeedbackLanguage);

   let bestMatch: (CompletedBuildFeedbackConflict & { score: number }) | undefined;

   for (const build of packet.completedBuilds) {
      const buildText = `${build.title} ${build.description}`;

      for (const feedback of negativeFeedback) {
         const directBuildReference = new RegExp(`\\bbuild\\s+${build.number}\\b`, "i").test(feedback);
         const score = directBuildReference ? 10 : getTextOverlapScore(buildText, feedback);

         if (score < 1 || (bestMatch && bestMatch.score >= score)) {
            continue;
         }

         bestMatch = {
            build,
            feedback,
            score,
         };
      }
   }

   return bestMatch
      ? {
           build: bestMatch.build,
           feedback: bestMatch.feedback,
        }
      : undefined;
}

function getEvidenceText(evidence: ProjectEvidenceSignal | undefined) {
   return evidence ? evidence.text : "";
}

function getDependencyAction(dependency: ProjectDependencySignal) {
   return `Resolve the first unmet dependency: ${ensureSentence(dependency.text)}`;
}

function getReadinessWatchOut(packet: ProjectIntelligencePacket) {
   return getHighestRisk(packet)?.text || packet.readiness.missingChecks[0] || "";
}

function getSentenceContaining(value: string, signals: string[]) {
   const clean = compactText(value, 8000);

   if (!clean) {
      return "";
   }

   const parts = clean
      .split(/(?<=[.!?])\s+|\s+-\s+/)
      .map((part) =>
         compactText(part, 700)
            .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
            .trim(),
      )
      .filter(Boolean);

   return parts.find((part) => signals.some((signal) => part.toLowerCase().includes(signal.toLowerCase()))) || "";
}

function getPacketMaterialText(packet: ProjectIntelligencePacket) {
   return compactText(packet.materials.flatMap((material) => [material.title, material.summary, material.details]).join(" "), 24000);
}

function getPacketDecisionText(packet: ProjectIntelligencePacket) {
   return compactText([getPacketMaterialText(packet), ...packet.profileSignals.availableEvidence].join(" "), 48000);
}

function getPlanningValidationEvidence(packet: ProjectIntelligencePacket) {
   const evidenceText = getPacketDecisionText(packet);
   const sentences = evidenceText
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => compactText(item, 900))
      .filter(Boolean);

   const failure =
      sentences.find((sentence) =>
         /\b(?:failed|failure|not passed|did not pass|below (?:the )?target|missed (?:the )?target|does not meet|did not meet|unresolved|incomplete|needs? (?:a )?retest|needs? correction|still breaks?|still fails?|blocked)\b/i.test(sentence),
      ) || "";

   const confirmed = sentences.find((sentence) => /\b(?:passed|validated|verified|confirmed|approved|accepted|meets? (?:the )?target|success criteria (?:are|were) met)\b/i.test(sentence)) || "";

   return {
      failure,
      confirmed,
      successCriteria: uniqueStrings(packet.profileSignals.successCriteria, 6),
      summary: failure || confirmed,
   };
}

function hasPlanningValidationFailure(packet: ProjectIntelligencePacket) {
   return Boolean(getPlanningValidationEvidence(packet).failure);
}

function cleanInlineDecisionText(value?: string) {
   return compactText(value, 1200).replace(/[.!?]+$/, "");
}

function getOptionEvidenceScore(option: string, evidence: string) {
   const overlap = getTextOverlapScore(option, evidence);
   const lower = evidence.toLowerCase();
   const positiveSignals = ["practical", "confirmed", "successfully", "passed", "working", "available", "reached", "stable", "no packet loss"];

   return overlap * 3 + positiveSignals.filter((signal) => lower.includes(signal)).length;
}

function getStrongestSupportedOption(packet: ProjectIntelligencePacket) {
   const evidence = getPacketDecisionText(packet);

   return packet.profileSignals.options
      .map((option) => ({
         option,
         score: getOptionEvidenceScore(option, evidence),
      }))
      .sort((left, right) => right.score - left.score)[0];
}

function isPurchaseGuardrailDependency(value?: string) {
   const lower = compactText(value).toLowerCase();

   return (
      /\b(?:do not|should not|must not|avoid)\s+(?:buy|purchase|order|commit|finalize|launch|schedule)\b/i.test(lower) ||
      /\bbefore\s+(?:buying|purchasing|ordering|committing|finalizing|launching|scheduling)\b/i.test(lower) ||
      /\buntil\s+.+\s+(?:is|are)\s+(?:selected|confirmed|verified|approved|resolved)\b/i.test(lower)
   );
}

function getDecisionBlockingDependency(packet: ProjectIntelligencePacket) {
   return (
      packet.dependencies.find((dependency) => dependency.state === "unsatisfied" && !isPurchaseGuardrailDependency(dependency.text)) ||
      packet.dependencies.find((dependency) => dependency.state === "unknown" && !isPurchaseGuardrailDependency(dependency.text))
   );
}

function getPlanningDecisionDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft, prompt: string): ProfileGuidanceDraft {
   const lower = normalizePrompt(prompt);
   const signals = packet.profileSignals;
   const dependency = getDecisionBlockingDependency(packet);
   const asksForCommitment = /\b(?:buy|purchase|order|spend|commit|finalize|approve|select|choose|schedule|launch|sign)\b/i.test(lower);

   if (dependency) {
      return {
         ...draft,
         assessment: asksForCommitment ? "Not yet. The commitment still depends on evidence that has not been confirmed." : "The decision is still gated by an unresolved prerequisite.",
         recommendation: `Verify this first: ${dependency.text}`,
         reason: signals.assumptions[0]
            ? `The current plan is relying on this assumption: ${ensureSentence(signals.assumptions[0])} The dependency should be resolved before that assumption controls a commitment.`
            : "That prerequisite can change which option is feasible, affordable, or worth pursuing.",
         watchOut: signals.knownRisks[0] || "Do not turn an untested assumption into a downstream commitment.",
         evidenceUsed: uniqueStrings([dependency.text, ...signals.assumptions, ...signals.availableEvidence], 12),
      };
   }

   const strongest = getStrongestSupportedOption(packet);
   const strongestOption = cleanInlineDecisionText(strongest?.option);

   if (strongest && strongestOption && strongest.score > 0 && signals.options.length) {
      const supportingSentence = getSentenceContaining(
         getPacketDecisionText(packet),
         strongestOption
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((token) => token.length >= 4)
            .slice(0, 5),
      );

      return {
         ...draft,
         assessment: `The strongest supported option right now is ${lowerSentenceStart(strongestOption)}.`,
         recommendation: `Choose ${strongestOption.replace(/[.!?]+$/, "")} if the remaining constraints do not contradict the evidence`,
         reason: supportingSentence || "It has the strongest support across the project’s verified evidence, constraints, and success criteria.",
         watchOut: signals.knownRisks[0] || "Keep the decision provisional if new evidence could still change the comparison.",
         evidenceUsed: uniqueStrings([supportingSentence, ...signals.constraints, ...signals.availableEvidence], 12),
      };
   }

   if (signals.options.length) {
      return {
         ...draft,
         assessment: "The options are visible, but the project does not yet contain enough evidence to rank one confidently.",
         recommendation: "Compare the options against the same constraints, dependencies, success criteria, and cost of reversal before committing",
         reason: "A useful decision removes options that fail the project’s requirements instead of returning an unranked list of pros and cons.",
         watchOut: signals.knownRisks[0] || "Do not let familiarity or early enthusiasm substitute for evidence.",
         evidenceUsed: uniqueStrings([...signals.options, ...signals.constraints, ...signals.availableEvidence], 14),
      };
   }

   const unresolved = packet.projectUnderstanding.unresolvedDecisions[0]?.statement;
   if (unresolved) {
      return {
         ...draft,
         assessment: `The decision that currently controls the rest of the plan is ${ensureSentence(unresolved)}`,
         recommendation: `Resolve ${unresolved.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`,
         reason: getPriorityDecisionReason(packet, unresolved),
         watchOut: signals.knownRisks[0] || "",
         evidenceUsed: uniqueStrings([unresolved, ...signals.constraints, ...signals.availableEvidence], 10),
      };
   }

   return draft;
}

function getPlanningReadinessIntentDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const validation = getPlanningValidationEvidence(packet);
   const activeMilestone = packet.projectUnderstanding.milestones.find((milestone) => milestone.id === packet.projectUnderstanding.activeMilestoneId);

   if (validation.failure) {
      return {
         ...draft,
         assessment: "No. The work has reached validation, but the recorded evidence still shows an unmet condition.",
         recommendation: activeMilestone ? `Keep ${activeMilestone.title.replace(/[.!?]+$/, "")} open and correct the failed check before moving on` : "Correct the failed check and repeat the same validation before closing the work",
         reason: ensureSentence(validation.failure),
         watchOut: "Do not treat implementation or effort as proof that the intended outcome was achieved.",
         evidenceUsed: uniqueStrings([validation.failure, ...validation.successCriteria], 8),
      };
   }

   if (packet.readiness.missingChecks.length) {
      return {
         ...draft,
         assessment: "Not yet. The project still lacks evidence needed to call the active work ready.",
         recommendation: `Close the first missing check: ${packet.readiness.missingChecks[0]}`,
         reason: packet.readiness.reason || "Readiness should be based on observable evidence, not the amount of work already spent.",
         watchOut: packet.readiness.missingChecks[1] || "",
         evidenceUsed: uniqueStrings(packet.readiness.missingChecks, 8),
      };
   }

   return {
      ...draft,
      assessment: getReadinessAssessment(packet),
      reason: validation.confirmed || packet.readiness.reason || draft.reason,
      evidenceUsed: uniqueStrings([validation.confirmed, ...draft.evidenceUsed], 10),
   };
}

// ========================================
// Intent detection
// ========================================

function getProjectCoachingMode(prompt: string): ProjectCoachingMode {
   const lower = normalizePrompt(prompt)
      .replace(/[?!.,;:]+$/g, "")
      .trim();

   if (includesAny(lower, ["what could go wrong", "what is the biggest risk", "what's the biggest risk", "risk review", "review the risks", "what am i overlooking", "what could block this"])) {
      return "risk-review";
   }

   if (includesAny(lower, ["review this plan", "review my plan", "review this approach", "review my approach", "what do you think of this plan", "what do you think of my plan", "how does this plan look"])) {
      return "review";
   }

   if (includesAny(lower, ["give me ideas", "brainstorm", "what are some directions", "show me a few approaches", "give me a few options"])) {
      return "brainstorm";
   }

   if (/^(?:i think|i'm thinking|i am thinking|i plan|i'm planning|i am planning|i'll|i will|we'll|we will)\b/i.test(lower) && !lower.endsWith("?")) {
      return "decision-confirmation";
   }

   // ALLEVIN MK VIII next-action routing:
   // Direct next-step questions must resolve as recommendations before broader
   // "should I" tradeoff matching. Otherwise a question such as
   // "What should I work on next?" is incorrectly treated as a proposal to skip
   // the current milestone.
   if (includesAny(lower, ["what should i do next", "what should we do next", "what should i work on", "what should we work on", "what would you recommend", "what do you recommend", "what is the smartest next move", "what's the smartest next move"])) {
      return "recommendation";
   }

   if (/^(?:should|could|can|would)\s+(?:i|we)\b/i.test(lower) || includesAny(lower, ["would it be better", "what if i", "what if we", "can i skip", "can we skip", "could i skip", "could we skip", "instead of"])) {
      return "tradeoff";
   }

   if (
      includesAny(lower, [
         "i think i'm overthinking",
         "i think i am overthinking",
         "am i overthinking",
         "push back on this",
         "challenge this",
         "challenge that recommendation",
         "challenge your recommendation",
         "tell me if i'm wrong",
         "tell me if i am wrong",
         "do you disagree",
      ])
   ) {
      return "challenge";
   }

   return "direct";
}

function extractProposedAction(prompt: string) {
   return compactText(prompt, 900)
      .replace(/^(?:should|could|can|would)\s+(?:i|we)\s+/i, "")
      .replace(/^(?:what if)\s+(?:i|we)\s+/i, "")
      .replace(/^(?:i think|i'm thinking|i am thinking|i plan|i'm planning|i am planning)\s+/i, "")
      .replace(/^(?:i'll|i will|we'll|we will)\s+/i, "")
      .replace(/[?!.,;:]+$/g, "")
      .trim();
}

function extractTradeoffParts(prompt: string) {
   const clean = extractProposedAction(prompt);
   const skipMatch = clean.match(/^(?:skip|delay|defer|pause|put off)\s+(.+?)\s+(?:and|to)\s+(?:start|begin|move into|work on|do)\s+(.+)$/i);

   if (skipMatch) {
      return {
         skipped: compactText(skipMatch[1], 500),
         alternative: compactText(skipMatch[2], 500),
         explicitSequenceChange: true,
      };
   }

   const insteadMatch = clean.match(/^(.+?)\s+instead of\s+(.+)$/i);

   if (insteadMatch) {
      return {
         skipped: compactText(insteadMatch[2], 500),
         alternative: compactText(insteadMatch[1], 500),
         explicitSequenceChange: true,
      };
   }

   return {
      skipped: "",
      alternative: clean,
      explicitSequenceChange: /\b(?:skip|delay|defer|pause|put off|instead of)\b/i.test(clean),
   };
}

function getCoachCurrentFocus(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const activeMilestone = understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId);

   return compactText(activeMilestone?.title || understanding.recommendedMove || packet.projectLeadState.nextMove, 1200);
}

function getCoachPriorityDecision(packet: ProjectIntelligencePacket) {
   return packet.projectUnderstanding.unresolvedDecisions[0]?.statement || "";
}

function getCoachTradeoffDraft(prompt: string, packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const tradeoff = extractTradeoffParts(prompt);
   const proposedAction = tradeoff.alternative;
   const currentFocus = getCoachCurrentFocus(packet);
   const priorityDecision = getCoachPriorityDecision(packet);

   if (!proposedAction) {
      return draft;
   }

   const proposedSupportsPriority = getTextOverlapScore(proposedAction, currentFocus) >= 2 || getTextOverlapScore(proposedAction, priorityDecision) >= 2;

   const skippedMatchesPriority = Boolean(tradeoff.skipped && (getTextOverlapScore(tradeoff.skipped, currentFocus) >= 2 || getTextOverlapScore(tradeoff.skipped, priorityDecision) >= 2));

   const movesAwayFromPriority = tradeoff.explicitSequenceChange || skippedMatchesPriority || !proposedSupportsPriority;

   if (movesAwayFromPriority) {
      const advantage = `The advantage is that ${proposedAction.replace(/[.!?]+$/, "")} creates visible progress.`;
      const downside = currentFocus
         ? `The downside is that ${currentFocus.replace(/[.!?]+$/, "")} would remain unresolved, so later work may need to be revised once that decision changes.`
         : "The downside is that the project would move forward while its highest-impact decision remains open.";

      return {
         currentUnderstanding: `You could move into ${proposedAction.replace(/[.!?]+$/, "")}.`,
         assessment: `${advantage} ${downside}`,
         recommendation: currentFocus ? `I would finish ${currentFocus.replace(/[.!?]+$/, "")} first, then move into ${proposedAction.replace(/[.!?]+$/, "")}` : draft.recommendation,
         reason: priorityDecision ? getPriorityDecisionReason(packet, priorityDecision) : draft.reason,
         watchOut: "",
         evidenceUsed: draft.evidenceUsed,
      };
   }

   return {
      currentUnderstanding: "That fits the current direction.",
      assessment: `It supports ${currentFocus || priorityDecision} rather than pulling the project into later work.`,
      recommendation: `Move ahead with ${proposedAction.replace(/[.!?]+$/, "")}`,
      reason: "",
      watchOut: "",
      evidenceUsed: draft.evidenceUsed,
   };
}

function getCoachDecisionConfirmationDraft(prompt: string, packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const proposedAction = extractProposedAction(prompt);
   const currentFocus = getCoachCurrentFocus(packet);
   const priorityDecision = getCoachPriorityDecision(packet);
   const supportsCurrentWork = getTextOverlapScore(proposedAction, currentFocus) >= 2 || getTextOverlapScore(proposedAction, priorityDecision) >= 2;

   if (!proposedAction) {
      return draft;
   }

   if (supportsCurrentWork) {
      return {
         currentUnderstanding: "That is the right call.",
         assessment: currentFocus ? `It keeps the project focused on ${currentFocus.replace(/[.!?]+$/, "")} before later decisions begin depending on it.` : "It supports the strongest current project direction.",
         recommendation: `Go ahead and ${proposedAction.replace(/[.!?]+$/, "")}`,
         reason: "",
         watchOut: "",
         evidenceUsed: draft.evidenceUsed,
      };
   }

   return {
      currentUnderstanding: "That is possible, but it changes the project sequence.",
      assessment: currentFocus ? `${currentFocus.replace(/[.!?]+$/, "")} is still the stronger first move because later work depends on it.` : draft.assessment,
      recommendation: currentFocus ? `Finish ${currentFocus.replace(/[.!?]+$/, "")} first, or explicitly change the active milestone before moving ahead` : draft.recommendation,
      reason: priorityDecision ? getPriorityDecisionReason(packet, priorityDecision) : draft.reason,
      watchOut: "",
      evidenceUsed: draft.evidenceUsed,
   };
}

function getCoachReviewDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const understanding = packet.projectUnderstanding;
   const confirmed = understanding.confirmedDecisions.slice(0, 2);
   const unresolved = understanding.unresolvedDecisions.slice(0, 2);
   const currentFocus = getCoachCurrentFocus(packet);

   return {
      currentUnderstanding: confirmed.length ? `What is already solid:\n${confirmed.map((item) => `- ${item.statement}`).join("\n")}` : "What is already solid:\n- The project has a defined direction, but few decisions are explicitly locked.",
      assessment: unresolved.length ? `What still needs tightening:\n${unresolved.map((item) => `- ${item.statement}`).join("\n")}` : "What still needs tightening:\n- No major unresolved decision is explicitly recorded.",
      recommendation: currentFocus ? `Tighten ${currentFocus.replace(/[.!?]+$/, "")} before moving into later work` : draft.recommendation,
      reason: "",
      watchOut: "",
      evidenceUsed: uniqueStrings([...confirmed.flatMap((item) => item.evidence.map((evidence) => evidence.quote)), ...unresolved.flatMap((item) => item.evidence.map((evidence) => evidence.quote))]),
   };
}

function getCoachBrainstormDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const understanding = packet.projectUnderstanding;
   const priorityDecision = getCoachPriorityDecision(packet);
   const currentFocus = getCoachCurrentFocus(packet);
   const nextMilestone = understanding.milestones.find((milestone) => milestone.status !== "complete" && milestone.id !== understanding.activeMilestoneId)?.title || understanding.afterThis;

   if (!priorityDecision && !currentFocus) {
      return {
         currentUnderstanding: "",
         assessment: "The project does not contain enough grounded context to brainstorm without inventing new facts.",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: draft.evidenceUsed,
      };
   }

   const directions = uniqueStrings(
      [
         priorityDecision ? `Direct approach — resolve ${priorityDecision.replace(/[.!?]+$/, "")} now` : "",
         priorityDecision ? `Working-draft approach — write a provisional answer for ${priorityDecision.replace(/[.!?]+$/, "")}, test it against the goal and constraints, then revise it` : "",
         nextMilestone ? `Bridge approach — define only enough of ${priorityDecision || currentFocus} to give ${nextMilestone.replace(/[.!?]+$/, "")} a clear starting point` : "",
      ],
      3,
   );

   return {
      currentUnderstanding: "",
      assessment: directions.map((item, index) => `${index + 1}. ${item}`).join("\n"),
      recommendation: directions[0] ? "Start with the direct approach" : draft.recommendation,
      reason: "It reduces the main uncertainty without creating extra branches of work.",
      watchOut: "",
      evidenceUsed: draft.evidenceUsed,
   };
}

function getCoachChallengeDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const priorityDecision = getCoachPriorityDecision(packet);

   if (!priorityDecision) {
      return {
         ...draft,
         currentUnderstanding: "I do not see evidence that you are overthinking the project.",
         assessment: "The current plan is already specific enough to act on.",
         recommendation: "",
         reason: "",
         watchOut: "",
      };
   }

   return {
      currentUnderstanding: "I do not think this is unnecessary analysis.",
      assessment: getPriorityDecisionReason(packet, priorityDecision),
      recommendation: "",
      reason: "",
      watchOut: "",
      evidenceUsed: draft.evidenceUsed,
   };
}

function applyDecisionCoachMode(mode: ProjectCoachingMode, prompt: string, packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   switch (mode) {
      case "tradeoff":
         return getCoachTradeoffDraft(prompt, packet, draft);
      case "decision-confirmation":
         return getCoachDecisionConfirmationDraft(prompt, packet, draft);
      case "review":
         return getCoachReviewDraft(packet, draft);
      case "brainstorm":
         return getCoachBrainstormDraft(packet, draft);
      case "challenge":
         return getCoachChallengeDraft(packet, draft);
      case "risk-review":
         return {
            ...draft,
            currentUnderstanding: "",
         };
      case "recommendation":
      case "direct":
      default:
         return draft;
   }
}

export function getProjectGuidanceIntent(prompt: string, conversation: ProjectGuidanceConversationContext = {}, packet?: ProjectIntelligencePacket): ProjectGuidanceIntent {
   const lower = normalizePrompt(prompt);
   const previousIntent = conversation.previousIntent;
   const mentionsSavedMaterial = Boolean(
      packet?.materials.some((material) => {
         const title = normalizePrompt(material.title);
         return title.length >= 4 && lower.includes(title);
      }),
   );

   if (!lower) {
      return "general";
   }

   // ALLEVIN MK VIII — conversational reference resolution.
   // Short follow-ups inherit the subject of the previous project turn instead
   // of being reclassified as generic chat.
   if (/^(?:why|why\s+(?:that|this|it|one)|why\s+that\s+one)\??$/.test(lower)) {
      if (previousIntent === "priority-fact" || previousIntent === "priority-decision") return "priority-rationale";
      if (previousIntent === "current-milestone" || previousIntent === "next-milestone" || previousIntent === "milestone-completion") return "milestone-rationale";
      return "rationale";
   }

   if (/^why does (?:that|this|it|that decision|this decision) matter (?:more than the others|most)\??$/.test(lower)) {
      return "priority-rationale";
   }

   if (/^(?:what happens after that|what comes after that|and then|what next after that)\??$/.test(lower)) {
      return "next-milestone";
   }

   if (/^(?:i finished it|i completed it|that is finished|that is complete|done with that|i finished that|i completed that)\.?$/.test(lower)) {
      return "milestone-completion";
   }

   if (/^(?:what changed|what did that change|how did that change the project)\??$/.test(lower) && previousIntent) {
      return "project-change";
   }

   if (
      /^(?:does that still make sense|is that still the right move|do you still recommend that|do you still think that is the right move|do you still think it is the right move|do you still think it is the right next move|do you still think that is the right next move|do you still think that's the right next move|do you still think that is the right order|is that still the right order|would you still recommend that)\??$/.test(
         lower,
      )
   ) {
      if (previousIntent === "current-milestone" || previousIntent === "milestone-rationale" || previousIntent === "next-milestone" || previousIntent === "milestone-completion") {
         return "milestone-fit";
      }

      return "recommendation-fit";
   }

   if (
      includesAny(lower, [
         "make that simpler",
         "simplify that",
         "say that more simply",
         "make it shorter",
         "shorten that",
         "give me more detail",
         "tell me more",
         "explain that",
         "can you explain that",
         "explain that in more detail",
         "give me an example",
         "show me an example",
         "expand on that",
         "what do you mean by that",
         "rewrite that",
         "make that more editorial",
         "make it less formal",
         "make it more direct",
      ])
   ) {
      return "conversation-transform";
   }

   if (
      includesAny(lower, [
         "what is the strongest part of the completed setup",
         "what is the strongest part of the completed project",
         "what is the strongest part of what was completed",
         "what is the strongest part of the finished result",
         "what is the strongest part of the final setup",
      ]) ||
      /\bstrongest part\b[^?]{0,100}\b(?:completed|finished|final|setup|result|project)\b/i.test(lower)
   ) {
      return "completed-project-strength";
   }

   if (
      includesAny(lower, [
         "what is the biggest remaining risk even though the milestone sequence is complete",
         "what is the biggest remaining risk even though the project is complete",
         "what is the biggest remaining risk after completion",
         "what risk remains after the project is complete",
      ]) ||
      /\b(?:biggest|main|primary|strongest) remaining risk\b[^?]{0,140}\b(?:complete|completed|finished|sequence)\b/i.test(lower)
   ) {
      return "completed-project-risk";
   }

   if (
      includesAny(lower, [
         "what should i observe during the first few real projects before spending the reserve",
         "what should i observe during the first few real projects before spending the $700 reserve",
         "what should i watch during the first real projects",
         "what should i measure during the first real projects",
      ]) ||
      /\b(?:observe|watch|measure|track|record)\b[^?]{0,120}\b(?:first few|first|initial)\b[^?]{0,80}\b(?:real )?(?:projects?|uses?|trials?|runs?)\b/i.test(lower)
   ) {
      return "completed-project-observations";
   }

   if (/\bunder what evidence should (?:i|we) reconsider\b/i.test(lower) || /\bwhat evidence would justify reconsidering\b/i.test(lower) || /\bwhat would need to happen before (?:i|we) reconsider\b/i.test(lower)) {
      return "conditional-option-reconsideration";
   }

   if (
      /\bdo you think postponing\b[^?]{0,140}\b(?:was|is) still the right decision\b/i.test(lower) ||
      /\bwas postponing\b[^?]{0,140}\bstill the right decision\b/i.test(lower) ||
      /\bdo you still think\b[^?]{0,140}\bpostpon(?:ing|ed)\b[^?]{0,100}\b(?:right|correct|best)\b/i.test(lower)
   ) {
      return "completed-decision-retrospective";
   }

   if (
      includesAny(lower, [
         "what milestones have been completed for this project",
         "what milestones have been completed",
         "which milestones have been completed",
         "what milestones are complete",
         "which milestones are complete",
         "show me the completed milestones",
         "list the completed milestones",
         "what project milestones are finished",
      ]) ||
      /\b(?:what|which|show|list)\b[^?]{0,80}\bmilestones?\b[^?]{0,80}\b(?:completed|complete|finished|done)\b/i.test(lower)
   ) {
      return "completed-milestones";
   }

   if (
      includesAny(lower, [
         "what are the most important decisions that remain in effect",
         "which decisions remain in effect",
         "what decisions remain in effect",
         "what decisions still apply",
         "which decisions still apply",
         "what confirmed decisions still matter",
         "which confirmed decisions still matter",
         "what decisions are still in force",
         "what decisions should still guide the project",
      ]) ||
      /\b(?:what|which)\b[^?]{0,80}\bdecisions?\b[^?]{0,80}\b(?:remain in effect|still apply|still matter|still govern|still guide|in force)\b/i.test(lower)
   ) {
      return "persistent-decisions";
   }

   if (
      includesAny(lower, [
         "what budget figures do you remember",
         "what budget numbers do you remember",
         "what do you remember about the budget",
         "summarize the budget figures",
         "summarize the budget numbers",
         "what was the recorded budget",
         "what budget amounts are recorded",
      ]) ||
      /\bwhat\b[^?]{0,80}\bbudget\b[^?]{0,80}\b(?:figures?|numbers?|amounts?)\b[^?]{0,80}\b(?:remember|recorded|saved|remain)\b/i.test(lower)
   ) {
      return "budget-memory";
   }

   if (
      includesAny(lower, [
         "which project material have you used and what did it establish",
         "which project material have you used, and what did it establish",
         "what project material have you used and what did it establish",
         "what project material have you used, and what did it establish",
         "which material have you used and what did it establish",
         "what material have you used and what did it establish",
         "which reference have you used and what did it establish",
         "what reference have you used and what did it establish",
         "which project material did you use",
         "what did the project material establish",
      ]) ||
      /\b(?:which|what)\b[^?]{0,100}\b(?:project )?(?:material|reference|document|source)\b[^?]{0,100}\b(?:used|use)\b[^?]{0,100}\b(?:establish|show|confirm|support)\b/i.test(lower)
   ) {
      return "material-history";
   }

   if (
      includesAny(lower, [
         "what are the most important facts",
         "what are the key facts",
         "what facts do you understand",
         "what do you understand about this project",
         "what do you understand so far",
         "what do you know about this project",
         "what do we know so far",
         "what is already established",
         "what context are you using",
         "summarize the key facts",
         "summarize the facts",
      ])
   ) {
      return "project-facts";
   }

   if (/^(?:what does (?:that|this|it) unlock|what will (?:that|this|it) unlock|what does it make possible)\??$/.test(lower)) {
      return "subject-unlock";
   }

   if (
      /\bwhich\s+(?:option|choice|alternative)\b[^?]{0,120}\b(?:recommend|choose|pick)\b/i.test(lower) ||
      /\bwhat\s+(?:option|choice|alternative)\b[^?]{0,120}\b(?:would you recommend|should i choose|should we choose)\b/i.test(lower) ||
      /\bwhat would you recommend\b[^?]{0,100}\b(?:among|between|from)\b[^?]{0,100}\b(?:options?|choices?|alternatives?)\b/i.test(lower)
   ) {
      return "option-recommendation";
   }

   if (
      /\bwhy is (?:that|this|the recommended) (?:option|choice|alternative) better than\b/i.test(lower) ||
      /\bwhy (?:choose|buy|use) (?:that|this|the recommended) (?:option|choice|alternative) instead of\b/i.test(lower) ||
      /\bhow is (?:that|this|the recommended) (?:option|choice|alternative) better than\b/i.test(lower)
   ) {
      return "option-vs-existing";
   }

   if (
      /\bstrongest argument against (?:your|that|this|the) recommendation\b/i.test(lower) ||
      /\bbest argument against (?:your|that|this|the) recommendation\b/i.test(lower) ||
      /\bwhat is the case against (?:your|that|this|the) recommendation\b/i.test(lower)
   ) {
      return "option-counterargument";
   }

   if (
      /\bunder what conditions? would you change (?:your|that|this|the) recommendation\b/i.test(lower) ||
      /\bwhat would change (?:your|that|this|the) recommendation\b/i.test(lower) ||
      /\bwhat would make you choose a different (?:option|choice|alternative)\b/i.test(lower)
   ) {
      return "option-change-condition";
   }

   if (
      /\bwould postponing\b[^?]{0,120}\b(?:purchase|buying|decision)\b[^?]{0,80}\b(?:better|smarter|safer|wiser)\b/i.test(lower) ||
      /\bshould (?:i|we) postpone\b[^?]{0,120}\b(?:purchase|buying|major tool|equipment)\b/i.test(lower) ||
      /\bwould it be better to wait\b[^?]{0,120}\b(?:buy|purchase|choose)\b/i.test(lower)
   ) {
      return "purchase-deferral";
   }

   if (
      includesAny(lower, ["what would a weak decision look like", "what would a bad decision look like", "what would a weak version of that decision look like", "how would i know the decision is too weak"]) ||
      /\bwhat would (?:a|the) weak (?:decision|choice|version) look like\b/i.test(lower)
   ) {
      return "decision-quality";
   }

   if (
      includesAny(lower, [
         "what would make that work good enough to move forward",
         "what would make this work good enough to move forward",
         "what would make it good enough to move forward",
         "when is that work good enough",
         "how do i know that work is good enough",
         "what standard should that work meet",
      ]) ||
      /\bwhat would make (?:that|this|the) work good enough\b/i.test(lower)
   ) {
      return "work-readiness-standard";
   }

   if (includesAny(lower, ["challenge your own recommendation", "challenge that recommendation", "challenge your recommendation", "make the strongest case against that", "what is the strongest argument against that"])) {
      return "challenge-recommendation";
   }

   if (
      includesAny(lower, [
         "what are the three most useful actions",
         "give me the three most useful actions",
         "what are the top three actions",
         "what should i do now in order",
         "what should i do next in order",
         "give me an ordered action plan",
         "which purchases and setup work should happen first",
         "what purchases and setup work should happen first",
         "which setup work should happen first",
      ]) ||
      /\b(?:which|what)\b[^?]{0,120}\b(?:purchases?|items?|equipment|supplies)\b[^?]{0,120}\b(?:setup|installation|build|implementation)\b[^?]{0,80}\b(?:first|priority|start)\b/i.test(lower) ||
      /\bwhat should (?:i|we) (?:buy|purchase|install|set up|build) first\b/i.test(lower)
   ) {
      return "ordered-actions";
   }

   if (
      /\bhow much\b.*\bbudget\b.*\b(?:committed|assigned|allocated|reserved|remaining|left)\b/i.test(lower) ||
      /\bhow much\b.*\b(?:committed|assigned|allocated)\b.*\bhow much\b.*\b(?:reserved|remaining|left)\b/i.test(lower) ||
      /\bwhat(?:'s| is)\b.*\b(?:committed|reserved|remaining)\b.*\bbudget\b/i.test(lower)
   ) {
      return "budget-status";
   }

   if (
      /\bwhich\b.*\b(?:purchases?|spending|costs?|categories)\b.*\b(?:required|needed|funded)\b/i.test(lower) ||
      /\bwhich\b.*\b(?:upgrades?|purchases?|items?)\b.*\b(?:deferred|optional|postponed|excluded)\b/i.test(lower) ||
      /\bwhat\b.*\b(?:required now|deferred upgrades?|optional upgrades?)\b/i.test(lower)
   ) {
      return "budget-scope";
   }

   if (
      /\bwhat (?:requirements?|criteria|constraints?|factors?) should control\b.*\bdecision\b/i.test(lower) ||
      /\bwhich (?:requirements?|criteria|constraints?|factors?) should guide\b.*\bdecision\b/i.test(lower) ||
      /\bwhat should control\b.*\b(?:tool|equipment|option|vendor|platform|format)\b.*\bdecision\b/i.test(lower)
   ) {
      return "decision-requirements";
   }

   if (
      includesAny(lower, [
         "honest senior project-lead assessment",
         "honest senior project lead assessment",
         "senior project-lead assessment",
         "senior project lead assessment",
         "assess this project honestly",
         "give me your honest assessment of the project",
      ])
   ) {
      return "senior-assessment";
   }

   if (includesAny(lower, ["which of those facts matters most", "which fact matters most", "which point matters most", "what matters most right now", "what is the most important fact", "what's the most important fact"])) {
      return "priority-fact";
   }

   if (includesAny(lower, ["what decision does that affect", "what decisions does that affect", "what decision does this affect", "what does that decision affect", "what does that recommendation affect", "what downstream decision does that affect"])) {
      return "decision-impact";
   }

   if (
      includesAny(lower, [
         "which decisions can now be made",
         "which decisions still need evidence",
         "what can we decide now",
         "what can i decide now",
         "which decisions are ready",
         "which decisions are not ready",
         "which decisions are now settled",
         "what decisions are now settled",
         "which decisions are settled now",
      ])
   ) {
      return "decision-status";
   }

   if (
      includesAny(lower, [
         "what assumptions am i making",
         "what assumptions am i currently making",
         "what assumptions are we making",
         "what assumptions are we currently making",
         "what are we assuming",
         "which assumptions need to be tested",
         "what assumptions need evidence",
         "what am i assuming",
      ])
   ) {
      return "assumptions";
   }

   if (
      includesAny(lower, [
         "what should i avoid deciding too early",
         "what should we avoid deciding too early",
         "what should not be decided yet",
         "which decision can wait",
         "what can wait until later",
         "what should i not finalize yet",
         "what should i deliberately postpone",
         "what should we deliberately postpone",
      ])
   ) {
      return "premature-decision";
   }

   if (
      includesAny(lower, [
         "what should i work on next within the current milestone",
         "what should i do within the current milestone",
         "what is the first task inside this milestone",
         "give me a concrete next action",
         "what is the smallest useful action inside this milestone",
         "what should i work on first inside that milestone",
         "what should i work on first inside this milestone",
      ])
   ) {
      return "next-action-detail";
   }

   if (
      includesAny(lower, [
         "what specific result would prove that milestone is complete",
         "what would prove this milestone is complete",
         "what proves the milestone is complete",
         "what needs to be true before moving to the next milestone",
         "what should be completed before moving to the next milestone",
         "what is the completion criteria for this milestone",
         "what evidence should i collect before moving beyond this milestone",
         "what evidence is still missing before it can be completed",
         "what evidence is still missing before this milestone can be completed",
         "what is still missing before this milestone can be completed",
         "what is still missing before the milestone can be completed",
         "what remains before this milestone can be completed",
         "what evidence would prove this new milestone is complete",
         "what evidence would prove the new milestone is complete",
      ])
   ) {
      return "milestone-completion-evidence";
   }

   if (
      includesAny(lower, [
         "what changed based on that update",
         "what changed based on that decision",
         "how does that update change the project",
         "how does that decision change the project",
         "what did that update change",
         "what did that decision change",
         "how does this new information change the project",
      ])
   ) {
      return "project-change";
   }

   if (
      includesAny(lower, [
         "why is that the current milestone",
         "why is this the current milestone",
         "why should that milestone come first",
         "why should this milestone come first",
         "why does this milestone come first",
         "why are we on this milestone",
         "why is that the right next milestone",
         "why is this the right next milestone",
         "why did the project move to that milestone",
      ])
   ) {
      return "milestone-rationale";
   }

   if (
      includesAny(lower, [
         "what is the next milestone after this one",
         "what's the next milestone after this one",
         "what is the next milestone",
         "what comes after this milestone",
         "what happens after the current milestone",
         "what comes after the current milestone",
      ])
   ) {
      return "next-milestone";
   }

   if (includesAny(lower, ["i finished the current milestone", "i completed the current milestone", "the current milestone is finished", "the current milestone is complete"])) {
      return "milestone-completion";
   }

   if (!/[?]$/.test(lower) && isDetailedProjectUpdateText(prompt)) {
      return "project-update";
   }

   if (includesAny(lower, ["what milestone did i just complete", "what changed after i completed that milestone", "what changed after completing that milestone", "what changed after i finished that milestone"])) {
      return "milestone-change";
   }

   if (
      includesAny(lower, [
         "does the current milestone still match the project",
         "does this milestone still match the project",
         "is the current milestone still the right one",
         "does the current milestone still need more work",
         "does this milestone still need more work",
         "is there more work needed on the current milestone",
      ])
   ) {
      return "milestone-fit";
   }

   if (
      includesAny(lower, [
         "what information is still missing before this project can move forward",
         "what information is missing",
         "what is still missing before we can move forward",
         "what do we still need to know",
         "what information is still missing before i should spend money",
         "what information is missing before i should spend money",
      ]) ||
      /^what information\b.*\bbefore\b/.test(lower)
   ) {
      return "missing-information";
   }

   if (includesAny(lower, ["what could go wrong if i skip the current milestone", "what happens if i skip the current milestone", "risk of skipping the current milestone"])) {
      return "skip-risk";
   }

   if (
      includesAny(lower, [
         "what project are we working on",
         "which project are we working on",
         "what project am i working on",
         "which project am i working on",
         "what is the active project",
         "what's the active project",
         "what is the current project",
         "what's the current project",
      ])
   ) {
      return "project-identity";
   }

   if (
      includesAny(lower, [
         "which earlier decisions and material findings should shape this milestone",
         "what earlier decisions and material findings should shape this milestone",
         "which earlier decisions should shape this milestone",
         "what earlier decisions should shape this milestone",
         "what prior decisions should shape this milestone",
         "which prior decisions should shape this milestone",
         "what should carry forward into this milestone",
         "what should carry into this milestone",
      ]) ||
      /\b(?:earlier|prior|previous|settled)\s+(?:decisions?|requirements?)\b.*\b(?:shape|inform|guide|carry into|carry forward)\b.*\b(?:this|current|new)\s+milestone\b/i.test(lower) ||
      /\b(?:decisions?|requirements?)\b.*\b(?:and|plus)\b.*\b(?:material|document|reference|source|assessment|report)\s+(?:findings?|evidence)\b.*\b(?:shape|inform|guide)\b.*\bmilestone\b/i.test(lower)
   ) {
      return "milestone-inputs";
   }

   if (/\b(?:which|what)\s+milestone\b.*\b(?:material|document|reference)\b/.test(lower) || /\b(?:material|document|reference)\b.*\b(?:which|what)\s+milestone\b/.test(lower)) {
      return "material-milestone";
   }

   if (
      /\b(?:does|can|did)\b.*\b(?:material|document|reference)\b.*\b(?:complete|finish|satisfy|support)\b.*\bmilestone\b/.test(lower) ||
      /\b(?:complete|finish|satisfy|support)\b.*\b(?:current|this|active)\s+milestone\b.*\b(?:material|document|reference)\b/.test(lower)
   ) {
      return "material-completion";
   }

   if (
      includesAny(lower, [
         "which material are you using",
         "what material are you using",
         "which document are you using",
         "what document are you using",
         "which reference are you using",
         "what reference are you using",
         "what source are you using for that answer",
         "which source are you using for that answer",
      ])
   ) {
      return "material-source";
   }

   if (
      /\bwhat (?:information|details?|findings?|evidence)\b.*\b(?:material|document|reference|assessment|report|source)\b.*\b(?:still matters?|still applies?|carry|carry over|inform|affect)\b/i.test(lower) ||
      /\bwhat\b.*\bfrom\b.*\b(?:material|document|reference|assessment|report|source)\b.*\b(?:still matters?|still applies?|carry|carry over|inform)\b/i.test(lower) ||
      /\bhow should\b.*\b(?:material|document|reference|assessment|report|source)\b.*\b(?:inform|shape|affect)\b.*\b(?:current|new|this)\s+milestone\b/i.test(lower)
   ) {
      return "material-carryover";
   }

   if (mentionsSavedMaterial && /\b(?:change|changes|changed|affect|affects|affected|add|adds|added|help|helps|support|supports|matter|matters)\b.*\bproject\b/.test(lower)) {
      return "material-impact";
   }

   if (
      includesAny(lower, [
         "what is the current milestone",
         "what's the current milestone",
         "what is the current focus of this project",
         "what's the current focus of this project",
         "what is the current focus",
         "what's the current focus",
         "which milestone is current",
         "which milestone are we on",
         "what milestone are we on",
         "what is the active milestone",
         "what's the active milestone",
         "current milestone",
         "active milestone",
      ])
   ) {
      return "current-milestone";
   }

   if (includesAny(lower, ["what does this material add", "what does the material add", "what does this document add", "what does the document add", "how does this material help", "how does this document help"])) return "material-impact";

   if (
      includesAny(lower, [
         "how does this material change what i should work on next",
         "how does the material change what i should work on next",
         "how should this material change the next step",
         "what should i do because of this material",
         "what should i do with this material",
      ])
   )
      return "material-next";

   if (
      includesAny(lower, [
         "does this material reveal a tension",
         "does this material reveal any tension",
         "does this material reveal tension",
         "does this material show a tension",
         "does this material show any tension",
         "does this document reveal a tension",
         "does this document reveal any tension",
         "does this document reveal tension",
         "does this document show a tension",
         "conflicting direction",
         "contradiction in this material",
         "contradiction in this document",
      ])
   )
      return "material-tension";

   if (
      includesAny(lower, [
         "what decisions are already made in this document",
         "what decisions are already made in this material",
         "what decisions are still unresolved in this document",
         "what decisions are still unresolved in this material",
         "what decisions does this material affect",
      ])
   )
      return "material-decisions";

   if (
      includesAny(lower, [
         "based on everything in the project and the pdf",
         "based on everything in the project and this document",
         "based on the project and the pdf",
         "based on the project and this material",
         "based on everything what would you recommend",
         "taking everything into account what would you recommend",
         "what would a senior project lead recommend",
         "what would you recommend based on the material",
      ])
   )
      return "material-recommendation";

   if (
      /\bcompare\b[^?]{0,140}\b(?:options?|choices?|alternatives?)\b/i.test(lower) ||
      /\b(?:options?|choices?|alternatives?)\b[^?]{0,140}\bagainst\b[^?]{0,100}\b(?:requirements?|criteria|constraints?|goal|budget)\b/i.test(lower) ||
      includesAny(lower, ["compare the options", "compare these options", "pros and cons", "tradeoff", "trade-off", "which direction"])
   )
      return "option-comparison";

   if (
      includesAny(lower, [
         "what is the most important unresolved decision",
         "what's the most important unresolved decision",
         "which unresolved decision is most important",
         "which unresolved decision has the greatest effect",
         "which unresolved decision should come first",
         "what unresolved decision should i handle first",
         "what is the highest priority unresolved decision",
         "what's the highest priority unresolved decision",
         "what is the top unresolved decision",
         "what's the top unresolved decision",
      ])
   )
      return "priority-decision";

   if (
      includesAny(lower, [
         "why is that the priority",
         "why is this the priority",
         "why is that highest priority",
         "why is this highest priority",
         "why does that come first",
         "why does this come first",
         "why does that matter most",
         "why does this matter most",
         "why is that the most important unresolved decision",
         "why is this the most important unresolved decision",
      ])
   )
      return "priority-rationale";

   if (
      includesAny(lower, [
         "why are you recommending that",
         "why do you recommend that",
         "why is that your recommendation",
         "why that recommendation",
         "why this recommendation",
         "why recommend that",
         "why recommend this",
         "what makes that the recommendation",
         "what makes this the recommendation",
      ])
   )
      return "material-rationale";

   if (includesAny(lower, ["why should i do that first", "why is that the next step", "why that first", "why this first"])) return "rationale";

   if (includesAny(lower, ["what progress points did you identify", "what are the progress points", "show me the progress points", "what milestones did you identify", "show me the milestones"])) return "progress-points";

   if (includesAny(lower, ["how do these relate", "how does this relate", "help me define how", "relate to each other", "relationship between"])) return "relationship";

   if (/\b(?:which|what)\b.*\bdecisions?\b.*\b(?:now )?(?:settled|confirmed|made|decided)\b/.test(lower)) return "decision-status";

   if (/\b(?:which|what)\b.*\bdecisions?\b.*\b(?:still |remain )?(?:open|unresolved|undecided)\b/.test(lower)) return "unresolved";

   if (includesAny(lower, ["what decisions are already made", "what decisions have already been made", "what decisions are confirmed", "what decisions have been confirmed", "which decisions are confirmed", "show me the confirmed decisions"]))
      return "decision";

   if (includesAny(lower, ["what have we decided", "what did we decide", "decisions so far", "what has changed since i started"])) return "conversation-summary";

   if (
      includesAny(lower, [
         "what decisions are still unresolved",
         "which decisions are still unresolved",
         "what decisions remain unresolved",
         "which decisions remain unresolved",
         "what decisions are still open",
         "which decisions are still open",
         "what is still unresolved",
         "what remains unresolved",
         "what is unresolved",
         "what is still open",
      ])
   )
      return "unresolved";

   if (
      includesAny(lower, [
         "what am i actually building",
         "what am i building",
         "explain this project",
         "what is this project",
         "what is this project about",
         "where does this project stand",
         "where am i in this project",
         "current state",
         "new engineer joining",
         "joining the team",
      ])
   )
      return "project-understanding";

   if (
      /^(?:finalize|define|decide|confirm|create|build|write|research|collect|design|implement|test|validate|prepare|deploy|launch|review|coordinate|schedule|organize|document|choose|establish|clarify)\b/.test(lower) &&
      lower.split(/\s+/).length >= 3 &&
      !lower.endsWith("?")
   )
      return "milestone-focus";

   if (
      includesAny(lower, [
         "what should i do first",
         "what do i do first",
         "what should happen first",
         "what should i start with",
         "what should i tackle first",
         "what should i prioritize first",
         "what should i do next",
         "what should i produce next",
         "what should i create next",
         "what should i work on",
         "what would you have me work on",
         "smartest next move",
         "next action",
         "next move",
         "what comes next",
         "where should i start",
         "smallest meaningful next action",
         "smallest next action",
         "smallest useful next action",
         "two hours",
         "one hour",
      ])
   )
      return "next-action";

   if (
      includesAny(lower, [
         "should i buy",
         "should we buy",
         "should i purchase",
         "which option",
         "which approach",
         "which choice",
         "looks strongest",
         "strongest right now",
         "best option",
         "has the best option changed",
         "should i add",
         "should we add",
         "should i commit",
         "should we commit",
      ])
   )
      return "decision";

   if (includesAny(lower, ["build order", "current order", "what order", "before i start", "before i move on", "should i move on", "dependencies", "depends on", "sequence"])) return "build-order";

   if (includesAny(lower, ["biggest risk", "what makes you nervous", "what am i overlooking", "what haven't i realized", "what is the risk", "technical debt", "block this project", "likely to fail"])) return "risk";

   if (
      includesAny(lower, [
         "enough evidence",
         "enough sources",
         "what sources am i missing",
         "which sources am i missing",
         "how many sources",
         "source requirement",
         "evidence requirement",
         "what evidence am i missing",
         "what evidence do we already have",
         "what evidence do i already have",
         "what evidence is already available",
         "what evidence is recorded",
         "what supports this milestone",
         "what supports the current milestone",
         "what supports the new milestone",
      ])
   )
      return "evidence";

   if (
      includesAny(lower, [
         "ready for testing",
         "ready to ship",
         "ready to release",
         "ready to write",
         "ready to draft",
         "can i start writing",
         "can i start drafting",
         "would you approve",
         "pass review",
         "is this ready",
         "is this project ready",
         "is this project complete",
         "is the project complete",
         "is it complete",
         "is it finished",
         "what is missing",
      ])
   )
      return "readiness";

   if (includesAny(lower, ["simplify", "too complicated", "overbuilding", "more complicated than", "what would you remove", "reduce scope", "too broad"])) return "simplification";

   if (includesAny(lower, ["if you were leading", "lead engineer", "project lead", "reviewing this sprint", "challenge my approach", "challenge that recommendation", "what would you reject", "be honest", "honest senior project-lead assessment"]))
      return "project-lead";

   if (includesAny(lower, ["material", "reference", "source", "evidence", "tester feedback", "project notes", "uploaded", "document"])) return "materials";

   return "general";
}

// ========================================
// Software reasoning profile
// ========================================

function buildSoftwareGuidance(packet: ProjectIntelligencePacket, fallbackNextAction?: string): ProfileGuidanceDraft {
   const current = packet.currentBuild;
   const next = packet.nextBuild;
   const dependency = getHighestPriorityDependency(packet);
   const feedbackConflict = findCompletedBuildFeedbackConflict(packet);
   const currentMaterial = getRelevantMaterialForBuild(packet.materials, current);
   const currentUnderstanding = current
      ? `${packet.projectTitle} is currently centered on ${getBuildLabel(current)}`
      : packet.currentState
        ? `${packet.projectTitle} is a software project currently at ${getFirstMeaningfulSentence(packet.currentState)}`
        : `${packet.projectTitle} is a software project, but the active implementation milestone is not explicit`;

   if (feedbackConflict) {
      return {
         currentUnderstanding,
         assessment: `${getBuildLabel(feedbackConflict.build)} is marked complete, but current tester feedback still challenges that status`,
         recommendation: `Reopen ${getBuildLabel(feedbackConflict.build)} and resolve the reported problem before advancing the roadmap`,
         reason: `The completion label and the available user evidence disagree: ${getFirstMeaningfulSentence(feedbackConflict.feedback)}`,
         watchOut: "Do not let roadmap status override unresolved behavior observed by testers",
         evidenceUsed: [feedbackConflict.feedback],
      };
   }

   if (dependency?.state === "unsatisfied") {
      return {
         currentUnderstanding,
         assessment: current ? `${getBuildLabel(current)} cannot be treated as ready while an earlier dependency is unresolved` : "The project has an unresolved dependency that makes the next implementation choice unreliable",
         recommendation: getDependencyAction(dependency),
         reason: "Later work would be built on an incomplete prerequisite and could create rework",
         watchOut: getReadinessWatchOut(packet),
         evidenceUsed: [dependency.text],
      };
   }

   if (!current) {
      const priority = packet.profileSignals.priorities[0];
      const explicitStarterAction = compactText(fallbackNextAction);
      const normalizedState = normalizePrompt(packet.currentState);
      const isStartingPoint = normalizedState.includes("starting point") || normalizedState.includes("not started") || normalizedState.includes("early concept") || normalizedState === "new";
      const recommendation = explicitStarterAction || (priority ? `Turn the stated priority into one active implementation milestone: ${priority}` : "Define one active implementation milestone with an explicit completion check");

      if (isStartingPoint && explicitStarterAction) {
         return {
            currentUnderstanding,
            assessment: "The project is new, so the immediate job is to turn the product idea into one testable user outcome",
            recommendation,
            reason: "That gives the first release a clear result to build and validate before secondary features compete for attention",
            watchOut: "Do not turn the starter into a broad feature list before the first end-to-end flow is defined",
            evidenceUsed: uniqueStrings([packet.currentState, explicitStarterAction, priority || ""]),
         };
      }

      return {
         currentUnderstanding,
         assessment: "The project has software context, but no reliable active build was detected",
         recommendation,
         reason: "A project lead cannot judge sequencing or readiness until the current implementation target is explicit",
         watchOut: "Avoid starting several features simply because the roadmap has not selected one active outcome",
         evidenceUsed: uniqueStrings([packet.currentState, priority || ""]),
      };
   }

   if (current.status === "blocked") {
      return {
         currentUnderstanding,
         assessment: `${getBuildLabel(current)} is blocked and should not move forward as normal active work`,
         recommendation: `Resolve the blocker on ${getBuildLabel(current)} before starting ${getBuildLabel(next) || "another build"}`,
         reason: "Starting later work would hide the blocked dependency rather than remove it",
         watchOut: getReadinessWatchOut(packet),
         evidenceUsed: uniqueStrings([...packet.profileSignals.blockedItems, ...packet.dependencies.filter((item) => item.state === "unsatisfied").map((item) => item.text)]),
      };
   }

   if (current.status === "ready-for-review") {
      const missingCheck = packet.readiness.missingChecks[0];

      return {
         currentUnderstanding,
         assessment: `${getBuildLabel(current)} has reached review, but review is not the same as completion`,
         recommendation: missingCheck ? `Close the first missing readiness check for ${getBuildLabel(current)}: ${missingCheck}` : `Review ${getBuildLabel(current)} against its completion criteria before changing its status to complete`,
         reason: "The next build should inherit validated behavior, not an unchecked assumption",
         watchOut: getReadinessWatchOut(packet),
         evidenceUsed: uniqueStrings([...current.readinessCriteria, missingCheck || ""]),
      };
   }

   if (current.status === "completed" && next) {
      return {
         currentUnderstanding,
         assessment: `${getBuildLabel(current)} is complete and ${getBuildLabel(next)} is the next unfinished milestone`,
         recommendation: `Start ${getBuildLabel(next)} with only its core end-to-end outcome in scope`,
         reason: "The previous prerequisite is complete, so the roadmap can advance without skipping unfinished work",
         watchOut: "Do not pull polish or later-build features into the first pass",
         evidenceUsed: [getBuildLabel(current), getBuildLabel(next)],
      };
   }

   const coreOutcome = getFirstMeaningfulSentence(current.description);

   return {
      currentUnderstanding,
      assessment: current.status === "in-progress" ? `${getBuildLabel(current)} is the active build and has not yet earned a move to the next milestone` : `${getBuildLabel(current)} is the first unfinished build in the roadmap`,
      recommendation: currentMaterial
         ? `Use ${currentMaterial.title} to make the next implementation decision inside ${getBuildLabel(current)}`
         : coreOutcome
           ? `Complete the core outcome of ${getBuildLabel(current)}: ${coreOutcome}`
           : compactText(fallbackNextAction) || `Define and complete one measurable outcome for ${getBuildLabel(current)}`,
      reason: currentMaterial ? "That material is directly aligned to the active build and gives the decision an evidence base" : "Finishing the active outcome preserves build order and makes readiness testable",
      watchOut: packet.profileSignals.technicalDebt[0] || getReadinessWatchOut(packet) || "Avoid starting the next build before the active outcome is validated",
      evidenceUsed: uniqueStrings([currentMaterial?.summary || "", ...current.readinessCriteria, ...packet.profileSignals.testerFeedback.slice(0, 2)]),
   };
}

// ========================================
// Research reasoning profile
// ========================================

function buildResearchGuidance(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const signals = packet.profileSignals;
   const required = signals.sourceCountRequired;
   const available = signals.sourceCountAvailable;
   const remaining = typeof required === "number" ? Math.max(0, required - available) : undefined;
   const framingComplete = Boolean(signals.researchQuestion && signals.deliverable && (signals.requirements.length || signals.successCriteria.length || signals.sourceRequirements.length));
   const currentUnderstanding = signals.currentStage
      ? `${packet.projectTitle} is currently in the ${getFirstMeaningfulSentence(signals.currentStage).replace(/\s+stage[.!?]?$/i, "")} stage`
      : `${packet.projectTitle} is in a research workflow centered on ${signals.researchQuestion || "an unresolved research question"}`;
   const dependency = getHighestPriorityDependency(packet);

   if (signals.blockedItems.length) {
      return {
         currentUnderstanding,
         assessment: "The research cannot advance cleanly while its explicit blocker remains unresolved",
         recommendation: `Resolve the first research blocker: ${signals.blockedItems[0]}`,
         reason: "Evidence collection or drafting around a known blocker would create work that may need to be discarded",
         watchOut: signals.blockedItems[1] || getReadinessWatchOut(packet),
         evidenceUsed: signals.blockedItems.slice(0, 3),
      };
   }

   if (!signals.researchQuestion) {
      return {
         currentUnderstanding,
         assessment: "The topic exists, but the question that should control source selection is not explicit",
         recommendation: "Write one answerable research question before collecting more material",
         reason: "Without a fixed question, source gathering becomes broad accumulation instead of evidence for a deliverable",
         watchOut: "Avoid choosing sources only because they mention the topic",
         evidenceUsed: uniqueStrings([packet.projectGoal, signals.deliverable]),
      };
   }

   if (!signals.deliverable) {
      return {
         currentUnderstanding,
         assessment: "The research question is present, but the expected output is not defined clearly enough to judge evidence needs",
         recommendation: "Define the final deliverable and its required form before expanding the research",
         reason: "A brief, presentation, report, and literature review require different depth and organization",
         watchOut: "Do not treat source count alone as proof that the research is ready",
         evidenceUsed: [signals.researchQuestion],
      };
   }

   if (typeof remaining === "number" && remaining > 0) {
      const allSourcesMissing = available === 0;
      const sourcePhrase = allSourcesMissing ? `the ${formatCount(required || remaining)} required ${(required || remaining) === 1 ? "source" : "sources"}` : `${formatCount(remaining)} additional credible ${remaining === 1 ? "source" : "sources"}`;

      return {
         currentUnderstanding,
         assessment: framingComplete ? `The project framing is complete enough to stop planning, but the evidence requirement is not yet met` : `The project has a usable research question, but it does not yet have the evidence required for drafting`,
         recommendation: `Collect ${sourcePhrase} for ${packet.projectTitle}`,
         reason: `The deliverable depends on evidence before writing, and only ${available} of ${required} required sources are currently available`,
         watchOut: "Use sources that directly support the research question with standards, findings, or practical evidence rather than broad topic summaries",
         evidenceUsed: uniqueStrings([signals.researchQuestion, ...signals.sourceRequirements, `${available} of ${required} required sources available`]),
      };
   }

   if (dependency?.state === "unsatisfied") {
      return {
         currentUnderstanding,
         assessment: "The source count may be sufficient, but an evidence dependency is still unresolved",
         recommendation: getDependencyAction(dependency),
         reason: "Drafting should begin only after the evidence needed to support the claim is available",
         watchOut: getReadinessWatchOut(packet),
         evidenceUsed: [dependency.text],
      };
   }

   if (signals.missingResearch.length) {
      return {
         currentUnderstanding,
         assessment: "The basic evidence set exists, but a named research gap remains",
         recommendation: `Close the first research gap with one targeted source search: ${signals.missingResearch[0]}`,
         reason: "A targeted gap search is more useful now than collecting more general background material",
         watchOut: "Do not add sources that duplicate evidence already collected",
         evidenceUsed: uniqueStrings([signals.missingResearch[0], ...packet.materials.slice(0, 3).map((item) => item.summary)]),
      };
   }

   if (!signals.outlineSections.length) {
      return {
         currentUnderstanding,
         assessment: "The required evidence is available, so the project is ready to move from collection into synthesis",
         recommendation: "Organize the evidence into an outline that moves from introduction to findings, examples, and conclusion",
         reason: "The sources now need assigned roles before prose is drafted, otherwise the brief may become a sequence of disconnected summaries",
         watchOut: "Each section should answer part of the research question rather than merely describe a source",
         evidenceUsed: packet.materials.slice(0, 5).map((item) => item.summary),
      };
   }

   if (!signals.currentDraft) {
      return {
         currentUnderstanding,
         assessment: "The research question, evidence, and document structure are ready for evidence-based drafting",
         recommendation: `Map each available source to the outline section and claim it supports before drafting prose`,
         reason: "That creates a traceable bridge between evidence and the final deliverable",
         watchOut: "Do not force every source into every section; use each source only where it supports a clear claim",
         evidenceUsed: uniqueStrings([...signals.outlineSections, ...packet.materials.slice(0, 5).map((item) => item.summary)]),
      };
   }

   return {
      currentUnderstanding,
      assessment: "The project has moved into evidence-based writing and should now be judged against its success criteria",
      recommendation: `Review the current draft against the first unmet success criterion: ${signals.successCriteria[0] || "every major claim is supported by a credible source"}`,
      reason: "At this stage, improving evidence coverage matters more than collecting more general background",
      watchOut: "Watch for unsupported claims, source summaries without synthesis, and sections that drift away from the research question",
      evidenceUsed: uniqueStrings([signals.currentDraft, ...signals.successCriteria]),
   };
}

// ========================================
// Writing reasoning profile
// ========================================

function buildWritingGuidance(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const signals = packet.profileSignals;
   const currentUnderstanding = signals.revisionStage
      ? `${packet.projectTitle} is in ${getFirstMeaningfulSentence(signals.revisionStage)}`
      : signals.currentStage
        ? `${packet.projectTitle} is currently at ${getFirstMeaningfulSentence(signals.currentStage)}`
        : `${packet.projectTitle} is a writing project without an explicit revision stage`;

   if (signals.blockedItems.length) {
      return {
         currentUnderstanding,
         assessment: "The draft should not advance until the explicit writing blocker is removed",
         recommendation: `Resolve the first writing blocker: ${signals.blockedItems[0]}`,
         reason: "Continuing to draft around missing information or approval creates avoidable revision work",
         watchOut: signals.blockedItems[1] || getReadinessWatchOut(packet),
         evidenceUsed: signals.blockedItems.slice(0, 3),
      };
   }

   if (!signals.audience) {
      return {
         currentUnderstanding,
         assessment: "The intended reader is not explicit, so clarity, tone, and detail decisions do not have a reliable target",
         recommendation: "Define the primary audience in one sentence before revising the draft",
         reason: "The same content should be organized and explained differently for classmates, executives, customers, or technical readers",
         watchOut: "Avoid polishing sentences before deciding who must understand and act on them",
         evidenceUsed: uniqueStrings([signals.deliverable, packet.projectGoal]),
      };
   }

   if (!signals.currentDraft && !signals.outlineSections.length) {
      return {
         currentUnderstanding,
         assessment: "The writing goal exists, but there is no detected structure or draft to revise",
         recommendation: `Create a section outline for ${signals.deliverable || packet.projectTitle} around the needs of ${signals.audience}`,
         reason: "Structure should establish the argument and information order before sentence-level writing begins",
         watchOut: "Keep each section tied to one purpose instead of creating headings that repeat the topic",
         evidenceUsed: uniqueStrings([signals.audience, signals.deliverable, ...signals.requirements]),
      };
   }

   if (!signals.currentDraft && signals.outlineSections.length) {
      return {
         currentUnderstanding,
         assessment: "The document structure exists and is ready to become a first draft",
         recommendation: `Draft the first substantive section, ${signals.outlineSections[0]}, for ${signals.audience}`,
         reason: "A complete section creates something concrete to evaluate without spreading effort across the entire document",
         watchOut: "Do not line-edit the opening sentences before the section's full point is present",
         evidenceUsed: uniqueStrings([signals.outlineSections[0], signals.audience, ...signals.requirements.slice(0, 3)]),
      };
   }

   const revisionLower = normalizePrompt(`${signals.revisionStage} ${signals.currentStage}`);
   const finalRevision = includesAny(revisionLower, ["final", "copy edit", "copyedit", "proofread", "polish"]);

   if (finalRevision) {
      return {
         currentUnderstanding,
         assessment: "The document is late enough in revision that structure should remain stable unless a requirement is still unmet",
         recommendation: `Run one final clarity and requirement pass for ${signals.audience}`,
         reason: "Late-stage work should remove ambiguity and omissions rather than reopen the entire document",
         watchOut: "Do not introduce new sections unless a success criterion is genuinely missing",
         evidenceUsed: uniqueStrings([signals.currentDraft, signals.audience, ...signals.successCriteria]),
      };
   }

   return {
      currentUnderstanding,
      assessment: "A draft exists, so the highest-value work is structural revision before polish",
      recommendation: `Revise the draft so every section has one clear purpose for ${signals.audience}`,
      reason: "Organization and missing information have more impact at this stage than word-level cleanup",
      watchOut: "Avoid spending the revision pass on tone and grammar while weak section order remains",
      evidenceUsed: uniqueStrings([signals.currentDraft, signals.audience, ...signals.successCriteria]),
   };
}

// ========================================
// Planning reasoning profile
// ========================================

function buildPlanningGuidance(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const signals = packet.profileSignals;
   const dependency = getDecisionBlockingDependency(packet);
   const validation = getPlanningValidationEvidence(packet);
   const understanding = packet.projectUnderstanding;
   const activeMilestone = understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId);
   const currentState = cleanInlineDecisionText(getFirstMeaningfulSentence(signals.currentStage) || packet.currentState);
   const currentUnderstanding = currentState
      ? `${packet.projectTitle} is currently in ${lowerSentenceStart(currentState)}`
      : activeMilestone
        ? `${packet.projectTitle} is currently focused on ${lowerSentenceStart(activeMilestone.title)}`
        : `${packet.projectTitle} has ${signals.milestones.length} detected milestone${signals.milestones.length === 1 ? "" : "s"}`;

   if (signals.blockedItems.length) {
      return {
         currentUnderstanding,
         assessment: "The plan should not advance around an explicit blocker.",
         recommendation: `Resolve the first blocked item: ${signals.blockedItems[0]}`,
         reason: "Downstream commitments are unreliable while a prerequisite is explicitly blocked.",
         watchOut: signals.blockedItems[1] || "Do not open additional work until the blocker has an owner and a resolution path.",
         evidenceUsed: signals.blockedItems.slice(0, 4),
      };
   }

   if (validation.failure) {
      return {
         currentUnderstanding,
         assessment: "The project has reached a validation gap: the work exists, but the intended result has not passed its check.",
         recommendation: activeMilestone ? `Correct the failed condition inside ${activeMilestone.title.replace(/[.!?]+$/, "")}, then repeat the same validation` : "Correct the failed condition, then repeat the same validation",
         reason: ensureSentence(validation.failure),
         watchOut: signals.knownRisks[0] || "Do not confuse completing the work with proving that the result works.",
         evidenceUsed: uniqueStrings([validation.failure, ...validation.successCriteria, ...packet.materials.slice(0, 3).map((item) => item.details || item.summary)], 12),
      };
   }

   if (dependency) {
      return {
         currentUnderstanding,
         assessment: "The next major decision depends on a prerequisite that is not yet verified.",
         recommendation: `Verify the first decision gate: ${dependency.text}`,
         reason: "That fact can change the practical options, so it should be resolved before money, dates, or downstream work are committed.",
         watchOut: signals.knownRisks[0] || "Do not let the easiest-looking option become the default before the deciding evidence is available.",
         evidenceUsed: uniqueStrings([dependency.text, ...signals.assumptions, ...signals.availableEvidence], 12),
      };
   }

   if (!signals.milestones.length && !understanding.milestones.length) {
      return {
         currentUnderstanding,
         assessment: "The objective exists, but the plan does not yet contain outcome-based checkpoints.",
         recommendation: "Define only the milestones that mark a real change in project state: what must be known, decided, produced, and validated",
         reason: "A task list cannot replace a dependency-aware path from the current state to the finished outcome.",
         watchOut: "Do not pad the roadmap with steps that merely restate planning activity.",
         evidenceUsed: uniqueStrings([packet.projectGoal, signals.deliverable], 6),
      };
   }

   if (signals.options.length && signals.assumptions.length) {
      return {
         currentUnderstanding,
         assessment: "The project is at a decision gate, not a scheduling gap.",
         recommendation: "Test the assumption that separates the leading options before making an irreversible commitment",
         reason: ensureSentence(signals.assumptions[0]),
         watchOut: signals.knownRisks[0] || "Do not build the schedule around an option that has not earned selection.",
         evidenceUsed: uniqueStrings([...signals.options, ...signals.assumptions, ...signals.constraints], 14),
      };
   }

   if (activeMilestone) {
      const firstOpenQuestion = getScopedMilestoneOpenQuestions(activeMilestone)[0];
      const firstCompletionCheck = getScopedMilestoneCompletionCriteria(activeMilestone)[0];

      return {
         currentUnderstanding,
         assessment: activeMilestone.whyItMatters ? ensureSentence(activeMilestone.whyItMatters) : "The active milestone is the earliest unfinished outcome the later work depends on.",
         recommendation: firstOpenQuestion
            ? `Resolve this inside the milestone: ${firstOpenQuestion}`
            : activeMilestone.startingPrompt
              ? activeMilestone.startingPrompt
              : `Produce the first observable result for ${activeMilestone.title.replace(/[.!?]+$/, "")}`,
         reason: firstCompletionCheck ? `The milestone can move when this evidence exists: ${ensureSentence(firstCompletionCheck)}` : understanding.whatItUnlocks ? ensureSentence(understanding.whatItUnlocks) : "",
         watchOut: activeMilestone.risks[0] || signals.knownRisks[0] || "",
         evidenceUsed: uniqueStrings([activeMilestone.title, activeMilestone.whyItMatters, firstOpenQuestion || "", firstCompletionCheck || "", ...signals.constraints], 12),
      };
   }

   const firstMilestone = understanding.milestones.find((milestone) => milestone.status !== "complete")?.title || signals.milestones[0];

   return {
      currentUnderstanding,
      assessment: "The plan has enough structure to move, but it needs one active outcome rather than several parallel priorities.",
      recommendation: firstMilestone ? `Make ${firstMilestone.replace(/[.!?]+$/, "")} the single active milestone` : "Define the first unfinished outcome and its completion evidence",
      reason: "One active outcome makes progress, decisions, and blockers visible without spreading attention across the whole roadmap.",
      watchOut: getReadinessWatchOut(packet),
      evidenceUsed: uniqueStrings([firstMilestone || "", ...signals.priorities, ...packet.dependencies.slice(0, 3).map((item) => item.text)], 10),
   };
}

// ========================================
// Checklist reasoning profile
// ========================================

function buildChecklistGuidance(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const items = packet.profileSignals.checklistItems;
   const active = items.find((item) => item.status === "in-progress");
   const next = active || items.find((item) => item.status === "not-started");
   const completedCount = items.filter((item) => item.status === "completed").length;
   const currentUnderstanding = `${packet.projectTitle} has ${completedCount} of ${items.length} detected checklist items complete`;

   if (packet.profileSignals.blockedItems.length) {
      return {
         currentUnderstanding,
         assessment: "The checklist has an explicit blocker that takes priority over starting another item",
         recommendation: `Resolve the first checklist blocker: ${packet.profileSignals.blockedItems[0]}`,
         reason: "Starting more items would increase work in progress without clearing the path to completion",
         watchOut: packet.profileSignals.blockedItems[1] || "Do not mark dependent items complete while the blocker remains",
         evidenceUsed: packet.profileSignals.blockedItems.slice(0, 3),
      };
   }

   if (!items.length) {
      return {
         currentUnderstanding: `${packet.projectTitle} is being treated as a checklist project, but no status-bearing checklist items were detected`,
         assessment: "The engine cannot identify completed, active, or remaining work reliably",
         recommendation: "Add explicit checkbox states to the project's actionable items",
         reason: "A checklist only supports sequencing when each item has a visible completion state",
         watchOut: "Avoid mixing reference notes into the actionable checklist",
         evidenceUsed: [],
      };
   }

   if (!next) {
      return {
         currentUnderstanding,
         assessment: "Every detected checklist item is complete",
         recommendation: "Run one final verification against the project's success criteria before closing it",
         reason: "Completed boxes confirm task status, but not necessarily that the intended outcome was achieved",
         watchOut: "Watch for items marked complete without evidence of the final result",
         evidenceUsed: items.map((item) => item.text),
      };
   }

   return {
      currentUnderstanding,
      assessment: active ? `${active.text} is already in progress and should be finished before another item is opened` : `${next.text} is the first unfinished actionable item`,
      recommendation: `Complete ${next.text}`,
      reason: active ? "Finishing active work keeps the checklist from accumulating partially completed items" : "It is the earliest unfinished action detected in the current workflow",
      watchOut: "Do not start lower-priority checklist items simply because they are easier to finish",
      evidenceUsed: [next.text],
   };
}

function getSituationalSentences(value?: string) {
   return uniqueStrings(
      compactText(value, 9000)
         .split(/(?<=[.!?])\s+/)
         .map((sentence) => compactText(sentence, 700))
         .filter(Boolean),
      8,
   );
}

function getTimeSensitiveSituation(packet: ProjectIntelligencePacket) {
   const sentences = getSituationalSentences(packet.currentState);
   return sentences.find((sentence) => /\b(?:today|tomorrow|tonight)\b/i.test(sentence)) || sentences.find((sentence) => /\b(?:due|deadline|this week)\b/i.test(sentence)) || sentences.find((sentence) => /\bscheduled\b/i.test(sentence)) || "";
}

function turnSituationIntoAction(value?: string) {
   const sentence = compactText(value, 700).replace(/[.!?]+$/, "");

   if (!sentence) {
      return "";
   }

   const needPassive = sentence.match(/^The\s+(.+?)\s+needs?\s+to\s+be\s+(.+)$/i);
   if (needPassive) {
      const subject = needPassive[1].trim();
      const remainder = needPassive[2].replace(/\s+so\b[\s\S]*$/i, "").trim();
      const passiveAction = remainder.match(/^(sent|confirmed|booked|tested|finished|completed)(?:\s+(.*))?$/i);

      if (passiveAction) {
         const verbMap: Record<string, string> = {
            sent: "Send",
            confirmed: "Confirm",
            booked: "Book",
            tested: "Test",
            finished: "Finish",
            completed: "Complete",
         };
         const verb = verbMap[passiveAction[1].toLowerCase()] || "Complete";
         const timing = compactText(passiveAction[2]);
         return `${verb} the ${subject}${timing ? ` ${timing}` : ""}`;
      }
   }

   const needActive = sentence.match(/^(?:I|We|You)\s+need\s+to\s+(.+)$/i);
   if (needActive) {
      return needActive[1];
   }

   const direct = sentence.match(/^(?:Need to|Must|Should|Have to)\s+(.+)$/i);
   if (direct) {
      return direct[1];
   }

   return sentence;
}

function getFirstOpenProjectOutcome(packet: ProjectIntelligencePacket, fallbackNextAction?: string) {
   const urgent = getTimeSensitiveSituation(packet);

   if (urgent) {
      return turnSituationIntoAction(urgent);
   }

   if (packet.currentBuild?.title) {
      return packet.currentBuild.title;
   }

   const unsatisfied = getHighestPriorityDependency(packet);
   if (unsatisfied?.text) {
      return unsatisfied.text;
   }

   return compactText(fallbackNextAction) || packet.profileSignals.priorities[0] || packet.profileSignals.milestones[0] || packet.profileSignals.requirements[0] || "";
}

function getProjectLeadReason(packet: ProjectIntelligencePacket, outcome: string) {
   const stateSentences = getSituationalSentences(packet.currentState);
   const urgent = getTimeSensitiveSituation(packet);
   const causalClause = urgent.match(/\bso\s+(.+)$/i)?.[1]?.replace(/[.!?]+$/, "");
   const supporting = stateSentences.find((sentence) => sentence !== urgent && !/^the remaining work includes/i.test(sentence) && getTextOverlapScore(sentence, outcome) < 2);
   const dependency = getHighestPriorityDependency(packet);

   if (causalClause) {
      return `That matters because ${lowerSentenceStart(causalClause)}`;
   }

   if (dependency?.text && !outcome.toLowerCase().includes(dependency.text.toLowerCase())) {
      return `It affects what can be decided or completed after it: ${lowerSentenceStart(dependency.text)}`;
   }

   if (supporting) {
      return supporting;
   }

   if (packet.projectGoal) {
      return `That is the clearest step that moves the project toward ${lowerSentenceStart(packet.projectGoal)}`;
   }

   return "Finishing it creates a clear handoff to the next unfinished part of the project";
}

function getLeadState(packet: ProjectIntelligencePacket) {
   return packet.projectLeadState;
}

function buildNaturalNextActionGuidance(packet: ProjectIntelligencePacket, fallbackNextAction?: string): ProfileGuidanceDraft {
   const lead = getLeadState(packet);
   const nextMove = lead.nextMove || getFirstOpenProjectOutcome(packet, fallbackNextAction);
   const after = lead.afterNextMove;

   return {
      currentUnderstanding: "",
      assessment: lead.whyNow || `${nextMove} is the clearest unfinished outcome`,
      recommendation: ensureSentence(nextMove),
      reason: after ? `Once that is moving, ${lowerSentenceStart(after)}` : getProjectLeadReason(packet, nextMove),
      watchOut: lead.risks[0] || "",
      evidenceUsed: uniqueStrings([nextMove, lead.whyNow, after, ...lead.unresolvedWork.slice(0, 4)]),
   };
}

function buildNaturalRiskGuidance(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const lead = getLeadState(packet);
   const primary = lead.risks[0];
   const secondary = lead.risks[1];
   const opportunity = lead.opportunities[0];

   if (!primary) {
      return {
         ...draft,
         assessment: "Nothing in the notes points to a hidden blocker yet, but ownership and validation are still worth checking",
         recommendation: lead.nextMove ? ensureSentence(lead.nextMove) : draft.recommendation,
         reason: opportunity || "Those are the two places where execution plans most often become fragile",
         watchOut: "",
         evidenceUsed: lead.unresolvedWork.slice(0, 5),
      };
   }

   return {
      ...draft,
      currentUnderstanding: "",
      assessment: primary,
      recommendation: "",
      reason: secondary || lead.whyNow || draft.reason,
      watchOut: opportunity || "",
      evidenceUsed: uniqueStrings([primary, secondary || "", opportunity || "", ...lead.unresolvedWork.slice(0, 4)]),
   };
}

function getProjectLeadWorkLabel(value?: string) {
   const clean = compactText(value, 900)
      .replace(/[.!?]+$/, "")
      .replace(/^(?:complete|finish|confirm|decide|define|choose|prepare|create|build|test|review)\s+/i, "")
      .replace(/^the\s+/i, "")
      .trim();

   return lowerSentenceStart(clean);
}

function buildNaturalReadinessGuidance(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const lead = getLeadState(packet);
   const remaining = lead.unresolvedWork;

   if (!remaining.length && packet.readiness.state === "complete") {
      return {
         ...draft,
         currentUnderstanding: "",
         assessment: "The project looks ready based on the work currently captured",
         recommendation: "Run one final confirmation against the finished outcome before closing it",
         reason: "That protects against a checked box hiding a missed handoff or validation step",
         watchOut: lead.risks[0] || "",
         evidenceUsed: uniqueStrings([lead.goal, ...packet.profileSignals.successCriteria]),
      };
   }

   const labels = uniqueStrings(remaining.map(getProjectLeadWorkLabel), 6);
   const first = labels[0] || getProjectLeadWorkLabel(lead.nextMove) || "the current priority";
   const rest = labels.slice(1);
   const rawRestLine = rest.length ? `${rest.slice(0, -1).join(", ")}${rest.length > 1 ? ", and " : ""}${rest[rest.length - 1]} also remain unresolved.` : "";
   const restLine = rawRestLine ? `${rawRestLine.charAt(0).toUpperCase()}${rawRestLine.slice(1)}` : "";

   return {
      ...draft,
      currentUnderstanding: "",
      assessment: `Not yet. ${first.charAt(0).toUpperCase()}${first.slice(1)} is still unresolved. ${restLine}`.trim(),
      recommendation: "",
      reason: lead.whyNow || "The project is not ready until the remaining execution work is confirmed",
      watchOut: lead.risks[0] || "",
      evidenceUsed: uniqueStrings([...remaining.slice(0, 6), lead.whyNow]),
   };
}

// ========================================
// General reasoning profile
// ========================================

function buildGeneralGuidance(packet: ProjectIntelligencePacket, fallbackNextAction?: string): ProfileGuidanceDraft {
   return buildNaturalNextActionGuidance(packet, fallbackNextAction);
}

function buildProfileGuidance(packet: ProjectIntelligencePacket, fallbackNextAction?: string) {
   switch (packet.reasoningProfile) {
      case "software":
         return buildSoftwareGuidance(packet, fallbackNextAction);
      case "research":
         return buildResearchGuidance(packet);
      case "writing":
         return buildWritingGuidance(packet);
      case "planning":
         return buildPlanningGuidance(packet);
      case "checklist":
         return buildChecklistGuidance(packet);
      case "general":
      default:
         return buildGeneralGuidance(packet, fallbackNextAction);
   }
}

// ========================================
// Intent-aware judgment
// ========================================

function getProfileWorkflowReason(packet: ProjectIntelligencePacket) {
   const dependency = getHighestPriorityDependency(packet);

   if (dependency) {
      return dependency.state === "satisfied" ? `The detected prerequisite is satisfied: ${dependency.text}` : `The detected prerequisite must be resolved first: ${dependency.text}`;
   }

   if (packet.reasoningProfile === "software") {
      if (packet.currentBuild && packet.nextBuild) {
         return `${getBuildLabel(packet.nextBuild)} should follow ${getBuildLabel(packet.currentBuild)} only after the active build is validated`;
      }

      return packet.currentBuild ? `${getBuildLabel(packet.currentBuild)} is the last unfinished build currently detected` : "No ordered active software build was detected";
   }

   if (packet.reasoningProfile === "research") {
      return "Research framing comes before source selection, and evidence collection comes before evidence-based drafting";
   }

   if (packet.reasoningProfile === "writing") {
      return "Audience and structure should be settled before sentence-level polish";
   }

   if (packet.reasoningProfile === "planning") {
      return "Milestones and dependencies should determine timing before the full schedule is committed";
   }

   if (packet.reasoningProfile === "checklist") {
      return "Active and earlier unfinished items should be completed before lower-priority items are opened";
   }

   return "The smallest action that changes the project state should come before additional scope";
}

function getReadinessAssessment(packet: ProjectIntelligencePacket) {
   const state = packet.readiness.state;

   if (state === "complete") {
      return "The detected completion conditions are satisfied";
   }

   if (state === "blocked") {
      return `The project is not ready to advance because it is blocked${packet.readiness.missingChecks[0] ? ` by ${packet.readiness.missingChecks[0]}` : ""}`;
   }

   if (state === "needs-review") {
      return "The work is ready for review, but it should not be treated as complete yet";
   }

   if (state === "in-progress") {
      return packet.readiness.missingChecks.length ? `The project is in progress but not ready to advance because ${packet.readiness.missingChecks[0]}` : "The project has enough structure to continue, but the current work is still in progress";
   }

   if (state === "not-started") {
      return `The project is not ready to advance because ${packet.readiness.missingChecks[0] || "its starting structure is incomplete"}`;
   }

   return "The available project state is not strong enough for a confident readiness approval";
}

function getMaterialsAssessment(packet: ProjectIntelligencePacket) {
   if (!packet.materials.length) {
      return "No project materials are currently available to confirm or challenge the project state";
   }

   if (packet.reasoningProfile === "research") {
      const required = packet.profileSignals.sourceCountRequired;
      const available = packet.profileSignals.sourceCountAvailable;

      return typeof required === "number" ? `${available} of ${required} required research sources are currently available` : `${available} research source${available === 1 ? " is" : "s are"} currently available`;
   }

   if (packet.reasoningProfile === "software" && packet.currentBuild) {
      const relevant = getRelevantMaterialForBuild(packet.materials, packet.currentBuild);

      return relevant ? `${relevant.title} is directly aligned to ${getBuildLabel(packet.currentBuild)}` : `Materials exist, but none are explicitly aligned to ${getBuildLabel(packet.currentBuild)}`;
   }

   const firstEvidence = packet.evidence.find((item) => item.source === "material");

   return firstEvidence
      ? `The materials provide this usable project evidence: ${getEvidenceText(firstEvidence)}`
      : `${packet.materials.length} project material${packet.materials.length === 1 ? " is" : "s are"} available, but their role in the next decision is not explicit`;
}

function getSimplificationJudgment(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft) {
   if (packet.reasoningProfile === "software") {
      return packet.currentBuild ? `Reduce the active scope to one end-to-end outcome inside ${getBuildLabel(packet.currentBuild)}` : "Reduce the software scope to one active milestone and one definition of done";
   }

   if (packet.reasoningProfile === "research") {
      return `Keep the research bounded by this question: ${packet.profileSignals.researchQuestion || packet.projectGoal || "the project's central question"}`;
   }

   if (packet.reasoningProfile === "writing") {
      return "Reduce the next revision to one audience, one document purpose, and one structural pass";
   }

   if (packet.reasoningProfile === "planning") {
      const milestones = packet.projectUnderstanding.milestones.filter((milestone) => milestone.status !== "complete").sort((left, right) => left.order - right.order);

      if (milestones.length) {
         const first = milestones[0];
         const second = milestones[1];
         const third = milestones.find((milestone) => /\b(?:test|validate|review|pilot|acceptance|evidence)\b/i.test(milestone.title));

         const gates = uniqueStrings([first?.title || "", second?.title || "", third?.title || ""], 3);
         if (gates.length >= 2) {
            return `Keep the plan to these dependency gates for now: ${gates.join(" → ")}`;
         }

         return `Keep ${first.title.replace(/[.!?]+$/, "")} as the only active outcome until its completion evidence exists`;
      }

      return "Reduce the plan to the earliest unresolved dependency, one usable result, and one validation pass";
   }

   if (packet.reasoningProfile === "checklist") {
      return "Reduce execution to the first active or unfinished checklist item";
   }

   return draft.assessment;
}

function getResearchEvidenceIntentDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const required = packet.profileSignals.sourceCountRequired;
   const available = packet.profileSignals.sourceCountAvailable;

   if (typeof required !== "number") {
      return {
         ...draft,
         assessment: getMaterialsAssessment(packet),
         reason: "The project does not define a numeric source requirement, so evidence quality and coverage matter more than a raw count",
      };
   }

   const remaining = Math.max(0, required - available);

   if (remaining > 0) {
      return {
         ...draft,
         assessment: `No. ${available} of ${required} required research sources are currently available`,
         recommendation: `Collect ${formatCount(remaining)} additional credible ${remaining === 1 ? "source" : "sources"} before drafting`,
         reason: "The brief depends on evidence before writing, so drafting now would leave its findings unsupported",
         watchOut: "Use sources that directly support the research question with standards, findings, or practical evidence rather than broad topic summaries",
         evidenceUsed: uniqueStrings([...draft.evidenceUsed, `${available} of ${required} required sources available`]),
      };
   }

   return {
      ...draft,
      assessment: `Yes. The project has all ${required} required research sources`,
      recommendation: packet.profileSignals.outlineSections.length ? "Map each source to the outline section and claim it supports before drafting prose" : "Organize the evidence into an outline before drafting",
      reason: "The source-count dependency is satisfied, so the next meaningful step is synthesis rather than more general collection",
      watchOut: "Confirm that each source directly supports a claim; meeting the count alone does not guarantee enough evidence quality",
      evidenceUsed: uniqueStrings([...packet.materials.slice(0, 5).map((item) => item.summary), `${available} of ${required} required sources available`]),
   };
}

function getResearchReadinessIntentDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const required = packet.profileSignals.sourceCountRequired;
   const available = packet.profileSignals.sourceCountAvailable;

   if (typeof required === "number" && available < required) {
      const remaining = required - available;

      return {
         ...draft,
         assessment: `No, not yet. The outline is ready, but ${formatCount(remaining)} required ${remaining === 1 ? "source is" : "sources are"} still missing`,
         recommendation: `Collect ${formatCount(remaining)} additional credible ${remaining === 1 ? "source" : "sources"} before drafting`,
         reason: "The brief needs evidence before its findings can be written responsibly",
         watchOut: "Use sources that directly support the research question rather than broad topic summaries",
         evidenceUsed: uniqueStrings([...draft.evidenceUsed, `${available} of ${required} required sources available`]),
      };
   }

   return {
      ...draft,
      assessment: getReadinessAssessment(packet),
      reason: packet.readiness.reason || draft.reason,
   };
}

function lowerSentenceStart(value?: string) {
   const clean = compactText(value);

   if (!clean) {
      return "";
   }

   if (/^A\s+/.test(clean)) {
      return `a ${clean.slice(2)}`;
   }

   if (!/^[A-Z][a-z]/.test(clean)) {
      return clean;
   }

   return `${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
}

function getRelevantPlanningRisks(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const activeMilestone = understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId);
   const context = compactText([packet.currentState, activeMilestone?.title || "", activeMilestone?.goal || "", activeMilestone?.whyItMatters || "", ...understanding.openWork.slice(0, 5)].join(" "), 8000);

   const severityRank: Record<ProjectRiskSignal["severity"], number> = {
      high: 3,
      medium: 2,
      low: 1,
   };

   return [...packet.risks]
      .sort((left, right) => {
         const relevanceDifference = getTextOverlapScore(right.text, context) - getTextOverlapScore(left.text, context);
         if (relevanceDifference !== 0) return relevanceDifference;
         return severityRank[right.severity] - severityRank[left.severity];
      })
      .map((risk) => risk.text)
      .filter(Boolean);
}

function getPlanningRiskIntentDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const risks = getRelevantPlanningRisks(packet);
   const dependency = getDecisionBlockingDependency(packet);
   const primary = risks[0] || getHighestRisk(packet)?.text;
   const secondary = uniqueStrings(risks.slice(1, 3));

   return {
      ...draft,
      assessment: primary ? `The main risk is ${lowerSentenceStart(primary)}` : "The project does not yet contain enough explicit evidence to name a defensible primary risk.",
      recommendation: dependency ? `Reduce the risk by resolving this decision gate first: ${dependency.text}` : draft.recommendation,
      reason: secondary.length ? `The next risks behind it are ${secondary.map(lowerSentenceStart).join("; ")}.` : dependency ? "That dependency can change the options and make an early commitment unnecessary." : draft.reason,
      watchOut: risks[3] || draft.watchOut,
      evidenceUsed: uniqueStrings([primary || "", ...secondary, dependency?.text || ""], 8),
   };
}

function applyIntent(intent: ProjectGuidanceIntent, packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft, prompt: string): ProfileGuidanceDraft {
   if (intent === "project-understanding") {
      return {
         ...draft,
         assessment: `${packet.reasoningProfile} project detected. ${draft.assessment}`,
         reason: getProfileWorkflowReason(packet),
      };
   }

   if (intent === "build-order") {
      return {
         ...draft,
         assessment: getProfileWorkflowReason(packet),
         reason: draft.reason,
      };
   }

   if (intent === "risk" || intent === "completed-project-risk") {
      if (packet.reasoningProfile === "planning") {
         return getPlanningRiskIntentDraft(packet, draft);
      }

      return buildNaturalRiskGuidance(packet, draft);
   }

   if (intent === "decision") {
      return packet.reasoningProfile === "planning"
         ? getPlanningDecisionDraft(packet, draft, prompt)
         : {
              ...draft,
              assessment: `The decision should be made from the active project's evidence, constraints, and dependencies`,
           };
   }

   if (intent === "evidence") {
      return packet.reasoningProfile === "research"
         ? getResearchEvidenceIntentDraft(packet, draft)
         : {
              ...draft,
              assessment: getMaterialsAssessment(packet),
           };
   }

   if (intent === "readiness") {
      if (packet.reasoningProfile === "research") {
         return getResearchReadinessIntentDraft(packet, draft);
      }

      if (packet.reasoningProfile === "planning") {
         return getPlanningReadinessIntentDraft(packet, draft);
      }

      return buildNaturalReadinessGuidance(packet, draft);
   }

   if (intent === "simplification") {
      return {
         ...draft,
         assessment: getSimplificationJudgment(packet, draft),
         reason: "Narrowing the active scope keeps the next outcome measurable and prevents later work from hiding an unfinished core",
      };
   }

   if (intent === "project-lead") {
      return {
         ...draft,
         assessment: `From a project-lead view, ${draft.assessment}`,
      };
   }

   if (intent === "materials") {
      return {
         ...draft,
         assessment: getMaterialsAssessment(packet),
         reason: draft.reason,
         evidenceUsed: uniqueStrings([...packet.materials.slice(0, 5).map((item) => item.summary), ...draft.evidenceUsed]),
      };
   }

   return draft;
}

function formatWatchOut(value?: string) {
   const clean = cleanProjectRiskText(value);

   if (!clean || /add the current state|record the current state|intended outcome|before-and-after condition/i.test(clean)) {
      return "";
   }

   if (
      /^(?:avoid|do not|don't|make sure|confirm|verify|watch|keep|book|send|test|coordinate|reserve|revisit|treat|use|finish|resolve|decide|define|write|the project should|the material should|the current option should|the active milestone should|i['’]d|i would)\b/i.test(
         clean,
      )
   ) {
      return ensureSentence(clean);
   }

   if (/^(?:A|An|The|IT|A\/V)\s+/i.test(clean) || /\b(?:could|may|might|is not|are not|remains?|would)\b/i.test(clean)) {
      return ensureSentence(clean);
   }

   return ensureSentence(`One thing to keep an eye on is ${lowerSentenceStart(clean)}`);
}

function formatResponse(draft: ProfileGuidanceDraft, intent?: ProjectGuidanceIntent, coachingMode: ProjectCoachingMode = "direct") {
   const directLookupIntents: ProjectGuidanceIntent[] = [
      "project-identity",
      "current-milestone",
      "decision",
      "unresolved",
      "priority-decision",
      "priority-rationale",
      "rationale",
      "option-comparison",
      "option-recommendation",
      "option-vs-existing",
      "option-counterargument",
      "option-change-condition",
      "purchase-deferral",
      "hierarchy-comparison",
      "hierarchy-explanation",
      "material-impact",
      "material-milestone",
      "material-completion",
      "material-source",
      "material-carryover",
      "milestone-inputs",
      "budget-status",
      "budget-scope",
      "decision-requirements",
      "evidence",
      "material-tension",
      "material-decisions",
      "project-facts",
      "completed-milestones",
      "persistent-decisions",
      "budget-memory",
      "material-history",
      "decision-status",
      "milestone-completion-evidence",
      "missing-information",
      "priority-fact",
      "subject-unlock",
      "challenge-recommendation",
      "ordered-actions",
      "senior-assessment",
      "completed-project-strength",
      "completed-project-risk",
      "completed-project-observations",
      "conditional-option-reconsideration",
      "completed-decision-retrospective",
      "decision-impact",
      "assumptions",
      "premature-decision",
      "next-action-detail",
      "milestone-rationale",
      "next-milestone",
      "recommendation-fit",
      "milestone-fit",
      "project-change",
      "project-update",
      "project-lead",
      "next-action",
   ];

   if (coachingMode === "review") {
      return [draft.currentUnderstanding.trim(), draft.assessment.trim(), draft.recommendation ? `What I would do next: ${ensureSentence(draft.recommendation)}` : ""].filter(Boolean).join("\n\n");
   }

   if (coachingMode === "brainstorm") {
      return [draft.assessment.trim(), draft.recommendation ? ensureSentence(draft.recommendation) : "", draft.reason ? ensureSentence(draft.reason) : ""].filter(Boolean).join("\n\n");
   }

   if (coachingMode === "tradeoff" || coachingMode === "decision-confirmation" || coachingMode === "challenge") {
      return [ensureSentence(draft.currentUnderstanding), ensureSentence(draft.assessment), draft.recommendation ? ensureSentence(draft.recommendation) : "", draft.reason ? ensureSentence(draft.reason) : ""].filter(Boolean).join("\n\n");
   }

   if (intent && directLookupIntents.includes(intent)) {
      const clean = (...parts: string[]) =>
         parts
            .map((part) => part.trim())
            .filter(Boolean)
            .join("\n\n");

      switch (intent) {
         case "project-facts":
         case "completed-milestones":
         case "persistent-decisions":
         case "budget-memory":
         case "material-history":
         case "priority-fact":
         case "decision-status":
         case "assumptions":
         case "missing-information":
         case "milestone-completion-evidence":
         case "ordered-actions":
            return clean(draft.currentUnderstanding, draft.assessment);

         case "milestone-inputs":
         case "decision-requirements":
            return clean(draft.currentUnderstanding, draft.assessment, draft.recommendation);

         case "budget-status":
         case "budget-scope":
            return clean(draft.currentUnderstanding, draft.assessment);

         case "priority-rationale":
         case "rationale":
         case "milestone-rationale":
            return clean(draft.assessment, draft.reason);

         case "decision-impact":
         case "subject-unlock":
         case "next-milestone":
         case "next-action":
         case "next-action-detail":
         case "premature-decision":
            return clean(draft.currentUnderstanding, draft.assessment);

         case "current-milestone":
         case "milestone-fit":
         case "recommendation-fit":
            return clean(draft.currentUnderstanding, draft.assessment, draft.reason);

         case "challenge-recommendation":
         case "option-counterargument":
         case "option-change-condition":
         case "purchase-deferral":
            return clean(draft.currentUnderstanding, draft.assessment, draft.recommendation);

         case "option-comparison":
         case "option-recommendation":
         case "option-vs-existing":
            return clean(draft.currentUnderstanding, draft.assessment, draft.recommendation, draft.reason);

         case "completed-project-strength":
         case "completed-project-risk":
         case "conditional-option-reconsideration":
         case "completed-decision-retrospective":
            return clean(draft.currentUnderstanding, draft.assessment, draft.recommendation);

         case "completed-project-observations":
            return clean(draft.currentUnderstanding, draft.assessment, draft.recommendation);

         case "senior-assessment":
         case "project-lead":
            return clean(draft.currentUnderstanding, draft.assessment, draft.recommendation, draft.reason, draft.watchOut);

         default:
            return clean(draft.currentUnderstanding, draft.assessment, draft.recommendation, draft.reason);
      }
   }

   if (/^\d+\.\s/m.test(draft.assessment) && draft.assessment.includes("\n")) {
      const leadIn = draft.currentUnderstanding.trim();
      return [leadIn, draft.assessment.trim(), ensureSentence(draft.recommendation), ensureSentence(draft.reason)].filter(Boolean).join("\n\n");
   }

   const opening = ensureSentence(draft.currentUnderstanding);
   const action = ensureSentence(draft.recommendation);
   const assessment = ensureSentence(draft.assessment);
   const reason = ensureSentence(draft.reason);
   const watch = formatWatchOut(draft.watchOut);
   const openingOverlapsAction = Boolean(opening && action && getTextOverlapScore(opening, action) >= 4);
   const main = uniqueStrings([action, assessment, reason]).join(" ");

   return [openingOverlapsAction ? "" : opening, main, watch].filter(Boolean).join("\n\n");
}

// ========================================
// MK VIII — Canonical Project Understanding
// Purpose:
// Let Guidance reason from the shared project model instead of rebuilding
// meaning from legacy evidence counts and readiness fields.
// ========================================

function hasCanonicalProjectUnderstanding(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;

   return Boolean(
      understanding && understanding.version === "MK VIII" && (compactText(understanding.goal) || compactText(understanding.situation) || compactText(understanding.recommendedMove) || understanding.openWork.length || understanding.milestones.length),
   );
}

function getCanonicalOpenWork(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const unfinishedMilestones = understanding.milestones.filter((milestone) => milestone.status !== "complete").map((milestone) => milestone.title);

   return uniqueStrings([...unfinishedMilestones, ...understanding.openWork], 8);
}

function cleanProjectRiskText(value?: string) {
   return compactText(value, 1200)
      .replace(/^[-*•]\s*/, "")
      .replace(/^one thing to keep an eye on is\s+/i, "")
      .replace(/^the main thing to watch is\s+/i, "")
      .replace(/^watch out for\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
}

function getCanonicalPrimaryRisk(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const risk = understanding.risks.find((item) => item.severity === "high") || understanding.risks.find((item) => item.severity === "medium") || understanding.risks[0];

   if (!risk) {
      return "";
   }

   const title = cleanProjectRiskText(risk.title);
   const consequence = cleanProjectRiskText(risk.consequence);
   const includeConsequence = Boolean(consequence && consequence.toLowerCase() !== title.toLowerCase() && getTextOverlapScore(title, consequence) < 4);

   return compactText([title, includeConsequence ? consequence : ""].filter(Boolean).join(". "), 1200);
}

function getCanonicalMaterialCorpus(packet: ProjectIntelligencePacket) {
   return compactText(
      [
         ...packet.materials.flatMap((material) => [material.title, material.summary, material.details, material.source]),
         packet.projectTitle,
         packet.projectGoal,
         packet.currentState,
         packet.projectUnderstanding.goal,
         packet.projectUnderstanding.successState,
         packet.projectUnderstanding.situation,
         packet.projectUnderstanding.recommendedMove,
         packet.projectUnderstanding.whyNow,
         packet.projectUnderstanding.afterThis,
         ...packet.projectUnderstanding.openWork,
         ...packet.projectUnderstanding.completedWork,
         ...packet.projectUnderstanding.decisions,
         ...packet.projectUnderstanding.conversation.unresolvedQuestions,
         ...packet.profileSignals.availableEvidence,
         ...packet.profileSignals.decisions,
         ...packet.profileSignals.options,
         ...packet.profileSignals.assumptions,
         ...packet.profileSignals.constraints,
      ].join(" "),
      64000,
   );
}

function getCanonicalMaterialNames(packet: ProjectIntelligencePacket) {
   return uniqueStrings(
      packet.materials.map((material) => material.title),
      5,
   );
}

function getCanonicalMaterialTensions(packet: ProjectIntelligencePacket) {
   return packet.projectUnderstanding.tensions.map((tension) => [tension.sideA, tension.sideB, tension.consequence, tension.decisionNeeded].filter(Boolean).join(" "));
}

function getCanonicalMaterialDecisions(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;

   return {
      decided: understanding.confirmedDecisions.map((decision) => decision.statement),
      unresolved: understanding.unresolvedDecisions.map((decision) => decision.statement),
   };
}

function getCanonicalMaterialImpact(packet: ProjectIntelligencePacket, currentFocus: string) {
   const understanding = packet.projectUnderstanding;
   const selectedTitles = packet.materials.map((material) => material.title);
   const affectedDecisions = uniqueStrings(
      understanding.materials.flatMap((material) => material.decisionsAffected),
      12,
   );
   const relatedMilestones = uniqueStrings(
      understanding.materials.flatMap((material) => material.relatedMilestones),
      12,
   );
   const tensions = understanding.tensions.slice(0, 3);

   const additions = [
      selectedTitles.length ? `The selected material adds evidence from ${selectedTitles.join(", ")}.` : "",
      affectedDecisions.length ? `It affects these recorded decisions: ${affectedDecisions.join("; ")}.` : "",
      relatedMilestones.length ? `It is connected to ${relatedMilestones.length} milestone${relatedMilestones.length === 1 ? "" : "s"}.` : "",
      tensions.length ? `It introduces or clarifies ${tensions.length} project tension${tensions.length === 1 ? "" : "s"}.` : "",
   ].filter(Boolean);

   if (!additions.length) {
      additions.push("The material adds reference context, but it does not yet change a recorded decision, milestone, or tension.");
   }

   const focusLine = currentFocus ? `For the current checkpoint—${currentFocus.replace(/[.!?]+$/, "")}—use only the evidence that changes a decision, risk, dependency, or completion check.` : "";

   return [...additions, focusLine].filter(Boolean).join(" ");
}

function getCanonicalMaterialNextMove(packet: ProjectIntelligencePacket, currentFocus: string, afterThis: string) {
   const understanding = packet.projectUnderstanding;
   const unresolved = understanding.unresolvedDecisions[0];
   const tension = understanding.tensions[0];

   if (tension) {
      return {
         recommendation: tension.decisionNeeded,
         reason: `${tension.consequence} Resolving it now keeps the current milestone from moving forward on conflicting assumptions.`,
      };
   }

   if (unresolved) {
      return {
         recommendation: unresolved.statement,
         reason: afterThis ? `This unresolved decision should be settled before the project moves to ${afterThis.replace(/[.!?]+$/, "")}.` : "This is the clearest unresolved decision tied to the current project state.",
      };
   }

   return {
      recommendation: currentFocus ? `Use the material to complete the current checkpoint: ${currentFocus.replace(/[.!?]+$/, "")}.` : understanding.recommendedMove || "Use the material to clarify the current project decision.",
      reason: understanding.whyNow || "The material is useful only when it changes a current decision, risk, dependency, or completion check.",
   };
}

function getPromptReferencedMaterial(packet: ProjectIntelligencePacket, prompt: string) {
   const lower = normalizePrompt(prompt);
   const exact = packet.materials.find((material) => {
      const title = normalizePrompt(material.title);
      return title.length >= 4 && lower.includes(title);
   });

   if (exact) return exact;
   if (packet.materials.length === 1) return packet.materials[0];

   // Pronoun follow-ups should remain useful without silently combining every
   // material. The material signals are already sorted most-recent first.
   if (/\b(?:that|this|the)\s+(?:material|document|reference|source)\b/.test(lower)) {
      return packet.materials[0];
   }

   return undefined;
}

function getMilestoneGuidanceCategory(value?: string) {
   const clean = compactText(value, 1600).toLowerCase();

   if (
      /\b(?:first projects?|initial projects?|first uses?|use cases?|scenarios?|first useful scope|pilot scope|initial scope|must support|first collection|priority collection|first batch|first set|first resource set|inventory the first|choose and inventory)\b/i.test(
         clean,
      )
   )
      return "first-scope";
   if (/\b(?:story arc|narrative|emotional progression|character change|plot|ending)\b/i.test(clean)) return "story";
   if (
      /\b(?:move timeline|lease deadlines?|new apartment|plan the move|relocation budget|neighborhoods?|apartments?|movers?|book the move|move in|old apartment|finish the move|deadlines? and hard limits|finished result needs to include|order of work|backup options|prepare the logistics|carry out the plan|finish the loose ends|travel dates?|trip needs to include|itinerary|book the trip|external constraints?|commitments?|decision deadlines?|sequence, responsibilities|contingency plan|transition|remaining obligations)\b/i.test(
         clean,
      )
   )
      return "coordination";
   if (/\b(?:page-by-page|story map|page plan|spreads?|manuscript|read-aloud|visual-comprehension|illustrations?|page layouts?|print-ready|printed proof|first proof|production service)\b/i.test(clean)) return "creative-production";
   if (/\b(?:choose|select|decide|finalize|confirm)\b/i.test(clean) && /\b(?:tool|equipment|material|format|platform|approach|option|vendor|source|parts?)\b/i.test(clean)) return "selection";
   if (
      /\b(?:power|electrical|lighting|ventilation|dust|noise|safety|risk|legal|permit|privacy|permission|compliance|infrastructure|quality|standards?|criteria|metadata|naming|identification|handling|preservation|eligibility|exception|insurance|liability)\b/i.test(
         clean,
      )
   )
      return "requirements";
   if (/\b(?:layout|storage|access|workbench|workspace|structure|hierarchy|editorial|information architecture|outline|organization|folder|backup|repository|recordkeeping|labeling)\b/i.test(clean)) return "layout";
   if (/\b(?:budget|cost|pricing|resources?|capacity|upgrade priorities|viability|margin)\b/i.test(clean)) return "budget";
   if (/\b(?:brand|language|promise|positioning|identity|message|tone)\b/i.test(clean)) return "brand";
   if (/\b(?:relate|relationship|parent|ecosystem|family|portfolio|role of each)\b/i.test(clean)) return "relationship";
   if (/\b(?:workflow|process|capacity|responsibilities|handoffs|operating model|service flow|production)\b/i.test(clean)) return "workflow";
   if (
      (/\b(?:build|organize|set up|setup|install|implement|assemble|configure|prepare|create|process|digitize|scan|catalog|preserve)\b/i.test(clean) &&
         /\b(?:first usable|usable setup|initial setup|first complete|working setup|working version|implementation|installation|workspace|result|collection|records?|items?|materials?|archive)\b/i.test(clean)) ||
      /\b(?:process and organize|digitize and organize|preserve the originals)\b/i.test(clean)
   )
      return "execution";
   if (/\b(?:research|sources?|evidence|facts?|archive|interview|requirements gathering|discovery)\b/i.test(clean)) return "research";

   return "general";
}

function milestoneGuidanceQuestionMatchesTitle(title: string, question: string) {
   const category = getMilestoneGuidanceCategory(title);
   const clean = compactText(question, 1800);

   if (category === "first-scope")
      return /\b(?:first|initial|priority)\s+(?:projects?|uses?|use cases?|scenarios?|scope|collection|resource set|set|batch|sample|case|group)\b|\bprojects?\b.*\b(?:support|include|cover)\b|\b(?:inventory|collection|resource set|catalog|acceptance|condition|use cases?|scenarios?|scope|must support|operations?|capabilities?|volume|labels?|reviewers?|contributors?)\b/i.test(
         clean,
      );
   if (category === "story") return /\b(?:story|plot|arc|character|ending|tension|fear|emotion|theme|turning point|resolution)\b/i.test(clean);
   if (category === "coordination")
      return /\b(?:constraint|commitment|deadline|notice|approval|contract|dependency|sequence|responsibility|contingency|transition|closeout|obligation|lease|move date|overlap|neighborhood|apartment|commute|rent|parking|noise|security|laundry|internet|mover|packing|utility|address|cleaning|budget|booking|provider)\b/i.test(
         clean,
      );
   if (category === "creative-production") return /\b(?:page|spread|manuscript|illustration|artwork|visual|layout|typography|read aloud|review|printer|printing|proof|production|file requirements?)\b/i.test(clean);
   if (category === "requirements") return /\b(?:power|electrical|outlet|circuit|lighting|light|ventilation|airflow|dust|noise|safety|risk|flammable|finish|fire|legal|permit|privacy|permission|compliance)\b/i.test(clean);
   if (category === "layout") return /\b(?:layout|storage|access|workbench|workspace|mobile|movable|portable|permanent|wall|mount|structure|hierarchy|editorial|outline)\b/i.test(clean);
   if (category === "budget") return /\b(?:budget|cost|price|spend|resource|capacity|priority|afford)\b/i.test(clean);
   if (category === "selection") return /\b(?:tool|equipment|material|format|platform|approach|option|vendor|source|part)\b/i.test(clean);
   if (category === "brand") return /\b(?:brand|language|promise|positioning|identity|message|tone)\b/i.test(clean);
   if (category === "relationship") return /\b(?:relate|relationship|parent|ecosystem|family|portfolio|role)\b/i.test(clean);
   if (category === "workflow") return /\b(?:workflow|process|capacity|responsibilities|handoff|operating|production)\b/i.test(clean);
   if (category === "execution") return /\b(?:build|organize|set up|setup|install|implement|assemble|configure|purchase|buy|acquire|place|test|usable|working result)\b/i.test(clean);
   if (category === "research") return /\b(?:research|source|evidence|fact|archive|interview|discovery)\b/i.test(clean);

   return true;
}

function getGeneratedMilestoneCriterionCategory(criterion: string) {
   const clean = cleanAuthoritativeStatement(criterion, 1800);

   if (/\b(?:initial projects?|uses?|scenarios?).*\bnamed\b|\boperations? or capabilities?.*\blisted\b|\bcapabilities intentionally excluded\b|\bmobility, reset, access, audience, or operating requirements\b/i.test(clean)) return "first-scope";
   if (
      /\belectrical or power capacity\b|\bcurrent lighting\b|\bventilation or airflow approach\b|\bdust-control approach\b|\bnoise-control\b|\bsafety risks, required controls\b|\brequired changes are separated from optional upgrades\b|\bremaining unknown has a clear owner\b/i.test(
         clean,
      )
   )
      return "requirements";
   if (/\bwork, storage, and access zones\b|\barrangement supports\b|\bshared-space, mobility, and reset requirements\b|\blayout identifies\b|\bmajor sections or elements\b|\bhierarchy communicates\b|\bevery required piece of content\b/i.test(clean))
      return "layout";
   if (/\bmaximum budget or capacity boundary\b|\brequired spending or resource categories\b|\bpriority upgrades\b|\bdefer list\b/i.test(clean)) return "budget";
   if (/\bstrongest realistic options\b|\bworking option has been selected\b|\breason for the selection\b|\bpurchase, approval, dependency, or installation condition\b/i.test(clean)) return "selection";
   if (/\bviable statements have been drafted\b|\bstatement has been tested\b|\bworking statement has been selected\b|\blanguage it rules out\b/i.test(clean)) return "brand";
   if (/\beach major part has a distinct role\b|\bshared parent-level promise\b|\boverlap, gaps, and hierarchy\b|\brelationship can guide\b/i.test(clean)) return "relationship";
   if (/\bworkflow is mapped\b|\bownership and handoffs\b|\bcapacity and reset or maintenance requirements\b/i.test(clean)) return "workflow";
   if (
      /\brequired purchases or resources are available\b|\bplanned setup or implementation is complete\b|\bsafety or infrastructure controls are installed\b|\bfirst usable result has been tested\b|\breset, operation, or handoff instructions are recorded\b|\bknown issues and deferred work are recorded\b/i.test(
         clean,
      )
   )
      return "execution";
   if (/\bevidence or source standard\b|\brequired facts, sources, interviews, or observations\b|\bconflicts, gaps, and uncertainty\b/i.test(clean)) return "research";
   return "";
}

function getDefaultGuidanceCriteriaForMilestone(milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return [] as string[];
   const category = getMilestoneGuidanceCategory(milestone.title);
   const title = compactText(milestone.title, 1600);

   if (category === "coordination") {
      return [
         "Fixed deadlines, notice periods, approvals, contracts, and existing commitments are recorded",
         "The earliest irreversible decision and the conditions that must be true before it are clear",
         "Dependencies, owners, and verification sources are assigned",
         "A realistic contingency exists for the most important timing or availability risk",
      ];
   }

   if (category === "story") {
      return [
         "The opening state, escalating attempts, turning point, resolution, and changed ending are clear",
         "The emotional progression fits the intended audience and does not rely on explanation outside the story",
         "Each major beat changes the character, situation, or reader understanding",
         "The ending resolves the central tension and demonstrates the intended change",
      ];
   }
   if (category === "creative-production") {
      if (/\b(?:page-by-page|story map|page plan|spreads?)\b/i.test(title)) {
         return [
            "Every page or spread has a clear story purpose",
            "Page turns support pacing, surprise, emphasis, or emotional change",
            "Text and visual responsibility are separated so the pictures add meaning rather than repeat the words",
            "The full sequence fits the confirmed format and length limits",
         ];
      }
      if (/\b(?:manuscript|complete story|complete piece)\b/i.test(title)) {
         return [
            "A complete beginning-to-end draft exists",
            "The draft fits the confirmed audience, length, tone, and format constraints",
            "Language reads naturally aloud and avoids unnecessary explanation",
            "The draft is stable enough to support visual production or final formatting",
         ];
      }
      if (/\b(?:print-ready|production service|proof)\b/i.test(title)) {
         return [
            "The production provider and technical requirements are confirmed",
            "Final files meet the required size, color, bleed, typography, and export specifications",
            "One proof has been ordered and reviewed for content, layout, color, readability, and physical quality",
            "Corrections are recorded without rebuilding the project structure",
         ];
      }
      if (/\b(?:read-aloud|visual-comprehension|review)\b/i.test(title)) {
         return [
            "A focused review has been run with the intended audience or a realistic proxy",
            "Confusing language, pacing, visual gaps, and emotional-intensity issues are recorded",
            "Feedback has been resolved against the project goal rather than accepted indiscriminately",
            "The revision decisions and remaining risks are documented",
         ];
      }
      return [
         "The creative approach and production method are documented",
         "Style, layout, typography, and asset rules are consistent",
         "Every required page, scene, or asset has a finished or reviewable state",
         "The work can move into review or production without unresolved structural decisions",
      ];
   }

   if (category === "first-scope") {
      if (/\b(?:collection|resource set|tool set|set|batch|sample|case|group|inventory|catalog)\b/i.test(title)) {
         return [
            "One bounded starting collection, set, batch, sample, case, or group is selected",
            "Its containers, folders, files, records, items, or subgroups are inventoried",
            "Approximate volume, condition, access, and handling constraints are recorded",
            "Known labels, missing details, and available reviewers or contributors are noted",
            "The first phase explicitly excludes the rest of the larger project scope",
         ];
      }
      return [
         "The initial projects, uses, or scenarios are named",
         "The operations or capabilities each one requires are listed",
         "Capabilities intentionally excluded from the first version are recorded",
         "Any mobility, reset, access, audience, or operating requirements created by those uses are clear",
      ];
   }
   if (category === "requirements") {
      if (/\b(?:naming|metadata|identification|privacy|access)\b/i.test(title)) {
         return [
            "A naming convention is documented",
            "Required metadata fields and unknown-value handling are documented",
            "Privacy and access rules are clear",
            "The identification and review process is defined",
            "The rules can be applied consistently to the selected first scope",
         ];
      }
      if (/\b(?:quality|standards?|criteria|handling|preservation)\b/i.test(title)) {
         return [
            "The minimum usable quality standard is documented",
            "Allowed corrections and prohibited alterations are clear",
            "Specialist-handling or escalation criteria are recorded",
            "Originals and working copies are distinguished where relevant",
            "A repeatable quality check is defined",
         ];
      }
      return uniqueProjectFacts(
         [
            /\b(?:power|electrical|outlet)\b/i.test(title) ? "The available electrical or power capacity has been checked against the planned work" : "",
            /\b(?:lighting|light)\b/i.test(title) ? "The current lighting has been assessed and any required improvement is identified" : "",
            /\b(?:ventilation|airflow)\b/i.test(title) ? "The ventilation or airflow approach is documented" : "",
            /\bdust\b/i.test(title) ? "The dust-control approach is documented for the planned work" : "",
            /\bnoise\b/i.test(title) ? "The noise-control limits or approach are documented" : "",
            /\b(?:safety|risk|flammable|fire)\b/i.test(title) ? "The safety risks, required controls, and safe storage rules are recorded" : "",
            "Required changes are separated from optional upgrades",
            "Any remaining unknown has a clear owner, source, or verification step",
         ],
         8,
      );
   }
   if (category === "layout") {
      if (/\b(?:organization|folder|backup|repository|archive|storage structure)\b/i.test(title)) {
         return [
            "The organization or folder structure is documented",
            "Originals, working files, and finished outputs have clear locations",
            "Local, cloud, or hybrid storage roles are decided",
            "At least two independent backup locations are defined",
            "The structure supports browsing and future outputs without reorganization",
         ];
      }
      return [
         "Work, storage, and access zones are shown",
         "The arrangement supports the planned operations or uses",
         "Shared-space, mobility, and reset requirements are preserved",
         "The layout identifies where required safety or infrastructure controls belong",
      ];
   }
   if (category === "budget")
      return [
         "The maximum budget or capacity boundary is recorded",
         "Required spending or resource categories are estimated",
         "Priority upgrades are separated from optional upgrades",
         "A defer list protects the project from premature purchases or commitments",
      ];
   if (category === "selection")
      return [
         "The strongest realistic options have been compared against the confirmed requirements",
         "A working option has been selected",
         "The reason for the selection and the rejected alternatives are recorded",
         "Any purchase, approval, dependency, or installation condition is clear",
      ];
   if (category === "execution")
      return [
         "The required purchases or resources are available",
         "The planned setup or implementation is complete",
         "Required safety or infrastructure controls are installed and usable",
         "The first usable result has been tested in its intended environment",
         "Reset, operation, or handoff instructions are recorded",
         "Known issues and deferred work are recorded",
      ];
   return [] as string[];
}

function getScopedMilestoneCompletionCriteria(milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return [] as string[];
   const milestoneCategory = getMilestoneGuidanceCategory(milestone.title);
   const existing = (milestone.completionCriteria || [])
      .map((item) => cleanAuthoritativeStatement(item))
      .filter(Boolean)
      .filter((criterion) => {
         const supportedAnswerMatch = criterion.match(/^A supported answer is recorded for:\s*(.+)$/i);
         if (supportedAnswerMatch) return milestoneGuidanceQuestionMatchesTitle(milestone.title, supportedAnswerMatch[1]);
         const criterionCategory = getGeneratedMilestoneCriterionCategory(criterion);
         return !criterionCategory || criterionCategory === milestoneCategory;
      });
   const defaults = getDefaultGuidanceCriteriaForMilestone(milestone);
   return uniqueProjectFacts([...existing, ...defaults], 10);
}

function getScopedMilestoneOpenQuestions(milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return [] as string[];

   return uniqueProjectFacts(
      (milestone.openQuestions || [])
         .map((item) => cleanAuthoritativeStatement(item))
         .filter(Boolean)
         .filter((question) => milestoneGuidanceQuestionMatchesTitle(milestone.title, question)),
      10,
   );
}

function getMaterialMilestoneConceptCoverage(materialText: string, milestoneText: string) {
   const material = compactText(materialText, 12000).toLowerCase();
   const milestone = compactText(milestoneText, 6000).toLowerCase();
   const conceptPairs: Array<[RegExp, RegExp]> = [
      [/\b(?:power|electrical|outlet|circuit)\b/i, /\b(?:power|electrical|outlet|circuit|amp|voltage|breaker)\b/i],
      [/\b(?:lighting|light)\b/i, /\b(?:lighting|light|dark|illumination)\b/i],
      [/\b(?:ventilation|airflow)\b/i, /\b(?:ventilation|airflow|cross-ventilation|exhaust|fan|garage door)\b/i],
      [/\b(?:dust)\b/i, /\b(?:dust|shop vacuum|vacuum|collector|source collection)\b/i],
      [/\b(?:noise)\b/i, /\b(?:noise|hearing|sound)\b/i],
      [/\b(?:safety|risk|flammable|finish|fire)\b/i, /\b(?:safety|risk|flammable|finish|fire|spark|heat|approved cabinet)\b/i],
      [/\b(?:layout|storage|access|workbench|workspace)\b/i, /\b(?:layout|storage|access|workbench|workspace|zone|path)\b/i],
      [/\b(?:mobile|movable|portable|reset)\b/i, /\b(?:mobile|movable|portable|reset|rolling|folding)\b/i],
      [/\b(?:budget|cost|price|spend)\b/i, /\b(?:budget|cost|price|spend|dollar|\$)\b/i],
      [/\b(?:tool|equipment|material|parts?)\b/i, /\b(?:tool|equipment|material|parts?|saw|vacuum|collector|machine)\b/i],
      [/\b(?:projects?|uses?|scenarios?|scope)\b/i, /\b(?:projects?|uses?|scenarios?|scope|repair|build|assemble)\b/i],
      [/\b(?:operations?|capabilities?)\b/i, /\b(?:operations?|capabilities?|cut|crosscut|drill|sand|assemble|finish)\b/i],
   ];

   return conceptPairs.reduce((score, [milestonePattern, materialPattern]) => {
      return score + (milestonePattern.test(milestone) && materialPattern.test(material) ? 1 : 0);
   }, 0);
}

function getMaterialEvidenceStatements(material?: ProjectMaterialSignal, limit = 5) {
   if (!material) return [] as string[];

   return uniqueProjectFacts(
      compactText(material.details || material.summary, 9000)
         .split(/(?<=[.!?])\s+/)
         .map((statement) => cleanAuthoritativeStatement(statement, 1200))
         .filter((statement) => statement.length >= 18 && normalizePrompt(statement) !== normalizePrompt(material.title)),
      limit,
   );
}

function getMaterialMilestoneScore(material: ProjectMaterialSignal, milestone: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   const materialText = `${material.title} ${material.summary} ${material.details}`;
   const scopedCriteria = getScopedMilestoneCompletionCriteria(milestone);
   const scopedQuestions = getScopedMilestoneOpenQuestions(milestone);
   const milestoneText = `${milestone.title} ${scopedQuestions.join(" ")} ${scopedCriteria.join(" ")}`;
   const overlap = getProjectFactOverlapRatio(materialText, milestoneText);
   const materialTokens = getDecisionReadbackTokens(materialText);
   const milestoneTokens = getDecisionReadbackTokens(milestoneText);
   const conceptCoverage = getMaterialMilestoneConceptCoverage(materialText, milestoneText);
   const criterionCoverage = scopedCriteria.filter((criterion) => criterionIsSupportedByMaterial(criterion, materialText)).length;
   const explicit = material.relevantBuildIds.includes(milestone.id) ? Math.min(1.5, 0.5 + conceptCoverage * 0.2 + criterionCoverage * 0.25) : 0;
   let shared = 0;
   materialTokens.forEach((token) => {
      if (milestoneTokens.has(token)) shared += 1;
   });

   return explicit + overlap * 2 + Math.min(shared * 0.08, 0.8) + conceptCoverage * 1.1 + criterionCoverage * 1.2;
}

function getMostAffectedMilestoneForMaterial(packet: ProjectIntelligencePacket, material?: ProjectMaterialSignal) {
   if (!material) return undefined;

   return getAuthoritativeMilestones(packet)
      .map((milestone) => ({ milestone, score: getMaterialMilestoneScore(material, milestone) }))
      .sort((left, right) => right.score - left.score || left.milestone.order - right.milestone.order)[0];
}

function criterionIsSupportedByMaterial(criterion: string, materialText: string) {
   const cleanCriterion = cleanAuthoritativeStatement(criterion);
   const cleanMaterial = cleanAuthoritativeStatement(materialText, 12000);
   const lowerCriterion = cleanCriterion.toLowerCase();
   const lowerMaterial = cleanMaterial.toLowerCase();

   const supportedAnswerMatch = cleanCriterion.match(/^A supported answer is recorded for:\s*(.+)$/i);
   if (supportedAnswerMatch) {
      const question = supportedAnswerMatch[1].toLowerCase();
      const conceptPairs: Array<[RegExp, RegExp]> = [
         [/\b(?:power|electrical|outlet|circuit)\b/i, /\b(?:power|electrical|outlet|circuit|amp|breaker)\b/i],
         [/\b(?:lighting|light)\b/i, /\b(?:lighting|light|dark|illumination)\b/i],
         [/\b(?:ventilation|airflow)\b/i, /\b(?:ventilation|airflow|cross-ventilation|exhaust|fan|garage door)\b/i],
         [/\bdust\b/i, /\b(?:dust|shop vacuum|vacuum|collector|source collection)\b/i],
         [/\bnoise\b/i, /\b(?:noise|hearing|sound)\b/i],
         [/\b(?:flammable|finish|storage|fire|safety)\b/i, /\b(?:flammable|finish|storage|cabinet|fire|spark|heat|safety)\b/i],
         [/\b(?:tool|equipment)\b/i, /\b(?:tool|equipment|saw|machine|vacuum|collector)\b/i],
         [/\b(?:workbench|mobile|portable|movable|layout)\b/i, /\b(?:workbench|mobile|portable|movable|rolling|folding|layout)\b/i],
      ];
      const requiredConcepts = conceptPairs.filter(([questionPattern]) => questionPattern.test(question));
      const allRequiredConceptsPresent = requiredConcepts.every(([, materialPattern]) => materialPattern.test(lowerMaterial));

      if (requiredConcepts.length && !allRequiredConceptsPresent) return false;
      if (
         /\b(?:sufficient|safe enough|approved|confirmed|verified)\b/i.test(question) &&
         /\b(?:should|must|needs? to|requires?)\s+(?:be\s+)?(?:check|confirm|verify|assess|checked|confirmed|verified|assessed)|\b(?:not|isn['’]t|is not)\s+(?:yet\s+)?(?:confirmed|verified|known|sufficient)\b/i.test(lowerMaterial)
      ) {
         return false;
      }
      if (requiredConcepts.length) return true;
   }

   if (
      /\b(?:checked|confirmed|verified|sufficient|approved)\b/i.test(cleanCriterion) &&
      /\b(?:should|must|needs? to|requires?)\s+(?:be\s+)?(?:check|confirm|verify|assess|checked|confirmed|verified|assessed)|\b(?:not|isn['’]t|is not)\s+(?:yet\s+)?(?:confirmed|verified|known|sufficient)\b/i.test(cleanMaterial)
   ) {
      return false;
   }

   if (/\b(?:electrical|power) capacity\b.*\bchecked\b/i.test(lowerCriterion)) {
      return /\b(?:outlet|circuit|amp|breaker|voltage|electrical|power)\b/i.test(lowerMaterial) && !/\b(?:should|must|needs? to)\s+(?:be\s+)?(?:confirm|check|verify|confirmed|checked|verified)\b/i.test(lowerMaterial);
   }
   if (/\bcurrent lighting\b.*\b(?:assessed|improvement)\b/i.test(lowerCriterion)) {
      return /\b(?:lighting|light)\b/i.test(lowerMaterial) && /\b(?:dark|dim|insufficient|adequate|bright|improvement|upgrade|replace|add)\b/i.test(lowerMaterial);
   }
   if (/\bventilation or airflow approach\b.*\bdocumented\b/i.test(lowerCriterion)) {
      return /\b(?:ventilation|airflow|cross-ventilation|exhaust|fan|garage door)\b/i.test(lowerMaterial);
   }
   if (/\bdust-control approach\b.*\bdocumented\b/i.test(lowerCriterion)) {
      return /\b(?:dust|shop vacuum|vacuum|collector|source collection)\b/i.test(lowerMaterial);
   }
   if (/\bsafety risks, required controls, and safe storage rules\b/i.test(lowerCriterion)) {
      return /\b(?:safety|risk|flammable|finish|approved cabinet|spark|heat|fire)\b/i.test(lowerMaterial);
   }
   if (/\bremaining unknown\b.*\b(?:owner|source|verification step)\b/i.test(lowerCriterion)) {
      return /\b(?:electrician|contractor|reviewer|owner|vendor|specialist|expert|inspector)\b.*\b(?:should|must|needs? to|will)\b.*\b(?:confirm|verify|check|assess|review)\b/i.test(lowerMaterial);
   }
   if (/\barrangement supports the planned operations or uses\b/i.test(lowerCriterion)) {
      const hasPlannedOperations = /\b(?:cutting|straight cuts?|crosscuts?|drilling|sanding|assembly|finishing|sheet goods|repair|build)\b/i.test(lowerMaterial);
      const hasUsablePlacement = /\b(?:work zone|work surface|center|clearance|left wall|right wall|near|along|access path|portable cutting guide)\b/i.test(lowerMaterial);
      return hasPlannedOperations && hasUsablePlacement;
   }
   if (/\blayout identifies where required safety or infrastructure controls belong\b/i.test(lowerCriterion)) {
      const controlGroups = [
         /\b(?:task lighting|led lighting|light(?:ing)?)\b/i,
         /\b(?:shop vacuum|source collection|dust)\b/i,
         /\b(?:airflow|garage door|ventilation|finishing area)\b/i,
         /\b(?:finish|chemical|closed cabinet|spark|heat)\b/i,
         /\b(?:outlet|circuit|power)\b/i,
      ];
      const placementLanguage = /\b(?:above|near|along|away from|close enough|without running|open garage door|main work surface|work zone|main walkway|stored in|mounted)\b/i.test(lowerMaterial);
      return placementLanguage && controlGroups.filter((pattern) => pattern.test(lowerMaterial)).length >= 3;
   }

   if (/\bmaximum budget or capacity boundary\b/i.test(lowerCriterion)) {
      return /\b(?:budget|cap|limit|maximum|at or below|under|no more than)\b[^$]{0,80}\$\s*[\d,]+(?:\.\d{1,2})?\b/i.test(cleanMaterial) || /\$\s*[\d,]+(?:\.\d{1,2})?\b[^.]{0,80}\b(?:budget|limit|cap)\b/i.test(cleanMaterial);
   }
   if (/\brequired spending or resource categories are estimated\b/i.test(lowerCriterion)) {
      const lineItems = cleanMaterial.match(/(?:^|\n|[-*•]\s*)[^:\n]{2,120}:\s*\$\s*[\d,]+(?:\.\d{1,2})?/gim) || [];
      return lineItems.length >= 2 || (/\b(?:required|workspace|safety|categories?)\b/i.test(cleanMaterial) && /\b(?:total|assigned|allocated|committed)\b[^$]{0,80}\$\s*[\d,]+(?:\.\d{1,2})?\b/i.test(cleanMaterial));
   }
   if (/\bpriority upgrades are separated from optional upgrades\b/i.test(lowerCriterion)) {
      return /\b(?:required|immediate|phase[- ]one)\b/i.test(cleanMaterial) && /\b(?:optional|deferred|future upgrades?|not included)\b/i.test(cleanMaterial);
   }
   if (/\bdefer list protects the project from premature purchases or commitments\b/i.test(lowerCriterion)) {
      return /\b(?:deferred|not included|optional future upgrades?|reconsidered later|future upgrade)\b/i.test(cleanMaterial) && /(?:,|;|\band\b)/i.test(cleanMaterial);
   }

   if (/\bany purchase, approval, dependency, or installation condition is clear\b/i.test(lowerCriterion)) {
      const purchasePathIsClear = /\b(?:decided not to purchase|will not purchase|purchase (?:is|remains) deferred|major[- ]tool purchase (?:is|remains) deferred|no major (?:power )?tool will be purchased|reserve will remain untouched)\b/i.test(
         cleanMaterial,
      );
      const futureTriggerIsClear = /\b(?:if|only if|until|before|after|while)\b[^.]{0,220}\b(?:accuracy|sheet[- ]goods|crosscuts?|dust collection|setup effort|stationary machinery|first real projects?|dominant limitation|repeatable problems?)\b/i.test(
         cleanMaterial,
      );
      const alternativesAreBounded = /\btable saw\b[^.]{0,220}\b(?:will not purchase|excluded|not included|phase one)\b/i.test(cleanMaterial) || /\bmiter saw\b[^.]{0,220}\b(?:reconsider|only if|conditional|dominant limitation)\b/i.test(cleanMaterial);
      const safetyConditionsAreDefined = /\b(?:eye protection|hearing protection|respiratory protection)\b/i.test(cleanMaterial) && /\b(?:push|clamping|safe tool-specific setup|safe setup practices?)\b/i.test(cleanMaterial);

      return purchasePathIsClear && (futureTriggerIsClear || alternativesAreBounded || safetyConditionsAreDefined);
   }

   if (/\brequired purchases or resources are available\b/i.test(lowerCriterion)) {
      const explicitlyAvailable = /\b(?:purchased|bought|acquired|received|secured|already own|on hand|available)\b/i.test(cleanMaterial);
      const itemizedResources = (cleanMaterial.match(/(?:^|\n|[-*•]\s*)[^:\n]{2,120}:\s*\$\s*[\d,]+(?:\.\d{1,2})?/gim) || []).length;
      const requiredTotal = /\brequired (?:purchases|items|resources|categories?)\b[^.]{0,120}\b(?:total(?:ed)?|cost|amount)\b[^$]{0,40}\$\s*[\d,]+(?:\.\d{1,2})?/i.test(cleanMaterial);
      return explicitlyAvailable && (itemizedResources >= 2 || requiredTotal || /\bpurchased and installed\b/i.test(cleanMaterial));
   }

   if (/\bplanned setup or implementation is complete\b/i.test(lowerCriterion)) {
      const explicitCompletion =
         /\b(?:completed|finished)\b[^.]{0,160}\b(?:phase[- ]one |initial |first usable )?(?:setup|implementation|installation|workspace)\b/i.test(cleanMaterial) ||
         /\b(?:setup|implementation|installation)\b[^.]{0,120}\b(?:is|was) complete\b/i.test(cleanMaterial);
      const placementEvidence = [
         /\b(?:workbench|work surface|assembly surface)\b[^.]{0,180}\b(?:positioned|placed|installed|along|near)\b/i,
         /\b(?:cart|storage)\b[^.]{0,180}\b(?:parks?|placed|installed|mounted|beneath|along)\b/i,
         /\b(?:cutting zone|access path|walkway)\b[^.]{0,180}\b(?:clear|remains? clear|implemented|tested)\b/i,
      ].filter((pattern) => pattern.test(cleanMaterial)).length;
      const controlsImplemented = /\b(?:task lighting|shop vacuum|finish cabinet|chemical storage|ppe)\b/i.test(cleanMaterial) && /\b(?:works?|installed|connects?|stored|tested)\b/i.test(cleanMaterial);
      return explicitCompletion || (placementEvidence >= 2 && controlsImplemented);
   }

   if (/\brequired safety or infrastructure controls are installed and usable\b/i.test(lowerCriterion)) {
      const controlGroups = [
         /\b(?:task lighting|led lighting|lighting)\b[^.]{0,180}\b(?:installed|mounted|works?|tested)\b/i,
         /\b(?:shop vacuum|source collection|dust)\b[^.]{0,180}\b(?:connects?|connected|works?|tested|usable)\b/i,
         /\b(?:finish|chemical)\b[^.]{0,180}\b(?:cabinet|storage)\b[^.]{0,180}\b(?:installed|stored|away from)\b/i,
         /\b(?:ppe|eye protection|hearing protection|respiratory protection|safety equipment)\b[^.]{0,180}\b(?:stored|available|easy to reach|on hand|installed)\b/i,
         /\b(?:airflow|garage door|ventilation)\b[^.]{0,180}\b(?:clear|works?|available|tested)\b/i,
      ].filter((pattern) => pattern.test(cleanMaterial)).length;
      return controlGroups >= 3;
   }

   if (/\bfirst usable result has been tested in its intended environment\b/i.test(lowerCriterion)) {
      const hasTest = /\b(?:tested|verified|ran|operated|used)\b/i.test(cleanMaterial);
      const hasResult = /\b(?:circular saw|drill|sander|shop vacuum|lighting|workspace|setup|system|workflow|first usable result)\b/i.test(cleanMaterial);
      const hasOperatingCondition = /\b(?:one-high-draw-tool-at-a-time|one high-draw tool at a time|walkway|access path|airflow|ppe|cleanup|intended environment|garage)\b/i.test(cleanMaterial);
      return hasTest && hasResult && hasOperatingCondition;
   }

   if (/\breset, operation, or handoff instructions are recorded\b/i.test(lowerCriterion)) {
      const explicitReset = /\b(?:can be reset|reset process|reset after|after a work session)\b/i.test(cleanMaterial);
      const resetSteps = [
         /\bfold(?:ing)?\b[^.]{0,120}\b(?:work surface|workbench|table)\b/i,
         /\bpark(?:ing)?\b[^.]{0,120}\b(?:cart|storage)\b/i,
         /\b(?:store|storing)\b[^.]{0,120}\btools?\b/i,
         /\b(?:vacuum|vacuuming|clean|cleanup)\b[^.]{0,120}\b(?:work area|workspace|floor|between operations)\b/i,
         /\bclear(?:ing)?\b[^.]{0,120}\b(?:path|walkway|access)\b/i,
      ].filter((pattern) => pattern.test(cleanMaterial)).length;
      return explicitReset && resetSteps >= 2;
   }

   if (/\bknown issues and deferred work are recorded\b/i.test(lowerCriterion)) {
      const deferred = /\b(?:deferred|not purchased|no .{0,100} (?:was|were|will be) purchased|optional future upgrade|future upgrade|remains? untouched)\b/i.test(cleanMaterial);
      const remainingCapacity = /\b(?:contingency|reserve)\b[^.]{0,120}\b(?:remains? unspent|remains? untouched|available|reserved)\b/i.test(cleanMaterial);
      return deferred || remainingCapacity;
   }

   const overlap = getProjectFactOverlapRatio(cleanCriterion, cleanMaterial);
   const criterionTokens = getDecisionReadbackTokens(cleanCriterion);
   const materialTokens = getDecisionReadbackTokens(cleanMaterial);
   let shared = 0;
   criterionTokens.forEach((token) => {
      if (materialTokens.has(token)) shared += 1;
   });

   if (overlap >= 0.4 || shared >= 3) return true;

   if (/\b(?:named|identified|selected)\b/i.test(cleanCriterion)) {
      return /\b(?:named|identified|selected|chosen|includes?|consists? of)\b/i.test(cleanMaterial) && /[:,;]/.test(cleanMaterial);
   }

   if (/\b(?:operations?|capabilities?)\b.*\b(?:listed|recorded|clear)\b/i.test(cleanCriterion)) {
      return /\b(?:require|requires|required|must support|capabilities?|operations?)\b/i.test(cleanMaterial) && /[:,;]/.test(cleanMaterial);
   }

   if (/\b(?:excluded|not included|intentionally excluded)\b/i.test(cleanCriterion)) {
      return /\b(?:do not|does not|will not|not required|unnecessary|excluded?|avoid)\b/i.test(cleanMaterial);
   }

   if (/\b(?:mobility|movable|portable|reset|access|operating requirements?)\b/i.test(cleanCriterion)) {
      return /\b(?:mobility|movable|mobile|portable|reset|access|clear space|shared use|multi-use)\b/i.test(cleanMaterial);
   }

   return false;
}

function getMaterialSupportForMilestone(material: ProjectMaterialSignal | undefined, milestone: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number] | undefined) {
   if (!material || !milestone) {
      return { supported: [] as string[], missing: [] as string[] };
   }

   const materialText = `${material.title} ${material.summary} ${material.details}`;
   const criteria = getScopedMilestoneCompletionCriteria(milestone);
   const supported = criteria.filter((criterion) => criterionIsSupportedByMaterial(criterion, materialText));

   return {
      supported,
      missing: criteria.filter((criterion) => !supported.includes(criterion)),
   };
}

function getExecutiveReasoningTokens(value?: string) {
   return new Set(
      compactText(value, 3000)
         .toLowerCase()
         .split(/[^a-z0-9]+/)
         .filter(
            (token) =>
               token.length >= 4 &&
               !["this", "that", "with", "from", "into", "project", "work", "working", "should", "could", "would", "about", "after", "before", "confirm", "confirmed", "decision", "current", "needs", "still", "event", "support"].includes(token),
         ),
   );
}

function hasStrongExecutiveRelevance(left?: string, right?: string) {
   const leftTokens = getExecutiveReasoningTokens(left);
   const rightTokens = getExecutiveReasoningTokens(right);
   let shared = 0;

   leftTokens.forEach((token) => {
      if (rightTokens.has(token)) {
         shared += 1;
      }
   });

   return shared >= 2;
}

function isSameExecutiveWorkItem(left?: string, right?: string) {
   const leftKey = compactText(left, 1200)
      .toLowerCase()
      .replace(/^(?:define|decide|choose|determine|confirm|verify|select|clarify|finalize|identify|establish|resolve|approve|lock|settle|map|specify)\s+/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

   const rightKey = compactText(right, 1200)
      .toLowerCase()
      .replace(/^(?:define|decide|choose|determine|confirm|verify|select|clarify|finalize|identify|establish|resolve|approve|lock|settle|map|specify)\s+/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

   if (!leftKey || !rightKey) {
      return false;
   }

   return leftKey === rightKey || leftKey.includes(rightKey) || rightKey.includes(leftKey);
}

function getPriorityDecisionReason(packet: ProjectIntelligencePacket, statement: string) {
   const understanding = packet.projectUnderstanding;
   const decision = understanding.unresolvedDecisions.find((item) => item.statement === statement);
   const activeMilestone = understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId);
   const followingMilestone = activeMilestone ? understanding.milestones.find((milestone) => milestone.status !== "complete" && milestone.order > activeMilestone.order) : undefined;

   const statementLower = compactText(statement, 1600).toLowerCase();
   const projectGoal = compactText(understanding.goal || packet.projectGoal, 1800);
   const afterThis = compactText(followingMilestone?.title || understanding.afterThis || packet.projectLeadState.afterNextMove, 900);

   const affectsCurrentWork = Boolean(decision && activeMilestone && (decision.affects.includes(activeMilestone.id) || getTextOverlapScore(statement, activeMilestone.title) >= 2 || getTextOverlapScore(statement, activeMilestone.goal) >= 2));

   const matchingDependency = understanding.dependencies.find((dependency) => dependency.state !== "satisfied" && hasStrongExecutiveRelevance(statement, `${dependency.before} ${dependency.after} ${dependency.reason}`));

   const matchingRisk = understanding.risks.find((risk) => hasStrongExecutiveRelevance(statement, `${risk.title} ${risk.consequence}`));

   const downstreamAreas = understanding.unresolvedDecisions
      .slice(1, 5)
      .map((item) => item.statement)
      .filter((item) => !isSameExecutiveWorkItem(statement, item) && !isSameExecutiveWorkItem(item, afterThis) && (hasStrongExecutiveRelevance(statement, item) || hasStrongExecutiveRelevance(item, afterThis)))
      .slice(0, 3);

   const consequences: string[] = [];

   if (/\b(?:audience|user|users|customer|customers|participant|participants)\b/i.test(statementLower)) {
      consequences.push("Until the audience is settled, feature, access, content, and workflow decisions remain partly hypothetical");
   } else if (/\b(?:brand|positioning|promise|message|language|tone|identity)\b/i.test(statementLower)) {
      consequences.push("Until the positioning is settled, the copy, hierarchy, tone, and visual direction remain provisional");
   } else if (/\b(?:scope|first release|pilot|mvp|minimum|release scope)\b/i.test(statementLower)) {
      consequences.push("Until the scope is fixed, estimates and implementation choices can keep expanding or shifting");
   } else if (/\b(?:authentication|access|privacy|security|permissions?)\b/i.test(statementLower)) {
      consequences.push("Until the access model is settled, the user flow, data handling, and implementation boundaries cannot be finalized confidently");
   } else if (/\b(?:structure|hierarchy|layout|editorial|information architecture)\b/i.test(statementLower)) {
      consequences.push("Until the structure is settled, content and design work may be organized around a hierarchy that later changes");
   } else if (/\b(?:delivery|vendor|venue|resources?|equipment|support|availability|schedule|date|deadline|logistics|staffing|capacity)\b/i.test(statementLower)) {
      consequences.push("Until this is confirmed, the setup plan still carries an execution uncertainty that may become harder to absorb later");
   } else if (affectsCurrentWork) {
      consequences.push("The current work cannot be treated as settled while this decision remains open");
   } else {
      consequences.push("This decision has the strongest effect on the work that follows");
   }

   if (matchingDependency && !isSameExecutiveWorkItem(statement, matchingDependency.after)) {
      consequences.push(`Settling it clears the handoff into ${matchingDependency.after.replace(/[.!?]+$/, "")}`);
   } else if (afterThis && !isSameExecutiveWorkItem(statement, afterThis)) {
      consequences.push(`Once it is settled, the project can move into ${afterThis.replace(/[.!?]+$/, "")} with fewer assumptions`);
   }

   if (matchingRisk) {
      const riskConsequence = compactText(matchingRisk.consequence || matchingRisk.title, 700).replace(/[.!?]+$/, "");

      consequences.push(`Delaying it leaves this risk unresolved: ${riskConsequence}`);
   } else if (/\b(?:audience|scope|brand|positioning|structure|authentication|privacy|delivery|schedule)\b/i.test(statementLower)) {
      consequences.push("Resolving it now is cheaper than revising downstream work after more has been built or arranged");
   }

   if (downstreamAreas.length) {
      consequences.push(`It also gives clearer direction to ${downstreamAreas.map((item) => item.replace(/[.!?]+$/, "")).join(", ")}`);
   }

   if (!consequences.length && projectGoal) {
      consequences.push(`It is the decision most likely to reduce uncertainty around ${projectGoal.replace(/[.!?]+$/, "")}`);
   }

   return uniqueStrings(
      consequences.map((item) => ensureSentence(item)),
      4,
   ).join(" ");
}

// ========================================
// ALLEVIN MK VIII — Authoritative continuous project conversation
// Purpose:
// Use one typed project model and one remembered conversation subject so
// different questions receive different project-grounded judgments.
// ========================================

function cleanAuthoritativeStatement(value?: string, limit = 1800) {
   return (
      compactText(value, limit)
         .replace(/^[\s•*-]+/, "")
         .replace(/^(?:goal|success|current position|already established|still unresolved|important constraints|current milestone):\s*/i, "")
         // Repair fragments created when intake splits a sentence immediately
         // after a coordinating word, such as “but. I have not…”.
         .replace(/,\s*(?:but|and|or)\s*\.\s*/gi, ". ")
         .replace(/\b(?:but|and|or)\s*\.\s*/gi, "")
         .replace(/\.\s*;/g, ".")
         .replace(/;\s*\./g, ".")
         .replace(/\s+([,.;!?])/g, "$1")
         .replace(/([.!?]){2,}/g, "$1")
         .replace(/\s{2,}/g, " ")
         .trim()
   );
}

function formatAuthoritativeGoalFact(value?: string) {
   let clean = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   if (!clean) return "";

   const firstPersonProgressive: Array<[RegExp, string]> = [
      [/^i am building\b/i, "build"],
      [/^i am creating\b/i, "create"],
      [/^i am launching\b/i, "launch"],
      [/^i am designing\b/i, "design"],
      [/^i am developing\b/i, "develop"],
      [/^i am producing\b/i, "produce"],
      [/^i am writing\b/i, "write"],
      [/^i am planning\b/i, "plan"],
      [/^i am organizing\b/i, "organize"],
      [/^i am running\b/i, "run"],
      [/^i am publishing\b/i, "publish"],
   ];

   for (const [pattern, replacement] of firstPersonProgressive) {
      if (pattern.test(clean)) {
         clean = clean.replace(pattern, replacement);
         break;
      }
   }

   if (/^(?:build|create|launch|design|develop|produce|write|plan|organize|run|deliver|publish|implement|complete|establish|make)\b/i.test(clean)) {
      return `The project is to ${clean.replace(/^./, (character) => character.toLowerCase())}`;
   }

   return `The project goal is ${clean.replace(/^./, (character) => character.toLowerCase())}`;
}

function formatAuthoritativeQuestion(value?: string) {
   const clean = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   return clean ? `${clean}?` : "";
}

function getConcreteMilestoneAction(milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return "";
   const title = milestone.title.replace(/[.!?]+$/, "");
   const searchable = title.toLowerCase();
   const questions = milestone.openQuestions.map((item) => cleanAuthoritativeStatement(item)).filter(Boolean);

   if (/\b(?:approval|license|licensing|permit|permission|operating rules?|quiet hours?|management|insurance|assign an owner)\b/.test(searchable)) {
      const participantProgramApproval =
         /\b(?:pilot|program)\b/i.test(searchable) &&
         (questions.some((item) => /\b(?:department|owner|sponsor|participant|mentor|student|volunteer|privacy|background check|training|escalat|matching|application)\b/i.test(item)) || /\bassign an owner\b/i.test(searchable));

      if (participantProgramApproval) {
         const hasInsuranceOrLiability = questions.some((item) => /\b(?:insurance|liability|vehicle requirements?|driver requirements?|risk responsibility)\b/i.test(item));
         return hasInsuranceOrLiability
            ? "Ask the current sponsor or contact to identify the formal owner, approval path, insurance or liability requirements, privacy rules, volunteer screening or training requirements, and escalation boundaries; record who decides each item before recruitment or applications begin"
            : "Ask the current sponsor or contact to identify the formal owner, approval path, privacy requirements, volunteer screening or training requirements, and escalation boundaries; record who decides each item before recruitment or applications begin";
      }

      const serviceOrProgramApproval = /\binsurance\b/i.test(searchable) || questions.some((item) => /\b(?:insurance|lease|liability|loss|damage|unsafe use|storage allowed|host approval)\b/i.test(item));

      if (serviceOrProgramApproval) {
         return "Create a blocker checklist for host approval, insurance or lease restrictions, allowed storage, and responsibility for loss, damage, and unsafe use; confirm the host decision first because it determines whether the program can proceed";
      }

      const checklistItems = uniqueProjectFacts(
         [
            questions.some((item) => /\b(?:management|approval|permission)\b/i.test(item)) || /\b(?:management|approval|permission)\b/i.test(searchable) ? "management permission" : "",
            questions.some((item) => /\b(?:license|licensing|rights)\b/i.test(item)) || /\b(?:license|licensing|rights)\b/i.test(searchable) ? "licensing requirements" : "",
            questions.some((item) => /\b(?:quiet[- ]hours?|operating hours?|time limit)\b/i.test(item)) || /\boperating rules?\b/i.test(searchable) ? "quiet-hour or operating-time rules" : "",
            questions.some((item) => /\b(?:access|walkway|entrance|shared space|courtyard|location|emergency)\b/i.test(item)) || /\boperating rules?\b/i.test(searchable) ? "shared-space and access conditions" : "",
         ].filter(Boolean),
         4,
      );
      const checklistLabel =
         checklistItems.length <= 1 ? checklistItems[0] || "" : checklistItems.length === 2 ? `${checklistItems[0]} and ${checklistItems[1]}` : `${checklistItems.slice(0, -1).join(", ")}, and ${checklistItems[checklistItems.length - 1]}`;
      const hasBlockingApproval = checklistItems.includes("management permission");
      const hasBlockingLicense = checklistItems.includes("licensing requirements");
      return checklistItems.length
         ? hasBlockingApproval || hasBlockingLicense
            ? `Create a short approval checklist for ${checklistLabel}; confirm ${hasBlockingApproval && hasBlockingLicense ? "management permission and licensing" : hasBlockingApproval ? "management permission" : "licensing"} first because either issue could block or materially reshape the project before a date, content choice, or equipment setup is chosen`
            : `Create a short approval checklist for ${checklistLabel}, then confirm the first requirement that could block the project`
         : "Confirm the approval, licensing, and operating rules before committing to a date, location, or equipment plan";
   }

   if (/\b(?:applications?, eligibility, and matching|participant eligibility and intake)\b/i.test(searchable)) {
      return "Draft the minimum application questions, confirm eligibility for each role, and define the few matching criteria that genuinely affect fit before collecting participant information";
   }

   if (/\b(?:orientation and coordinator support|staff and volunteer support)\b/i.test(searchable)) {
      return "Create a short orientation outline covering role boundaries, listening, referrals, privacy, missed contact, and escalation; add a one-page coordinator guide for questions and exceptions";
   }

   if (/\b(?:communication, (?:meeting|scheduling), and exception rules|day-to-day operating and exception rules)\b/i.test(searchable)) {
      return /\bscheduling\b/i.test(searchable)
         ? "Set the approved communication method, request and scheduling process, cancellation rule, late or missed-service response, reassignment process, and emergency exception path"
         : "Set the expected contact rhythm, approved communication method, meeting format, missed-contact rule, reassignment process, and what happens when someone leaves early";
   }

   if (/\b(?:pilot|program) budget, dates, and recruitment plan\b/i.test(searchable)) {
      return "Set the start and end dates, allocate the budget, choose the recruitment channels, and define the minimum number of participants needed to run a useful pilot";
   }

   if (/\brecruit participants and run the (?:pilot|program)\b/i.test(searchable)) {
      return "Recruit only after approval and rules are settled, complete orientation, make the first matches, and track participation and exceptions without collecting unnecessary personal data";
   }

   if (/\breview the (?:pilot|program) and decide what changes next\b/i.test(searchable)) {
      return "Review participation, contact consistency, participant feedback, referrals, exceptions, and coordinator workload; decide what should continue, change, or stop";
   }

   if (/\b(?:choose and inventory|inventory the first|first collection|priority collection|first batch|first set)\b/i.test(searchable)) {
      return "Compare the strongest candidate collections or starting sets by importance, size, condition, access, risk, and available review support; choose one bounded starting set, then record a simple inventory before processing anything";
   }

   if (/\b(?:first resource set|first tool set|resource set)\b/i.test(searchable)) {
      return "List the strongest candidate resources, define acceptance and safety checks, exclude high-risk items, then inventory the first approved set";
   }

   if (/\b(?:privacy|naming|metadata|identification)\b/i.test(searchable)) {
      return "Draft the naming convention, required metadata fields, privacy and access rules, and a simple process for recording and resolving unknown details";
   }

   if (/\b(?:move timeline|lease deadlines?)\b/i.test(searchable)) {
      return "Put the lease-end date, 30-day notice deadline, target move window, and latest safe date for signing the new lease on one simple timeline; verify the notice rule first, then identify the earliest decision you cannot reverse";
   }

   if (/\bnew apartment needs to have\b/i.test(searchable)) {
      return "Write a short apartment scorecard with must-haves, nice-to-haves, and deal-breakers for commute, total cost, parking, noise, security, laundry, internet, and lease terms";
   }

   if (/\bplan the move\b/i.test(searchable)) {
      return "Map the move from lease approval through notice, packing, utilities, moving day, cleaning, and key return; assign an owner and backup for each step";
   }

   if (/\brelocation budget\b/i.test(searchable)) {
      return "List the deposit, movers, overlap, utility setup, cleaning, replacements, and contingency costs; set a maximum total and mark what can be cut first";
   }

   if (/\b(?:neighborhoods?|apartments?|movers?)\b/i.test(searchable)) {
      return "Create one comparison table for neighborhoods and apartments, plus a smaller quote comparison for movers; choose the leading option only after the must-haves and total cost are visible";
   }

   if (/\bbook the move\b/i.test(searchable)) {
      return "Confirm the lease and notice sequence, book the mover, set packing dates, schedule utilities and internet, and prepare access, parking, first-night, and work-continuity checklists";
   }

   if (/\bmove in\b/i.test(searchable)) {
      return "Run the moving-day plan, protect work-critical electronics and documents, confirm utilities and internet, and set up the first-night essentials before unpacking lower-priority items";
   }

   if (/\b(?:old apartment|finish the move)\b/i.test(searchable)) {
      return "Clean and document the old apartment, return keys, finish address changes and service cancellations, confirm the deposit process, and record any remaining follow-up";
   }

   if (/\b(?:deadlines? and hard limits|travel dates? and hard limits|external constraints?|commitments?|decision deadlines?)\b/i.test(searchable)) {
      return "Put the fixed dates, approval or notice rules, and irreversible commitments on one simple timeline; verify the earliest blocker before making a commitment";
   }

   if (/\b(?:finished result needs to include|trip needs to include)\b/i.test(searchable)) {
      return "Write the must-haves, nice-to-haves, and deal-breakers that define a good finished result";
   }

   if (/\b(?:order of work|backup options|itinerary)\b/i.test(searchable)) {
      return "Lay out the work in order, assign ownership, and add a backup for the first two failure points";
   }

   if (/\b(?:working budget|trip budget)\b/i.test(searchable)) {
      return "List the required cost categories, set the maximum spend, and mark the optional items that can wait";
   }

   if (/\b(?:main options and providers|routes?|stays?|travel options)\b/i.test(searchable)) {
      return "Put the strongest options in one comparison table and choose the leading option against the confirmed must-haves and constraints";
   }

   if (/\b(?:book what is needed|book the trip|prepare the logistics)\b/i.test(searchable)) {
      return "Confirm the bookings, access, supplies, owners, and fallback arrangements needed for execution";
   }

   if (/\b(?:carry out the plan|take the trip|essentials working)\b/i.test(searchable)) {
      return "Carry out the plan, protect the critical items, and confirm the essentials work before handling lower-priority setup";
   }

   if (/\b(?:finish the loose ends|remaining follow-up)\b/i.test(searchable)) {
      return "Close the remaining obligations, document the result, and record what still needs follow-up";
   }

   if (/\b(?:story arc|narrative promise|emotional progression|complete story arc)\b/i.test(searchable)) {
      return "Write a five-beat story spine covering the opening state, escalating attempts, turning point, resolution, and changed ending; check that each beat moves the character from the starting emotion toward the intended final change";
   }

   if (/\b(?:page-by-page story map|page plan|story map|spreads?)\b/i.test(searchable)) {
      return "Map the story page by page or spread by spread, giving each section one job and marking the page turns where tension, surprise, reassurance, or discovery should change";
   }

   if (/\b(?:draft and revise the complete manuscript|complete manuscript|complete story)\b/i.test(searchable)) {
      return "Draft the complete beginning-to-end manuscript from the approved story map, then revise it once for audience, pacing, tone, and the confirmed length limit";
   }

   if (/\b(?:visual approach|illustration approach|production plan)\b/i.test(searchable)) {
      return "Create one representative visual test and compare the realistic production options against consistency, time, skill, cost, and the finished format before committing to the full artwork";
   }

   if (/\b(?:illustrations? and page layouts?|artwork and layouts?|page layouts?)\b/i.test(searchable)) {
      return "Build rough layouts for the full sequence before finishing individual artwork, then complete the pages in a consistent visual and typographic system";
   }

   if (/\b(?:read-aloud|visual-comprehension|focused review)\b/i.test(searchable)) {
      return "Run one focused read-aloud and picture-comprehension review, record where attention, language, pacing, emotion, or visual meaning breaks down, and revise only the issues that affect the project goal";
   }

   if (/\b(?:print-ready files|production service|printer|printing service)\b/i.test(searchable)) {
      return "Compare the viable production services against the confirmed format, file requirements, proof cost, quality, quantity, and delivery window, then prepare one compliant print-ready package";
   }

   if (/\b(?:order and review the first proof|first proof|printed proof)\b/i.test(searchable)) {
      return "Order one proof and review it for missing content, page order, readability, color, trim, binding, and physical quality before approving additional copies";
   }

   if (/\b(?:quality|standards?|handling|preservation)\b/i.test(searchable)) {
      return "Define the minimum acceptable quality, allowed corrections, specialist-handling triggers, and the check that proves the work meets the standard";
   }

   if (/\b(?:storage|labeling|recordkeeping)\b/i.test(searchable) && /\b(?:approach|structure|system|plan)\b/i.test(searchable)) {
      return "Choose the storage location, labeling convention, privacy-safe borrowing record, and the method for tracking availability, condition, late, missing, and damaged states";
   }

   if (/\b(?:organization|folder|storage|backup|repository)\b/i.test(searchable) && /\b(?:structure|system|approach|plan)\b/i.test(searchable)) {
      return "Sketch the organization and storage structure, decide where originals, working files, and finished outputs belong, and define at least two independent backup locations";
   }

   const question = questions.find(Boolean);
   const decision = milestone.decisions.map((item) => cleanAuthoritativeStatement(item)).find(Boolean);
   const startingPrompt = cleanAuthoritativeStatement(milestone.startingPrompt);
   const genericPrompt = /^(?:what must be|create the smallest artifact|work on|complete|produce the first)\b/i.test(startingPrompt);

   if (question) return `Draft a concrete answer to: “${formatAuthoritativeQuestion(question)}”`;
   if (decision && /^(?:who|what|when|where|why|how|which|whether)\b/i.test(decision)) return `Draft a concrete answer to: “${formatAuthoritativeQuestion(decision)}”`;
   if (decision) return `Write down the decision for ${decision.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`;
   if (startingPrompt && !genericPrompt) return startingPrompt;

   if (/\b(?:brand|positioning|promise|message|language|identity)\b/.test(searchable)) {
      return "Draft three one-sentence versions of the company promise";
   }

   if (/\b(?:role|relationship|parent|ecosystem|family|portfolio)\b/.test(searchable)) {
      return "Write one sentence explaining the role of each part and one sentence explaining what they share under the parent project";
   }

   if (/\b(?:structure|hierarchy|editorial|layout|information architecture)\b/.test(searchable)) {
      return "Sketch two viable content orders and label what each order communicates about priority and relationship";
   }

   if (/^(?:finalize|define|clarify|decide|choose|select|establish)\b/i.test(title)) {
      return `Draft two or three concrete versions of ${title.replace(/^(?:finalize|define|clarify|decide|choose|select|establish)\s+/i, "")}, then compare them against the project goal and success criteria`;
   }
   if (/^(?:confirm|verify|validate|approve)\b/i.test(title)) {
      return `List the evidence needed for ${title.replace(/^(?:confirm|verify|validate|approve)\s+/i, "").replace(/^./, (character) => character.toLowerCase())}, then obtain the first missing confirmation`;
   }
   return `Create the smallest complete draft or artifact that demonstrates progress on ${title}`;
}

function isEmptyProjectValue(value?: string) {
   const lower = normalizePrompt(value);
   return !lower || /^(?:none|none confirmed|none confirmed yet|nothing confirmed|not recorded|unknown|n\/a)$/.test(lower);
}

function getAuthoritativeMilestones(packet: ProjectIntelligencePacket) {
   return [...packet.projectUnderstanding.milestones].sort((left, right) => left.order - right.order);
}

function findMilestoneByConversationSubject(packet: ProjectIntelligencePacket, conversation: ProjectGuidanceConversationContext) {
   const milestones = getAuthoritativeMilestones(packet);
   const subjectTitle = cleanAuthoritativeStatement(conversation.lastSubject?.kind === "milestone" ? conversation.lastSubject.title : conversation.lastMilestoneTitle);
   if (!subjectTitle) return undefined;

   return milestones.find((milestone) => normalizePrompt(milestone.title) === normalizePrompt(subjectTitle) || getProjectFactOverlapRatio(milestone.title, subjectTitle) >= 0.72);
}

function getAuthoritativeActiveMilestone(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   return (
      understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId) ||
      understanding.milestones.find((milestone) => milestone.status === "active") ||
      getAuthoritativeMilestones(packet).find((milestone) => milestone.status !== "complete")
   );
}

function getFollowingMilestone(packet: ProjectIntelligencePacket, base?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   const milestones = getAuthoritativeMilestones(packet);
   const reference = base || getAuthoritativeActiveMilestone(packet);
   if (!reference) return undefined;
   const index = milestones.findIndex((milestone) => milestone.id === reference.id || normalizePrompt(milestone.title) === normalizePrompt(reference.title));
   return index >= 0 ? milestones.slice(index + 1).find((milestone) => milestone.status !== "complete") : undefined;
}

function isAuthoritativeDecision(value?: string) {
   const clean = cleanAuthoritativeStatement(value);
   if (!clean || isEmptyProjectValue(clean)) return false;
   return isDecisionReadbackCandidate(clean) || /\b(?:not decided|not chosen|not finalized|not confirmed|still open|whether|which option|choose between|decide between)\b/i.test(clean);
}

function getAuthoritativeConfirmedDecisions(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const milestoneTitles = understanding.milestones.map((milestone) => milestone.title);
   const protectedFacts = [understanding.goal, understanding.successState, ...understanding.successCriteria.map((criterion) => criterion.statement)];

   return uniqueProjectFacts(
      understanding.confirmedDecisions
         .map((decision) => cleanAuthoritativeStatement(decision.statement))
         .filter((statement) => !isEmptyProjectValue(statement))
         .filter((statement) => !milestoneTitles.some((title) => getProjectFactOverlapRatio(statement, title) >= 0.82))
         .filter((statement) => !protectedFacts.some((fact) => getProjectFactOverlapRatio(statement, fact) >= 0.86)),
      8,
   );
}

function getAuthoritativeUnresolvedDecisions(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const protectedFacts = [understanding.goal, understanding.successState, ...understanding.successCriteria.map((criterion) => criterion.statement), ...understanding.constraints.map((constraint) => constraint.statement)];

   return uniqueProjectFacts(
      understanding.unresolvedDecisions
         .map((decision) => cleanAuthoritativeStatement(decision.statement))
         .filter(isAuthoritativeDecision)
         .filter((statement) => !protectedFacts.some((fact) => getProjectFactOverlapRatio(statement, fact) >= 0.82)),
      8,
   );
}

function isDetailedProjectUpdateText(value?: string) {
   const raw = (value || "").replace(/\r/g, "\n").trim();
   const clean = cleanAuthoritativeStatement(raw, 16000);
   if (clean.length < 50 || /\?\s*$/.test(clean)) return false;

   const statements = raw
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => cleanAuthoritativeStatement(item, 1800))
      .filter(Boolean);
   const decisionLike = statements.filter(
      (statement) =>
         /\b(?:i|we)\s+(?:chose|selected|decided|confirmed|reviewed|found|tested|learned|will use|will keep|will add|will limit|will require|will store|have chosen|have selected|have decided|have confirmed)\b/i.test(statement) ||
         /^(?:an?|the)\s+.+?\s+(?:reviewed|confirmed|verified|tested|measured|determined|found)\b/i.test(statement) ||
         /\b(?:is|are)\s+(?:sufficient|required|not required|optional|confirmed|approved|safe|unsafe|adequate|inadequate)\b/i.test(statement) ||
         /\b(?:will|must|should|can|cannot|do not|does not|will not)\s+(?:be\s+)?(?:used|added|kept|stored|controlled|limited|required|included|excluded|reconsidered|connected|placed|documented|separated|remain|opened|reserved|allocated|assigned|deferred)\b/i.test(
            statement,
         ) ||
         /(?:^|[-*•]\s*)[^:\n]{2,120}:\s*\$\s*[\d,]+(?:\.\d{1,2})?\b/i.test(statement) ||
         /\b(?:budget|categories?|workspace|safety|required|remaining|reserve|reserved|committed|assigned|allocated|deferred|not included)\b.*\$\s*[\d,]+(?:\.\d{1,2})?\b/i.test(statement) ||
         /\b(?:are|is)\s+(?:deferred|excluded|not included)\b/i.test(statement) ||
         /\b(?:i|we)\s+will\s+(?:not purchase|defer|reconsider)\b/i.test(statement) ||
         /\b(?:track saw|miter saw|table saw|major (?:power )?tool)\b[^.]{0,260}\b(?:remains|leading future option|will not purchase|excluded|reconsider|deferred|conditional)\b/i.test(statement) ||
         /\brequired safety equipment\b[^.]{0,260}\b(?:includes?|consists of|will include|is defined)\b/i.test(statement),
   );

   const budgetEvidence = statements.filter((statement) => /\$\s*[\d,]+(?:\.\d{1,2})?\b/.test(statement) || /\b(?:reserve|reserved|committed|assigned|allocated|deferred|not included|optional future upgrades?|phase[- ]one budget)\b/i.test(statement));

   return decisionLike.length >= 2 || budgetEvidence.length >= 3 || (clean.length >= 160 && (decisionLike.length >= 1 || budgetEvidence.length >= 2));
}

function getMostRecentDetailedProjectUpdate(conversation: ProjectGuidanceConversationContext) {
   const candidates = [
      conversation.lastUserPrompt || "",
      ...(conversation.recentMessages || [])
         .filter((message) => message.role === "user")
         .slice()
         .reverse()
         .map((message) => message.content),
   ];

   return candidates.find((candidate) => isDetailedProjectUpdateText(candidate)) || "";
}

function extractExplicitProjectUpdateFacts(value?: string) {
   const raw = (value || "").replace(/\r/g, "\n").trim();
   const clean = cleanAuthoritativeStatement(raw, 16000);
   if (!clean) return [] as string[];

   return uniqueProjectFacts(
      raw
         .split(/(?<=[.!?])\s+|\n+/)
         .map((item) => cleanAuthoritativeStatement(item, 1800))
         .filter((statement) => statement.length >= 14)
         .filter((statement) => !/^(?:an?|the)\s+.+?\s+(?:reviewed|checked|looked at)\b.*\bsetup\b/i.test(statement) || /\b(?:confirmed|determined|found|verified)\b/i.test(statement))
         .filter(
            (statement) =>
               /\b(?:i|we)\s+(?:chose|selected|decided|confirmed|will use|will keep|will add|will limit|will require|will store|have chosen|have selected|have decided|have confirmed)\b/i.test(statement) ||
               /\b(?:is|are)\s+(?:sufficient|required|not required|optional|confirmed|approved|safe|unsafe|adequate|inadequate)\b/i.test(statement) ||
               /\b(?:will|must|should|can|cannot|do not|does not|will not)\s+(?:be\s+)?(?:used|added|kept|stored|controlled|limited|required|included|excluded|reconsidered|connected|placed|positioned|located|mounted|documented|separated|remain|opened|sit|stay|park|preserve|leave|reserved|allocated|assigned|deferred)\b/i.test(
                  statement,
               ) ||
               /(?:^|[-*•]\s*)[^:\n]{2,120}:\s*\$\s*[\d,]+(?:\.\d{1,2})?\b/i.test(statement) ||
               /\b(?:budget|categories?|workspace|safety|required|remaining|reserve|reserved|committed|assigned|allocated|deferred|not included)\b.*\$\s*[\d,]+(?:\.\d{1,2})?\b/i.test(statement) ||
               /\b(?:required changes|optional future upgrades|immediate needs|phase[- ]one changes|phase[- ]one budget|contingency reserve)\b/i.test(statement) ||
               /\b(?:i|we)\s+will\s+(?:not purchase|defer|reconsider)\b/i.test(statement) ||
               /\b(?:track saw|miter saw|table saw|major (?:power )?tool)\b[^.]{0,260}\b(?:remains|leading future option|will not purchase|excluded|reconsider|deferred|conditional)\b/i.test(statement) ||
               /\brequired safety equipment\b[^.]{0,260}\b(?:includes?|consists of|will include|is defined)\b/i.test(statement),
         ),
      18,
   );
}

function extractMilestoneSpecificUpdateFacts(value: string | undefined, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number], limit = 18) {
   const raw = (value || "").replace(/\r/g, "\n").trim();
   const clean = cleanAuthoritativeStatement(raw, 20000);
   if (!clean) return [] as string[];

   const category = getMilestoneGuidanceCategory(milestone?.title || "");
   const statements = raw
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => cleanAuthoritativeStatement(item, 2200))
      .filter((statement) => statement.length >= 14);

   const categoryFacts = statements.filter((statement) => {
      if (category === "layout") {
         return (
            /\b(?:left wall|right wall|center work zone|central access path|main walkway|work surface|work zone|storage cart|wall-mounted shelves|task lighting|shop vacuum|garage door|finishing area|closed cabinet|outlets?|clearance|sheet goods|mobile|folding|portable|stationary machinery|workbench)\b/i.test(
               statement,
            ) && /\b(?:will|remain|sit|park|stay|stored|mounted|used|added|leave|leaving|enough clearance|away from|near|along|beneath|above|center)\b/i.test(statement)
         );
      }

      if (category === "requirements") {
         return /\b(?:electrical|power|outlet|circuit|lighting|ventilation|airflow|dust|noise|hearing protection|finish|chemical|storage|safety|optional upgrade|required change)\b/i.test(statement);
      }

      if (category === "first-scope") {
         return /\b(?:first projects?|side table|shelves?|storage cart|workbench top|straight cuts?|crosscuts?|drilling|sanding|assembly|finishing|heavy milling|stationary machinery|movable|reset)\b/i.test(statement);
      }

      if (category === "budget") {
         return (
            /\$\s*[\d,]+(?:\.\d{1,2})?\b/.test(statement) ||
            /\b(?:budget|cost|spending|reserve|reserved|committed|assigned|allocated|required categories?|workspace and safety|contingency|deferred|not included|optional future upgrades?)\b/i.test(statement)
         );
      }

      if (category === "execution") {
         const recordsImplementation =
            /\b(?:purchased|bought|acquired|installed|mounted|assembled|built|organized|placed|positioned|connected|configured|tested|verified|working|usable|completed|set up|setup|available|on hand|stored|parks?|remains? clear)\b/i.test(statement) &&
            /\b(?:lighting|vacuum|dust|storage|cabinet|safety|ppe|protection|work surface|workbench|cart|shelves?|supplies|tools?|equipment|workspace|layout|access|airflow|cleanup|result|walkway|path)\b/i.test(statement);
         const recordsReset = /\b(?:can be reset|reset process|after a work session|folding the work surface|parking the rolling cart|clearing the (?:center )?path|vacuuming the work area)\b/i.test(statement);
         const recordsDeferredWork = /\b(?:remains? unspent|remains? untouched|deferred|not purchased|no .{0,80} (?:was|were|will be) purchased|optional future upgrade|future upgrade)\b/i.test(statement);
         const recordsCompletion = /\b(?:completed|finished)\b[^.]{0,120}\b(?:setup|implementation|installation|workspace|first usable result)\b/i.test(statement);

         return recordsImplementation || recordsReset || recordsDeferredWork || recordsCompletion;
      }

      return milestoneGuidanceQuestionMatchesTitle(milestone?.title || "", statement);
   });

   const explicitFacts = extractExplicitProjectUpdateFacts(clean).filter((statement) => (category === "general" ? true : factMatchesGuidanceCategory(statement, category)));
   const executionPurchaseFacts =
      category === "execution" && /\b(?:purchased|bought|acquired)\s+and\s+(?:installed|assembled|organized)\b/i.test(raw)
         ? Array.from(raw.matchAll(/(?:^|\n)\s*[-*•]\s*([^:\n]{2,120}):\s*\$\s*([\d,]+(?:\.\d{1,2})?)/gim))
              .map((match) => {
                 const label = cleanAuthoritativeStatement(match[1], 180)
                    .replace(/^[-*•]\s*/, "")
                    .trim();
                 const amount = cleanAuthoritativeStatement(match[2], 40);
                 return label && amount ? `Purchased and installed ${label} for $${amount}` : "";
              })
              .filter(Boolean)
         : [];

   return uniqueProjectFacts([...executionPurchaseFacts, ...explicitFacts, ...categoryFacts], limit);
}

function getMostRecentCompletedMilestoneWithRecordedProgress(packet: ProjectIntelligencePacket) {
   return getAuthoritativeMilestones(packet)
      .filter((milestone) => milestone.status === "complete")
      .slice()
      .sort((left, right) => right.order - left.order)
      .find((milestone) => milestone.decisions.length > 0 || Boolean(cleanAuthoritativeStatement(milestone.workingContent, 12000)) || milestone.completionEvidence.length > 0);
}

function milestoneHasRecordedProgress(milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   return Boolean(milestone && (milestone.decisions.length > 0 || Boolean(cleanAuthoritativeStatement(milestone.workingContent, 12000)) || milestone.completionEvidence.length > 0));
}

function getMostRelevantRecordedMilestone(packet: ProjectIntelligencePacket, active?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (milestoneHasRecordedProgress(active)) return active;
   return getMostRecentCompletedMilestoneWithRecordedProgress(packet);
}

function factMatchesGuidanceCategory(fact: string, category: string) {
   const clean = cleanAuthoritativeStatement(fact, 2200);
   if (!clean || category === "general") return Boolean(clean);

   if (category === "layout") {
      // Scope and capability decisions can mention storage, workbenches, or
      // stationary machinery without actually deciding the layout. Keep those
      // out of a scoped layout readback unless the sentence records placement,
      // access, mobility, or another spatial arrangement.
      if (/^(?:i|we)\s+(?:chose|selected|defined|named)\b.*\b(?:first|initial)\s+projects?\b/i.test(clean)) return false;
      if (/^(?:these|those|the|they)\s+(?:projects?|uses?|scenarios?)?\s*(?:do not |don't |does not |doesn't )?require\b/i.test(clean)) return false;
      if (/^they\s+(?:do not |don't )?require\b/i.test(clean)) return false;

      const hasSpatialSubject =
         /\b(?:layout|zone|left wall|right wall|center work zone|central access path|path|walkway|access|work surface|workbench|storage cart|wall-mounted shelves|task lighting|shop vacuum|airflow path|garage door|finishing area|closed cabinet|outlets?|clearance)\b/i.test(
            clean,
         );
      const hasPlacementDecision = /\b(?:will|remain|sit|park|stay|be mounted|be stored|be used|be placed|be positioned|be located|leave|leaving|near|along|beneath|above|center)\b/i.test(clean);
      const hasLayoutPolicy = /\b(?:all work surfaces|tool storage)\b.*\b(?:mobile|folding|portable|reset)\b|\bno permanent stationary machinery\b|\bno fixed full-size workbench\b/i.test(clean);

      return (hasSpatialSubject && hasPlacementDecision) || hasLayoutPolicy;
   }
   if (category === "requirements") {
      return /\b(?:electrical|power|outlet|circuit|lighting|ventilation|airflow|dust|noise|hearing|finish|chemical|storage|safety|required|optional upgrade)\b/i.test(clean);
   }
   if (category === "first-scope") {
      return /\b(?:first projects?|initial projects?|repair|shelves?|storage cart|workbench top|straight cuts?|crosscuts?|drilling|sanding|assembly|finishing|heavy milling|stationary machinery|movable|reset)\b/i.test(clean);
   }
   if (category === "selection") {
      if (/\b(?:first|initial) projects?\b/i.test(clean) && !/\b(?:tool|equipment|option|purchase|defer|safety)\b/i.test(clean)) return false;
      if (/\b(?:required operations?|straight cuts?|crosscuts?|drilling|sanding|assembly|light finishing)\b/i.test(clean) && !/\b(?:tool|equipment|option|purchase|defer|safety)\b/i.test(clean)) return false;

      const hasSelectionSubject = /\b(?:major (?:power )?tool|track saw|table saw|miter saw|tool|equipment|option|purchase|reserve|safety equipment|eye protection|hearing protection|respiratory protection|clamping accessories?)\b/i.test(clean);
      const hasSelectionDecision = /\b(?:decided|selected|chosen|recommend|leading future option|will not purchase|not purchase|deferred|excluded|reconsider|remains untouched|required|includes?|conditional|only if)\b/i.test(clean);
      return hasSelectionSubject && hasSelectionDecision;
   }

   if (category === "execution") {
      // Scope decisions can mention carts, shelves, or workbenches without
      // recording implementation. Keep them out of execution-only readbacks.
      if (/^(?:i|we)\s+(?:chose|selected|defined|named)\b.*\b(?:first|initial)\s+projects?\b/i.test(clean)) return false;
      if (/^(?:these|those|the|they)\s+(?:projects?|uses?|scenarios?)?\s*(?:do not |don't |does not |doesn't )?require\b/i.test(clean)) return false;

      const recordsImplementation =
         /\b(?:purchased|bought|acquired|installed|mounted|assembled|built|organized|placed|positioned|connected|configured|tested|verified|working|usable|completed|set up|setup|available|on hand|stored|parks?|remains? clear)\b/i.test(clean) &&
         /\b(?:lighting|vacuum|dust|storage|cabinet|safety|ppe|protection|work surface|workbench|cart|shelves?|supplies|tools?|equipment|workspace|layout|access|airflow|cleanup|result|walkway|path)\b/i.test(clean);
      const recordsReset = /\b(?:can be reset|reset process|after a work session|folding the work surface|parking the rolling cart|clearing the (?:center )?path|vacuuming the work area)\b/i.test(clean);
      const recordsDeferredWork = /\b(?:remains? unspent|remains? untouched|deferred|not purchased|no .{0,80} (?:was|were|will be) purchased|optional future upgrade|future upgrade)\b/i.test(clean);
      const recordsCompletion = /\b(?:completed|finished)\b[^.]{0,120}\b(?:setup|implementation|installation|workspace|first usable result)\b/i.test(clean);

      return recordsImplementation || recordsReset || recordsDeferredWork || recordsCompletion;
   }

   return getMilestoneGuidanceCategory(clean) === category;
}

function getRecordedMilestoneDecisionFacts(milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number], limit = 14) {
   if (!milestone) return [] as string[];

   return uniqueProjectFacts(
      [
         ...milestone.decisions.map((item) => cleanAuthoritativeStatement(item, 1800)),
         ...extractMilestoneSpecificUpdateFacts(milestone.workingContent, milestone, limit),
         ...milestone.completionEvidence.flatMap((item) => extractMilestoneSpecificUpdateFacts(item, milestone, limit)),
      ].filter((item) => Boolean(item) && !/^(?:i\s+)?(?:completed|finished)\s+(?:the\s+)?current\s+milestone\b/i.test(item) && !/^completed\s+/i.test(item)),
      limit,
   );
}

function getRecordedProjectResolutionCorpus(packet: ProjectIntelligencePacket, recentUpdate = "") {
   return cleanAuthoritativeStatement([recentUpdate, ...getAuthoritativeMilestones(packet).flatMap((milestone) => [milestone.workingContent, ...milestone.decisions, ...milestone.completionEvidence])].filter(Boolean).join("\n"), 50000);
}

function projectUpdateResolvesRecordedDecision(decision: string, update: string) {
   const cleanDecision = cleanAuthoritativeStatement(decision, 1800).toLowerCase();
   const cleanUpdate = cleanAuthoritativeStatement(update, 16000).toLowerCase();
   if (!cleanDecision || !cleanUpdate) return false;

   const overlap = getProjectFactOverlapRatio(cleanDecision, cleanUpdate);
   if (overlap >= 0.45) return true;

   const rules: Array<[RegExp, RegExp, RegExp]> = [
      [/\b(?:electrical|power|outlet|circuit|amp)\b/i, /\b(?:electrical|power|outlet|circuit|amp|breaker)\b/i, /\b(?:reviewed|confirmed|verified|sufficient|not required|required|one high-draw tool|dedicated)\b/i],
      [/\b(?:ventilation|airflow)\b/i, /\b(?:ventilation|airflow|garage door|cross-ventilation|exhaust|fan)\b/i, /\b(?:will remain open|documented|selected|defined|during sanding|during finishing)\b/i],
      [/\b(?:dust|noise)\b/i, /\b(?:dust|noise|shop vacuum|vacuum|hearing protection|daytime|cleanup|source collection)\b/i, /\b(?:controlled|limited|required|connected|regular cleanup|daytime hours)\b/i],
      [/\b(?:finish|flammable|chemical|stored|storage)\b/i, /\b(?:finish|flammable|chemical|cabinet|stored|storage|spark|heat|outlet)\b/i, /\b(?:will be stored|approved closed cabinet|away from)\b/i],
      [/\b(?:workbench|mobile|movable|portable|permanent|tool stands|wall)\b/i, /\b(?:workbench|mobile|movable|portable|permanent|tool stands|wall|reset)\b/i, /\b(?:will|must|remain|selected|chosen|use)\b/i],
      [
         /\b(?:major tool|which tool|equipment)\b/i,
         /\b(?:major tool|table saw|miter saw|track saw|equipment|stationary machinery)\b/i,
         /\b(?:selected|chosen|not required|excluded|will use|decided not to purchase|will not purchase|deferred|leading future option|reconsider)\b/i,
      ],
   ];

   return rules.some(([decisionPattern, updateConcept, resolutionPattern]) => decisionPattern.test(cleanDecision) && updateConcept.test(cleanUpdate) && resolutionPattern.test(cleanUpdate));
}

function getSituationFacts(value?: string, limit = 3) {
   const clean = formatProjectSituationReadback(value);
   if (!clean) return [];
   return uniqueProjectFacts(
      clean
         .split(/(?<=[.!?])\s+/)
         .map((item) => cleanAuthoritativeStatement(item))
         .filter((item) => item.length >= 18),
      limit,
   );
}

function getRelevantMaterialsForMilestone(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return [];

   const understandingById = new Map(packet.projectUnderstanding.materials.map((material) => [material.id, material]));
   const candidates = packet.materials.map((sourceMaterial) => {
      const understandingMaterial = understandingById.get(sourceMaterial.id);
      const usefulContext = cleanAuthoritativeStatement([sourceMaterial.summary, sourceMaterial.details, understandingMaterial?.usefulContext].filter(Boolean).join(" "), 12000);
      const relatedMilestones = uniqueProjectFacts([...sourceMaterial.relevantBuildIds, ...(understandingMaterial?.relatedMilestones || [])], 12);
      const enrichedMaterial = {
         id: sourceMaterial.id,
         title: sourceMaterial.title,
         usefulContext,
         relatedMilestones,
         decisionsAffected: understandingMaterial?.decisionsAffected || [],
      };
      const criteria = getScopedMilestoneCompletionCriteria(milestone);
      const milestoneText = `${milestone.title} ${milestone.goal} ${milestone.startingPrompt} ${getScopedMilestoneOpenQuestions(milestone).join(" ")} ${criteria.join(" ")}`;
      const materialText = `${sourceMaterial.title} ${sourceMaterial.summary} ${sourceMaterial.details}`;
      const conceptCoverage = getMaterialMilestoneConceptCoverage(materialText, milestoneText);
      const criterionCoverage = criteria.filter((criterion) => criterionIsSupportedByMaterial(criterion, materialText)).length;
      const explicit = relatedMilestones.includes(milestone.id);
      const score = getMaterialMilestoneScore(sourceMaterial, milestone) + (explicit ? 1.5 : 0) + criterionCoverage * 1.2 + conceptCoverage * 0.45;

      return { material: enrichedMaterial, score, explicit, conceptCoverage, criterionCoverage };
   });

   const bestScore = candidates.reduce((best, candidate) => Math.max(best, candidate.score), 0);

   return candidates
      .filter((candidate) => candidate.explicit || candidate.criterionCoverage > 0 || candidate.conceptCoverage >= 2 || (candidate.score >= 2.2 && candidate.score >= bestScore - 0.8))
      .sort((left, right) => right.score - left.score)
      .map((candidate) => candidate.material)
      .slice(0, 6);
}

function getMilestoneEvidenceStatus(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) {
      return { supported: [] as string[], missing: [] as string[], materialTitles: [] as string[], evidenceFacts: [] as string[] };
   }

   const materials = getRelevantMaterialsForMilestone(packet, milestone);
   const projectCorpus = cleanAuthoritativeStatement([milestone.workingContent, ...milestone.decisions, ...milestone.completionEvidence].filter(Boolean).join(" "), 12000);
   const criteria = getScopedMilestoneCompletionCriteria(milestone);
   const supported = criteria.filter((criterion) => criterionIsSupportedByMaterial(criterion, projectCorpus) || materials.some((material) => criterionIsSupportedByMaterial(criterion, material.usefulContext)));
   const sourceMaterials = materials.map((material) => packet.materials.find((source) => source.id === material.id)).filter(Boolean) as ProjectMaterialSignal[];
   const evidenceFacts = uniqueProjectFacts(
      [...milestone.completionEvidence.map((item) => cleanAuthoritativeStatement(item)), ...milestone.decisions.map((item) => cleanAuthoritativeStatement(item)), ...sourceMaterials.flatMap((material) => getMaterialEvidenceStatements(material, 8))],
      16,
   );

   return {
      supported,
      missing: criteria.filter((criterion) => !supported.includes(criterion)),
      materialTitles: materials.map((material) => material.title),
      evidenceFacts,
   };
}

function getMilestoneCompletionChecks(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return [];

   const explicitCriteria = getScopedMilestoneCompletionCriteria(milestone).slice(0, 8);
   if (explicitCriteria.length) return explicitCriteria;

   const decisions = milestone.decisions.map((item) => `A decision is recorded for ${cleanAuthoritativeStatement(item).replace(/[.!?]+$/, "")}`);
   const answers = milestone.openQuestions.map((item) => `There is a supported answer to ${cleanAuthoritativeStatement(item).replace(/[.!?]+$/, "")}`);
   const materialChecks = getRelevantMaterialsForMilestone(packet, milestone).map((material) => `The relevant material “${material.title}” has been reviewed and its useful evidence is reflected in the milestone result`);

   return uniqueProjectFacts([...decisions, ...answers, ...materialChecks], 8);
}

function getPriorityProjectDecision(packet: ProjectIntelligencePacket, milestone = getAuthoritativeActiveMilestone(packet)) {
   const unresolved = getAuthoritativeUnresolvedDecisions(packet);
   if (!unresolved.length) return "";

   const milestoneQuestions = uniqueProjectFacts(
      [...(milestone?.openQuestions || []), ...(milestone?.decisions || [])].map((item) => cleanAuthoritativeStatement(item)),
      8,
   );
   for (const question of milestoneQuestions) {
      const exact = unresolved.find((decision) => getProjectFactOverlapRatio(decision, question) >= 0.62);
      if (exact) return exact;
   }

   const milestoneContext = `${milestone?.title || ""} ${milestone?.goal || ""} ${milestoneQuestions.join(" ")}`;
   const ranked = unresolved.map((decision, index) => ({ decision, index, score: getProjectFactOverlapRatio(decision, milestoneContext) })).sort((left, right) => right.score - left.score || left.index - right.index);

   return ranked[0]?.score >= 0.22 ? ranked[0].decision : unresolved[0];
}

function getMilestoneSubjectPhrase(value?: string) {
   return cleanAuthoritativeStatement(value)
      .replace(/[.!?]+$/, "")
      .replace(/^(?:finalize|define|clarify|decide|choose|select|establish|confirm|verify|validate|approve|identify|gather|assess|map|create|build|prepare|develop|produce|test|review|launch|publish|implement|complete|resolve|set)\s+/i, "")
      .trim();
}

function formatMilestoneAsGerund(value?: string) {
   const title = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   if (!title) return "";

   const replacements: Array<[RegExp, string]> = [
      [/^finalize\b/i, "finalizing"],
      [/^define\b/i, "defining"],
      [/^clarify\b/i, "clarifying"],
      [/^decide\b/i, "deciding"],
      [/^choose\b/i, "choosing"],
      [/^select\b/i, "selecting"],
      [/^establish\b/i, "establishing"],
      [/^confirm\b/i, "confirming"],
      [/^verify\b/i, "verifying"],
      [/^validate\b/i, "validating"],
      [/^identify\b/i, "identifying"],
      [/^gather\b/i, "gathering"],
      [/^assess\b/i, "assessing"],
      [/^map\b/i, "mapping"],
      [/^create\b/i, "creating"],
      [/^build\b/i, "building"],
      [/^prepare\b/i, "preparing"],
      [/^develop\b/i, "developing"],
      [/^produce\b/i, "producing"],
      [/^draft\b/i, "drafting"],
      [/^test\b/i, "testing"],
      [/^review\b/i, "reviewing"],
      [/^launch\b/i, "launching"],
      [/^publish\b/i, "publishing"],
      [/^implement\b/i, "implementing"],
      [/^complete\b/i, "completing"],
      [/^resolve\b/i, "resolving"],
      [/^set\b/i, "setting"],
   ];

   for (const [pattern, replacement] of replacements) {
      if (pattern.test(title)) return title.replace(pattern, replacement);
   }

   return `completing ${title.replace(/^./, (character) => character.toLowerCase())}`;
}

function formatMilestoneAsInfinitive(value?: string) {
   const title = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   if (!title) return "";
   return /^to\b/i.test(title) ? title : `to ${title.replace(/^./, (character) => character.toLowerCase())}`;
}

function buildDecisionImpactExplanation(value?: string) {
   const title = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   const searchable = title.toLowerCase();

   if (/\b(?:role|relationship|parent|ecosystem|family|portfolio|product|offering)\b/.test(searchable)) {
      return "It determines whether the parts are presented as peers, sub-brands, or offerings with different levels of emphasis.";
   }

   if (/\b(?:structure|hierarchy|editorial|layout|information architecture|outline)\b/.test(searchable)) {
      return "It determines the hierarchy, order, and amount of space each part receives.";
   }

   if (/\b(?:audience|user|customer|participant|stakeholder)\b/.test(searchable)) {
      return "It determines which needs, language, access rules, and experience choices the project should prioritize.";
   }

   if (/\b(?:format|workflow|process|capacity|production|operating model)\b/.test(searchable)) {
      return "It determines the time, tools, responsibilities, and quality controls the project can realistically support.";
   }

   if (/\b(?:research|source|evidence|fact|requirement|archive|interview)\b/.test(searchable)) {
      return "It determines which options have enough evidence to justify further time, money, or commitment.";
   }

   return ensureSentence(`It sets the standard the project will use when it reaches ${title.replace(/^./, (character) => character.toLowerCase())}`);
}

function formatMilestoneOpenStateFact(value?: string) {
   const title = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   const subject = getMilestoneSubjectPhrase(title);

   if (!title || !subject) return "";

   const capitalized = `${subject.charAt(0).toUpperCase()}${subject.slice(1)}`;

   if (/^finalize\b/i.test(title)) return `${capitalized} is not finalized yet`;
   if (/^(?:define|clarify|establish|map)\b/i.test(title)) return `${capitalized} is not clearly defined yet`;
   if (/^decide\b/i.test(title)) return `${capitalized} has not been decided yet`;
   if (/^(?:choose|select)\b/i.test(title)) return `${capitalized} has not been chosen yet`;
   if (/^(?:confirm|verify|validate|approve)\b/i.test(title)) return `${capitalized} is not confirmed yet`;
   if (/^(?:identify|gather|assess)\b/i.test(title)) return `The project still lacks a reliable understanding of ${subject.replace(/^./, (character) => character.toLowerCase())}`;
   if (/^(?:create|build|prepare|develop|produce|implement)\b/i.test(title)) return `${capitalized} has not been created yet`;
   if (/^(?:test|review)\b/i.test(title)) return `${capitalized} has not been validated yet`;

   return `${capitalized} is still unresolved`;
}

function milestoneTitleToDecisionQuestion(value?: string) {
   const title = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   if (!title) return "";

   const howMatch = title.match(/^(?:define|clarify|decide|determine|establish|map)\s+how\s+(.+)$/i);
   if (howMatch?.[1]) return `How should ${howMatch[1]}?`;

   const whetherMatch = title.match(/^(?:decide|determine|confirm|clarify)\s+whether\s+(.+)$/i);
   if (whetherMatch?.[1]) return `Should ${whetherMatch[1]}?`;

   const subject = getMilestoneSubjectPhrase(title);
   if (!subject) return "";

   if (/^(?:finalize|define|clarify|establish|map)\b/i.test(title)) return `What should ${subject} be?`;
   if (/^(?:decide|choose|select)\b/i.test(title)) return `Which option should the project choose for ${subject.replace(/^./, (character) => character.toLowerCase())}?`;
   if (/^(?:confirm|verify|validate|approve)\b/i.test(title)) return `What evidence is needed to confirm ${subject.replace(/^./, (character) => character.toLowerCase())}?`;

   return `What decision will complete ${title.replace(/^./, (character) => character.toLowerCase())}?`;
}

function isWeakMilestoneRationale(value?: string, milestoneTitle?: string, milestones: Array<{ title: string }> = []) {
   const clean = cleanAuthoritativeStatement(value, 2400);
   if (!clean) return true;

   if (/^(?:this checkpoint|this decision|this step|this is the first (?:project )?checkpoint|this is the earliest unfinished|this is the clearest unresolved|the later plan depends|before launch, i need to|i need to)\b/i.test(clean)) {
      return true;
   }

   if (
      /(?:produces information or decisions|work after it depends on|gives the next milestone a dependable starting point|sets the boundary for the work that follows|prevents later milestones from moving in conflicting directions|should reduce uncertainty for the work that follows)/i.test(
         clean,
      )
   ) {
      return true;
   }

   const actionVerbCount = (clean.match(/\b(?:finalize|define|decide|build|create|test|prepare|deploy|launch|select|confirm|review|publish|implement)\b/gi) || []).length;
   const milestoneMatches = milestones.filter((milestone) => milestone.title && getProjectFactOverlapRatio(clean, milestone.title) >= 0.34).length;

   if (clean.length > 220 && (actionVerbCount >= 3 || milestoneMatches >= 3)) {
      return true;
   }

   if (milestoneTitle && getProjectFactOverlapRatio(clean, milestoneTitle) < 0.08 && clean.length > 260) {
      return true;
   }

   return false;
}

function buildMilestoneRelationshipRationale(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number], next?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return "";

   const milestones = getAuthoritativeMilestones(packet);
   const currentTitle = cleanAuthoritativeStatement(milestone.title).replace(/[.!?]+$/, "");
   const nextTitle = cleanAuthoritativeStatement(next?.title).replace(/[.!?]+$/, "");
   const currentSubject = getMilestoneSubjectPhrase(currentTitle);
   const nextSubject = getMilestoneSubjectPhrase(nextTitle);
   const searchable = `${currentTitle} ${currentSubject}`.toLowerCase();
   const nextSearchable = `${nextTitle} ${nextSubject}`.toLowerCase();

   // When the milestone relationship itself carries more meaning than a short
   // saved purpose line, prefer the dependency-specific explanation. This keeps
   // strategic follow-ups grounded in what the current decision changes next.
   if (/\b(?:brand|positioning|promise|message|language|tone|identity)\b/.test(searchable) && /\b(?:product|offering|role|relationship|parent|ecosystem|family|portfolio)\b/.test(nextSearchable)) {
      return "The company promise needs to be clear before the project can define how its products relate to the parent brand. Otherwise, each product may sound strong on its own without explaining why the group belongs together.";
   }

   if (/\b(?:role|relationship|parent|ecosystem|family|portfolio|parts relate)\b/.test(searchable) && /\b(?:structure|hierarchy|editorial|layout|information architecture|page)\b/.test(nextSearchable)) {
      return "The project needs a clear model for how its parts relate before it can decide the content hierarchy. Otherwise, the page structure may imply the wrong level of importance or independence and create avoidable copy and layout rework.";
   }

   const stored = cleanAuthoritativeStatement(milestone.whyItMatters || milestone.purpose);
   if (!isWeakMilestoneRationale(stored, milestone.title, milestones)) {
      return ensureSentence(stored);
   }

   if (/\b(?:brand|positioning|promise|message|language|tone|identity)\b/.test(searchable)) {
      if (/\b(?:product|offering|role|relationship|parent|ecosystem|family|portfolio)\b/.test(nextSearchable)) {
         return "The company promise needs to be clear before the project can define how its products relate to the parent brand. Otherwise, each product may sound strong on its own without explaining why the group belongs together.";
      }

      return "The brand language sets the standard for the copy, hierarchy, and visual direction that follow. Settling a usable version now prevents later work from being polished around an unclear company promise.";
   }

   if (/\b(?:role|relationship|parent|ecosystem|family|portfolio|parts relate)\b/.test(searchable)) {
      if (/\b(?:structure|hierarchy|editorial|layout|information architecture|page)\b/.test(nextSearchable)) {
         return "The project needs a clear model for how its parts relate before it can decide the content hierarchy. Otherwise, the page structure may imply the wrong level of importance or independence and create avoidable copy and layout rework.";
      }

      return "Clarifying the relationship among the project’s parts gives later messaging, ownership, and hierarchy decisions a consistent model to follow.";
   }

   if (/\b(?:structure|hierarchy|editorial|layout|information architecture|outline)\b/.test(searchable)) {
      return "The content hierarchy needs to be settled before build and copy work can be implemented confidently. Otherwise, later work may be organized around a structure that changes after substantial effort has already been spent.";
   }

   if (/\b(?:audience|user|customer|participant|stakeholder)\b/.test(searchable)) {
      return "The project needs a clear primary audience because scope, content, access, tone, and workflow choices all depend on who the finished result must serve.";
   }

   if (/\b(?:research|source|evidence|fact|requirement|archive|interview|discovery)\b/.test(searchable)) {
      return "The project needs reliable evidence before it can make downstream selections or commitments. This step separates viable directions from attractive ideas that are not yet supported.";
   }

   if (/\b(?:legal|permit|policy|compliance|privacy|permission|rights|access|security)\b/.test(searchable)) {
      return "The operating rules need to be clear before the project commits to tools, content, equipment, or implementation choices that may not be usable or approvable.";
   }

   if (/\b(?:format|workflow|process|capacity|production|operating model|service flow)\b/.test(searchable)) {
      return "The operating model determines the time, tools, staffing, and quality controls the project can realistically support. Settling it first keeps the later plan grounded in actual capacity.";
   }

   if (/\b(?:budget|pricing|cost|viability|margin|resources)\b/.test(searchable)) {
      return "The project needs a realistic cost and capacity boundary before it commits to equipment, scope, or delivery choices that may not be sustainable.";
   }

   if (nextTitle) {
      return ensureSentence(
         `A working decision on ${currentSubject.replace(/^./, (character) => character.toLowerCase())} gives ${nextSubject.replace(/^./, (character) => character.toLowerCase())} a concrete standard instead of forcing the later milestone to rely on assumptions`,
      );
   }

   return ensureSentence(`Completing ${currentTitle.replace(/^./, (character) => character.toLowerCase())} will close the project’s most immediate dependency and make the remaining work easier to judge`);
}

function buildMilestoneDependencyRisk(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number], next?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return "";

   const current = `${milestone.title} ${getMilestoneSubjectPhrase(milestone.title)}`.toLowerCase();
   const nextText = `${next?.title || ""} ${getMilestoneSubjectPhrase(next?.title)}`.toLowerCase();

   if (/\b(?:brand|positioning|promise|message|language|identity)\b/.test(current)) {
      if (/\b(?:product|offering|role|relationship|parent|ecosystem|family)\b/.test(nextText)) {
         return "The main risk is producing strong individual product stories without a convincing reason they belong under the same company.";
      }
      return "The main risk is polishing copy and design around a company promise that is still too broad, too narrow, or inconsistent with the work it represents.";
   }

   if (/\b(?:role|relationship|parent|ecosystem|family|portfolio)\b/.test(current)) {
      return "The main risk is choosing a hierarchy that implies the wrong relationship among the project’s parts, forcing later copy and layout work to be reorganized.";
   }

   if (/\b(?:structure|hierarchy|editorial|layout|information architecture)\b/.test(current)) {
      return "The main risk is beginning implementation before the information hierarchy is stable, creating avoidable redesign and rewrite work.";
   }

   if (/\b(?:audience|user|customer|participant|stakeholder)\b/.test(current)) {
      return "The main risk is making scope and experience decisions for an assumed audience rather than the people the finished result actually needs to serve.";
   }

   if (/\b(?:research|source|evidence|fact|requirement|archive|interview)\b/.test(current)) {
      return "The main risk is allowing weak evidence or unavailable inputs to shape downstream commitments that later have to be reversed.";
   }

   if (next?.title) {
      return ensureSentence(
         `The main risk is starting ${next.title.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} while ${getMilestoneSubjectPhrase(milestone.title).replace(/^./, (character) => character.toLowerCase())} is still unsettled`,
      );
   }

   return "The main risk is treating the current direction as settled without enough evidence to support the decisions that follow.";
}

function isDependencyLikeStatement(value?: string) {
   const clean = cleanAuthoritativeStatement(value);
   if (!clean) return false;

   return (
      /\b(?:before|after|first|then|once|until|depends? on|prerequisite|sequence|order of work|must happen before|needs to happen before)\b/i.test(clean) ||
      /^(?:define|decide|finalize|confirm|establish|clarify|select|choose|complete|build|create|test|review|prepare)\b/i.test(clean)
   );
}

function formatFactSeries(values: string[]) {
   return values
      .map((value) => cleanAuthoritativeStatement(value).replace(/[.!?]+$/, ""))
      .filter(Boolean)
      .map((value) => ensureSentence(value))
      .join(" ");
}

function getAuthoritativeDependencyStatements(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const explicit = understanding.dependencies
      .filter((dependency) => dependency.state !== "satisfied")
      .map((dependency) => {
         const before = cleanAuthoritativeStatement(dependency.before).replace(/[.!?]+$/, "");
         const after = cleanAuthoritativeStatement(dependency.after).replace(/[.!?]+$/, "");
         if (!before || !after) return "";
         return `${formatMilestoneAsGerund(before).replace(/^./, (character) => character.toUpperCase())} comes before ${formatMilestoneAsGerund(after)}`;
      })
      .filter(Boolean);

   if (explicit.length) {
      return uniqueProjectFacts(explicit, 4);
   }

   const inferred = understanding.constraints.map((constraint) => cleanAuthoritativeStatement(constraint.statement)).filter(isDependencyLikeStatement);

   return uniqueProjectFacts(inferred, 4);
}

function getAuthoritativeConstraints(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const milestoneTitles = understanding.milestones.map((milestone) => milestone.title);

   return uniqueProjectFacts(
      understanding.constraints
         .map((constraint) => cleanAuthoritativeStatement(constraint.statement))
         .filter((statement) => !isEmptyProjectValue(statement))
         .filter((statement) => !isDependencyLikeStatement(statement))
         .filter((statement) => !milestoneTitles.some((title) => getProjectFactOverlapRatio(statement, title) >= 0.72))
         .filter((statement) => /\b(?:must|cannot|can't|should not|shouldn't|avoid|under|within|at most|no more than|without|accessible|privacy|deadline|budget|limit|constraint|required|only|not exceed|remain)\b/i.test(statement)),
      6,
   );
}

function milestoneQuestionToAction(question: string) {
   const clean = cleanAuthoritativeStatement(question).replace(/[.!?]+$/, "");
   if (!clean) return "";

   let match = clean.match(/^How can (.+?) be (.+)$/i);
   if (match) return `Define how ${match[1]} will be ${match[2]}`;
   match = clean.match(/^How should (.+?) work$/i);
   if (match) return `Define how ${match[1]} should work`;
   match = clean.match(/^Is (.+?) sufficient$/i);
   if (match) return `Confirm whether ${match[1]} is sufficient`;
   match = clean.match(/^Where can (.+?) be (.+)$/i);
   if (match) return `Choose and record where ${match[1]} can be ${match[2]}`;
   match = clean.match(/^Should (.+)$/i);
   if (match) return `Decide whether ${match[1]}`;
   match = clean.match(/^Which (.+)$/i);
   if (match) return `Choose ${match[1]}`;

   return `Answer and record: ${clean}`;
}

function milestoneCriterionToAction(value?: string) {
   const clean = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   if (!clean) return "";

   const supportedAnswerMatch = clean.match(/^A supported answer is recorded for:\s*(.+)$/i);
   if (supportedAnswerMatch) return milestoneQuestionToAction(supportedAnswerMatch[1]);

   return clean
      .replace(/^The current lighting has been assessed and any required improvement is identified$/i, "Assess the current lighting and identify any required improvement")
      .replace(/^The (.+?) has been assessed and any (.+?) is identified$/i, "Assess $1 and identify any $2")
      .replace(/^The\s+(.+?)\s+(?:are|is)\s+named$/i, "Name $1")
      .replace(/^The\s+(.+?)\s+(?:are|is)\s+listed$/i, "List $1")
      .replace(/^The\s+(.+?)\s+(?:are|is)\s+recorded$/i, "Record $1")
      .replace(/^The\s+(.+?)\s+(?:are|is)\s+documented$/i, "Document $1")
      .replace(/^The\s+(.+?)\s+(?:are|is)\s+identified$/i, "Identify $1")
      .replace(/^The\s+(.+?)\s+(?:have|has)\s+been\s+checked/i, "Check $1")
      .replace(/^The\s+(.+?)\s+(?:have|has)\s+been\s+assessed/i, "Assess $1")
      .replace(/^Any\s+(.+?)\s+(?:are|is)\s+clear$/i, "Document $1")
      .replace(/^A working option has been selected$/i, "Select the strongest working option")
      .replace(/^Required changes are separated from optional upgrades$/i, "Separate required changes from optional upgrades")
      .replace(/^Known issues and deferred work are recorded$/i, "Record known issues and deferred work")
      .replace(/^./, (character) => character.toUpperCase());
}

function materialVerificationStatementToAction(value?: string) {
   const clean = cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "");
   if (!clean) return "";

   let match = clean.match(/^(.+?)\s+should\s+confirm\s+whether\s+(.+)$/i);
   if (match) return `Have ${match[1].replace(/^./, (character) => character.toLowerCase())} confirm whether ${match[2]}`;
   match = clean.match(/^(.+?)\s+(?:should|must|needs? to)\s+(?:be\s+)?(checked|confirmed|verified|assessed|reviewed)(?:\s+(.+))?$/i);
   if (match) return `${match[2].replace(/^./, (character) => character.toUpperCase())} ${match[1].replace(/^./, (character) => character.toLowerCase())}${match[3] ? ` ${match[3]}` : ""}`;
   match = clean.match(/^(.+?)\s+(?:should|must|needs? to)\s+(confirm|verify|check|assess|review)\s+(.+)$/i);
   if (match) return `Have ${match[1].replace(/^./, (character) => character.toLowerCase())} ${match[2].toLowerCase()} ${match[3]}`;

   return "";
}

function getMilestoneActionConcepts(value?: string) {
   const clean = cleanAuthoritativeStatement(value).toLowerCase();
   const concepts: string[] = [];
   const groups: Array<[string, RegExp]> = [
      ["electrical", /\b(?:electrical|power|outlet|circuit|amp|breaker|voltage)\b/i],
      ["lighting", /\b(?:lighting|light|illumination|dark)\b/i],
      ["ventilation", /\b(?:ventilation|airflow|exhaust|cross-ventilation|fan)\b/i],
      ["dust-noise", /\b(?:dust|noise|vacuum|collector|hearing|sound)\b/i],
      ["safety-storage", /\b(?:safety|risk|flammable|finish|storage|cabinet|spark|heat|fire)\b/i],
      ["layout", /\b(?:layout|zone|workspace|workbench|access|mobile|movable|portable|reset)\b/i],
      ["budget", /\b(?:budget|cost|price|spend|optional upgrade|required change)\b/i],
      ["tools", /\b(?:tool|equipment|saw|machine|hardware)\b/i],
   ];
   groups.forEach(([name, pattern]) => {
      if (pattern.test(clean)) concepts.push(name);
   });
   return concepts;
}

function areMilestoneActionsDuplicate(left?: string, right?: string) {
   const a = cleanAuthoritativeStatement(left);
   const b = cleanAuthoritativeStatement(right);
   if (!a || !b) return false;
   if (getProjectFactOverlapRatio(a, b) >= 0.52) return true;

   const leftConcepts = getMilestoneActionConcepts(a);
   const rightConcepts = getMilestoneActionConcepts(b);
   const sharedConcepts = leftConcepts.filter((concept) => rightConcepts.includes(concept));
   const bothVerificationActions = /\b(?:confirm|check|verify|assess)\b/i.test(a) && /\b(?:confirm|check|verify|assess)\b/i.test(b);

   return sharedConcepts.length > 0 && bothVerificationActions;
}

function dedupeMilestoneActions(values: string[], limit = 3) {
   const kept: string[] = [];
   values
      .map((value) => cleanAuthoritativeStatement(value))
      .filter(Boolean)
      .forEach((value) => {
         if (kept.length >= limit) return;
         if (kept.some((existing) => areMilestoneActionsDuplicate(existing, value))) return;
         kept.push(value);
      });
   return kept;
}

function getProjectEvidenceCorpus(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   return cleanAuthoritativeStatement(
      [
         ...understanding.confirmedDecisions.map((decision) => decision.statement),
         ...understanding.completedWork,
         ...understanding.milestones.flatMap((milestone) => [milestone.workingContent, ...milestone.decisions, ...milestone.completionEvidence]),
         ...understanding.constraints.map((constraint) => constraint.statement),
      ]
         .filter(Boolean)
         .join(" "),
      50000,
   );
}

function verificationActionAlreadyResolved(action: string, corpus: string) {
   const cleanAction = cleanAuthoritativeStatement(action);
   const cleanCorpus = cleanAuthoritativeStatement(corpus, 50000);
   if (!cleanAction || !cleanCorpus) return false;

   const concepts = getMilestoneActionConcepts(cleanAction);
   if (!concepts.length) return false;

   const resolutionPattern = /\b(?:reviewed|confirmed|verified|determined|sufficient|not required|required|approved|selected|decided|will use|will add|will remain|will be stored|will be controlled|will be limited)\b/i;
   return cleanCorpus
      .split(/(?<=[.!?])\s+|\n+/)
      .map((statement) => cleanAuthoritativeStatement(statement, 2000))
      .filter((statement) => resolutionPattern.test(statement))
      .some((statement) => {
         const statementConcepts = getMilestoneActionConcepts(statement);
         const shared = concepts.filter((concept) => statementConcepts.includes(concept));
         return shared.length > 0 && (getProjectFactOverlapRatio(cleanAction, statement) >= 0.16 || shared.length >= 1);
      });
}

function formatNaturalActionSeries(values: string[]) {
   const clean = values.map((value) => cleanAuthoritativeStatement(value).replace(/[.!?]+$/, "")).filter(Boolean);
   if (!clean.length) return "";
   if (clean.length === 1) return clean[0];
   if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
   return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function getPhysicalLayoutMilestoneActions(packet: ProjectIntelligencePacket) {
   const corpus = getProjectEvidenceCorpus(packet).toLowerCase();
   const operations = [
      /\b(?:straight cuts?|crosscuts?|cutting|sawing)\b/i.test(corpus) ? "cutting" : "",
      /\b(?:drilling|drill)\b/i.test(corpus) ? "drilling" : "",
      /\b(?:sanding|sand)\b/i.test(corpus) ? "sanding" : "",
      /\b(?:assembly|assembling|assemble)\b/i.test(corpus) ? "assembly" : "",
      /\b(?:finishing|finish)\b/i.test(corpus) ? "finishing" : "",
   ].filter(Boolean);
   const controls = [
      /\b(?:task lighting|bright led|lighting)\b/i.test(corpus) ? "task lighting" : "",
      /\b(?:shop vacuum|shop vac|source collection|dust control)\b/i.test(corpus) ? "shop-vac or source-collection access" : "",
      /\b(?:garage door|airflow|ventilation|cross-ventilation)\b/i.test(corpus) ? "the airflow path" : "",
      /\b(?:flammable|chemical|finish storage|approved closed cabinet)\b/i.test(corpus) ? "safe finish and chemical storage" : "",
      /\b(?:15-amp|circuit|outlet)\b/i.test(corpus) ? "accessible outlets and the confirmed circuit limit" : "",
   ].filter(Boolean);
   const sharedUses = [
      /\bbicycle\b/i.test(corpus) ? "bicycle access" : "",
      /\b(?:storage bins|household items|household storage)\b/i.test(corpus) ? "household storage" : "",
      /\b(?:larger items|large items|move through|clear enough space)\b/i.test(corpus) ? "large-item movement" : "",
      /\b(?:movable|mobile|portable|easy to reset|reset)\b/i.test(corpus) ? "easy reset" : "",
   ].filter(Boolean);

   const operationPhrase = operations.length ? formatNaturalActionSeries(operations) : "the planned work";
   const controlPhrase = controls.length ? formatNaturalActionSeries(controls) : "the required safety and infrastructure controls";
   const sharedUsePhrase = sharedUses.length ? formatNaturalActionSeries(sharedUses) : "the space’s other uses and access requirements";

   return [`Sketch the work, storage, and access zones, with enough clear space for ${operationPhrase}`, `Mark ${controlPhrase} directly on the layout`, `Test the layout against ${sharedUsePhrase}`];
}

function getMaterialCarryoverImplications(packet: ProjectIntelligencePacket, material: ProjectMaterialSignal | undefined, milestone: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number] | undefined) {
   if (!material || !milestone) return [] as string[];

   const materialText = cleanAuthoritativeStatement(`${material.title} ${material.summary} ${material.details}`, 16000).toLowerCase();
   const projectCorpus = getProjectEvidenceCorpus(packet).toLowerCase();
   const category = getMilestoneGuidanceCategory(milestone.title);

   if (category === "layout") {
      return uniqueProjectFacts(
         [
            /\b(?:outlet|circuit|amp|electrical|power)\b/i.test(materialText)
               ? /\bone high-draw tool\b/i.test(projectCorpus)
                  ? "Powered-tool placement needs accessible outlets while preserving the confirmed one-high-draw-tool-at-a-time limit"
                  : "Powered-tool placement needs to preserve safe, accessible outlet and circuit use"
               : "",
            /\b(?:lighting|light|dark)\b/i.test(materialText) ? "The main work zone needs a clear location for the planned task lighting" : "",
            /\b(?:dust|shop vacuum|vacuum|source collection)\b/i.test(materialText) ? "Cutting and sanding areas need practical shop-vac connections and cleanup access" : "",
            /\b(?:garage door|airflow|ventilation|cross-ventilation)\b/i.test(materialText) ? "Sanding and finishing need to stay where the garage-door airflow path can work" : "",
            /\b(?:flammable|finish|chemical|cabinet|spark|heat)\b/i.test(materialText) ? "The layout needs a reserved finish-storage location away from outlets, sparks, and heat" : "",
         ],
         8,
      );
   }

   const milestoneText = `${milestone.title} ${milestone.goal} ${milestone.startingPrompt} ${getScopedMilestoneCompletionCriteria(milestone).join(" ")}`;
   const facts = getMaterialEvidenceStatements(material, 10);
   const relevant = facts.filter((fact) => getMaterialMilestoneConceptCoverage(fact, milestoneText) > 0 || getProjectFactOverlapRatio(fact, milestoneText) >= 0.16);
   return uniqueProjectFacts(relevant.length ? relevant : facts, 6);
}

function getMilestoneInputFactScore(fact: string, category: string) {
   const clean = cleanAuthoritativeStatement(fact, 2400).toLowerCase();
   if (!clean) return -100;

   let score = 0;
   if (/\$\s?\d|\b(?:budget|cost|spend|price|afford|at or below|under|no more than|maximum)\b/i.test(clean)) score += 12;
   if (/\b(?:already own|already have|existing|available|on hand)\b/i.test(clean)) score += 9;
   if (/\b(?:required|must|will add|will use|will keep|will remain|will be stored|confirmed|sufficient)\b/i.test(clean)) score += 8;
   if (/\b(?:optional|not required|defer|deferred|future upgrade|reconsidered later|will not|no permanent)\b/i.test(clean)) score += 8;
   if (/\b(?:lighting|dust|vacuum|chemical|cabinet|safety|workbench|mobile|folding|storage|access|circuit|tool|equipment|machinery)\b/i.test(clean)) score += 5;
   if (factMatchesGuidanceCategory(clean, category)) score += 4;
   if (/\b(?:goal|success means|main goal)\b/i.test(clean)) score -= 5;
   return score;
}

function factCanShapeMilestoneInput(fact: string, category: string) {
   const clean = cleanAuthoritativeStatement(fact, 2400);
   if (!clean) return false;

   if (category === "budget") {
      return /\$\s?\d|\b(?:budget|cost|spend|price|afford|at or below|under|no more than|maximum|already own|already have|existing|available|on hand|required|optional|not required|defer|deferred|future upgrade|reconsidered|lighting|dust|vacuum|chemical|cabinet|safety|workbench|mobile|folding|storage|access|circuit|tool|equipment|machinery|phase[- ]one)\b/i.test(
         clean,
      );
   }

   if (category === "selection") {
      return /\b(?:requirement|must|need|budget|cost|space|access|mobile|portable|power|electrical|safety|operation|capability|tool|equipment|option|excluded|deferred)\b/i.test(clean);
   }

   if (category === "layout") {
      return factMatchesGuidanceCategory(clean, "layout") || /\b(?:power|lighting|dust|vacuum|airflow|finish|chemical|storage|access|mobile|reset)\b/i.test(clean);
   }

   if (category === "execution") {
      return /\b(?:required|purchase|buy|acquire|install|mount|assemble|build|organize|place|connect|configure|test|verify|lighting|dust|vacuum|chemical|cabinet|safety|ppe|work surface|workbench|cart|storage|supplies|layout|access|reset|deferred)\b/i.test(
         clean,
      );
   }

   return factMatchesGuidanceCategory(clean, category) || getMilestoneGuidanceCategory(clean) === category;
}

function splitMilestoneInputFact(value?: string) {
   const clean = cleanAuthoritativeStatement(value, 4000);
   if (!clean) return [] as string[];

   return clean
      .split(/(?<=[.!?])\s+|\n+|\s+(?=(?:The|This|These|Those|It)\s+[^.!?]{0,220}\b(?:has|have|had)\s+not\s+been\s+(?:finalized|confirmed|decided|selected|verified)\b)/)
      .map((item) => cleanAuthoritativeStatement(item, 2200))
      .filter(Boolean);
}

function isUnresolvedMilestoneInputFact(value?: string) {
   const clean = cleanAuthoritativeStatement(value, 2400);
   if (!clean) return true;

   return /\b(?:has|have|had)\s+not\s+been\s+(?:finalized|confirmed|decided|selected|verified)\b|\b(?:still|remains?)\s+(?:open|unknown|unresolved|unconfirmed)\b|\b(?:should|must|needs? to)\s+(?:be\s+)?(?:confirm|confirmed|verify|verified|decide|decided|determine|determined)\b|\bshould\s+confirm\s+whether\b/i.test(
      clean,
   );
}

function getMilestoneInputTopics(value?: string) {
   const clean = cleanAuthoritativeStatement(value, 3000).toLowerCase();
   if (!clean) return [] as string[];

   return [
      /\$\s?\d|\b(?:budget|cost|spend|price|afford|at or below|under|maximum)\b/i.test(clean) ? "budget" : "",
      /\b(?:already own|already have|existing tools?|available equipment|on hand)\b/i.test(clean) ? "assets" : "",
      /\b(?:electrical|power|outlet|circuit|amp|breaker|high-draw)\b/i.test(clean) ? "electrical" : "",
      /\b(?:lighting|light|dark areas?|led)\b/i.test(clean) ? "lighting" : "",
      /\b(?:dust|shop vacuum|shop-vac|source collection|cleanup)\b/i.test(clean) ? "dust" : "",
      /\b(?:ventilation|airflow|garage door|cross-ventilation|exhaust fan)\b/i.test(clean) ? "ventilation" : "",
      /\b(?:flammable|finish|chemical|approved closed cabinet|safe storage)\b/i.test(clean) ? "chemical-storage" : "",
      /\b(?:noise|hearing protection|daytime hours)\b/i.test(clean) ? "noise" : "",
      /\b(?:mobile|folding|portable|reset|workbench|work surface|assembly top|tool storage|cart)\b/i.test(clean) ? "mobility" : "",
      /\b(?:stationary machinery|table saw|miter saw|track saw|major tool|equipment)\b/i.test(clean) ? "equipment" : "",
      /\b(?:optional|not required|defer|deferred|future upgrade|reconsidered later)\b/i.test(clean) ? "deferred" : "",
      /\b(?:required|must|will add|will use|will keep|will remain|will be stored)\b/i.test(clean) ? "required" : "",
   ].filter(Boolean);
}

function isBroadMilestoneInputSummary(value?: string) {
   const clean = cleanAuthoritativeStatement(value, 3200);
   const topics = getMilestoneInputTopics(clean);
   return clean.length >= 135 && topics.length >= 4 && /\b(?:confirmed|required|documented|defined|separated|immediate needs|optional upgrades)\b/i.test(clean);
}

interface MilestoneInputCandidate {
   fact: string;
   sourceRank: number;
   index: number;
   score: number;
   topics: string[];
}

function reconcileMilestoneInputCandidates(candidates: Array<{ fact: string; sourceRank: number; index: number }>, category: string, limit: number) {
   const expanded: MilestoneInputCandidate[] = candidates
      .flatMap((candidate) =>
         splitMilestoneInputFact(candidate.fact).map((fact, splitIndex) => ({
            fact,
            sourceRank: candidate.sourceRank,
            index: candidate.index * 10 + splitIndex,
            score: getMilestoneInputFactScore(fact, category),
            topics: getMilestoneInputTopics(fact),
         })),
      )
      .filter((candidate) => factCanShapeMilestoneInput(candidate.fact, category))
      .filter((candidate) => !isUnresolvedMilestoneInputFact(candidate.fact))
      .filter((candidate) => !/^(?:they|these|those)\b/i.test(candidate.fact));

   const withoutSummaries = expanded.filter((candidate) => {
      if (!isBroadMilestoneInputSummary(candidate.fact)) return true;

      const narrowerCoverage = new Set<string>();
      for (const other of expanded) {
         if (other === candidate || isBroadMilestoneInputSummary(other.fact)) continue;
         if (other.sourceRank < candidate.sourceRank - 8) continue;
         for (const topic of other.topics) {
            if (candidate.topics.includes(topic)) narrowerCoverage.add(topic);
         }
      }

      return narrowerCoverage.size < Math.min(3, candidate.topics.length);
   });

   const topicPriority = (candidate: MilestoneInputCandidate) => {
      if (category !== "budget") return 0;
      if (candidate.topics.includes("budget")) return 40;
      if (candidate.topics.includes("assets")) return 34;
      if (candidate.topics.includes("required")) return 28;
      if (candidate.topics.includes("deferred")) return 24;
      if (candidate.topics.includes("electrical")) return 20;
      if (candidate.topics.includes("mobility")) return 16;
      return 0;
   };

   return withoutSummaries
      .sort((left, right) => topicPriority(right) - topicPriority(left) || right.sourceRank - left.sourceRank || right.score - left.score || left.index - right.index)
      .map((candidate) => candidate.fact)
      .filter((fact, index, all) => !all.slice(0, index).some((earlier) => getProjectFactOverlapRatio(fact, earlier) >= 0.72))
      .slice(0, limit);
}

function getEarlierDecisionInputsForMilestone(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number], limit = 10) {
   if (!milestone) return [] as string[];
   const category = getMilestoneGuidanceCategory(milestone.title);
   const earlierMilestones = getAuthoritativeMilestones(packet)
      .filter((item) => item.order < milestone.order)
      .sort((left, right) => left.order - right.order);

   const candidates: Array<{ fact: string; sourceRank: number; index: number }> = [];
   let index = 0;
   const add = (facts: string[], sourceRank: number) => {
      for (const fact of facts) candidates.push({ fact, sourceRank, index: index++ });
   };

   add(getAuthoritativeConfirmedDecisions(packet), 50);
   add(getSituationFacts(packet.projectUnderstanding.situation, 12), 20);
   add(getAuthoritativeConstraints(packet), 38);
   for (const earlierMilestone of earlierMilestones) {
      add(getRecordedMilestoneDecisionFacts(earlierMilestone, 28), 60 + earlierMilestone.order);
   }

   return reconcileMilestoneInputCandidates(candidates, category, limit);
}

function materialFindingHasBeenSuperseded(finding: string, resolutionCorpus: string) {
   if (!isUnresolvedMilestoneInputFact(finding)) return false;
   return projectUpdateResolvesRecordedDecision(finding, resolutionCorpus);
}

function getMaterialInputFindingsForMilestone(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number], limit = 6) {
   if (!milestone) return [] as string[];
   const category = getMilestoneGuidanceCategory(milestone.title);
   const resolutionCorpus = getRecordedProjectResolutionCorpus(packet);
   const findings = packet.materials.flatMap((material) =>
      getMaterialEvidenceStatements(material, 10).map((fact) => {
         const normalizedTitle = normalizePrompt(material.title);
         const cleanFact = cleanAuthoritativeStatement(fact, 2200);
         const factWithoutRepeatedTitle = normalizePrompt(cleanFact).startsWith(normalizedTitle)
            ? cleanFact
                 .slice(material.title.length)
                 .replace(/^\s*(?:reference)?\s*:\s*/i, "")
                 .trim()
            : cleanFact;
         const normalizedFact = factWithoutRepeatedTitle || cleanFact;

         return {
            fact: normalizedFact,
            title: material.title,
            score: getMilestoneInputFactScore(normalizedFact, category) + (factCanShapeMilestoneInput(normalizedFact, category) ? 5 : 0),
         };
      }),
   );

   return findings
      .filter((item) => factCanShapeMilestoneInput(item.fact, category))
      .filter((item) => !materialFindingHasBeenSuperseded(item.fact, resolutionCorpus))
      .sort((left, right) => right.score - left.score)
      .map((item) => `${item.title}: ${item.fact}`)
      .filter((fact, index, all) => !all.slice(0, index).some((earlier) => getProjectFactOverlapRatio(fact, earlier) >= 0.72))
      .slice(0, limit);
}

function formatMaterialInputFindings(findings: string[]) {
   const grouped = new Map<string, string[]>();

   for (const finding of findings) {
      const separator = finding.indexOf(":");
      const title = separator >= 0 ? finding.slice(0, separator).trim() : "Project materials";
      const fact = separator >= 0 ? finding.slice(separator + 1).trim() : finding;
      if (!fact) continue;
      grouped.set(title, [...(grouped.get(title) || []), fact]);
   }

   return [...grouped.entries()]
      .map(([title, facts]) => {
         const compactFacts = uniqueProjectFacts(facts, 6)
            .map((fact) => fact.replace(/[.!?]+$/, ""))
            .filter(Boolean)
            .map((fact) => fact.replace(/^./, (character) => character.toLowerCase()));
         if (!compactFacts.length) return "";
         return `${title} supports those priorities by documenting ${formatNaturalActionSeries(compactFacts)}.`;
      })
      .filter(Boolean)
      .join("\n");
}

function getRecordedBudgetBoundary(packet: ProjectIntelligencePacket) {
   const corpus = getProjectEvidenceCorpus(packet);
   const contextual = corpus.match(/\b(?:budget(?:\s+(?:is|of|will stay at or below))?|under|below|at or below|no more than|maximum(?:\s+of)?|up to)\s*(\$\s?[\d,]+(?:\.\d{1,2})?)/i);
   if (contextual?.[1]) return contextual[1].replace(/\s+/g, "");
   const anyAmount = corpus.match(/\$\s?[\d,]+(?:\.\d{1,2})?/);
   return anyAmount ? anyAmount[0].replace(/\s+/g, "") : "the recorded budget limit";
}

function getBudgetSpendingCategories(packet: ProjectIntelligencePacket) {
   const corpus = getProjectEvidenceCorpus(packet).toLowerCase();
   return [
      /\b(?:task lighting|led lighting|lighting)\b/i.test(corpus) ? "task lighting" : "",
      /\b(?:source dust collection|shop vacuum|dust control|dust-control)\b/i.test(corpus) ? "dust-control accessories and cleanup supplies" : "",
      /\b(?:approved closed cabinet|chemical storage|finish storage|flammable)\b/i.test(corpus) ? "safe finish and chemical storage" : "",
      /\b(?:mobile|folding|portable)\b/i.test(corpus) && /\b(?:workbench|work surface|assembly top|tool storage|cart)\b/i.test(corpus) ? "mobile or folding work surfaces and storage" : "",
      /\b(?:hearing protection|eye protection|respirator|safety equipment|ppe)\b/i.test(corpus) ? "safety equipment" : "",
   ].filter(Boolean);
}

function getBudgetMilestoneActions(packet: ProjectIntelligencePacket, milestone: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   const categories = getBudgetSpendingCategories(packet);
   const budgetBoundary = getRecordedBudgetBoundary(packet);
   const next = getFollowingMilestone(packet, milestone);
   const categoryPhrase = categories.length ? formatNaturalActionSeries(categories.slice(0, 5)) : "the required phase-one spending categories";
   const nextPhrase = next ? formatMilestoneAsGerund(next.title) : "the next milestone";

   return [
      `Build a phase-one cost table for ${categoryPhrase}`,
      `Estimate a low, target, and high cost for each required category, then keep the target total within ${budgetBoundary}`,
      `Move optional upgrades to a defer list and reserve the remaining budget for ${nextPhrase}`,
   ];
}

interface ProjectBudgetLineItem {
   label: string;
   amount: number;
}

interface ProjectBudgetSnapshot {
   limit?: number;
   committed?: number;
   reserved?: number;
   lineItems: ProjectBudgetLineItem[];
   deferred: string[];
   corpus: string;
}

function parseProjectMoney(value?: string) {
   const clean = compactText(value, 80).replace(/[$,\s]/g, "");
   if (!clean) return undefined;
   const parsed = Number(clean);
   return Number.isFinite(parsed) ? parsed : undefined;
}

function formatProjectMoney(value?: number) {
   if (typeof value !== "number" || !Number.isFinite(value)) return "";
   return `$${Math.round(value).toLocaleString("en-US")}`;
}

function getBudgetMilestoneCorpus(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   return [
      milestone?.workingContent || "",
      ...(milestone?.decisions || []),
      ...(milestone?.completionEvidence || []),
      ...packet.projectUnderstanding.confirmedDecisions.map((decision) => decision.statement),
      ...packet.projectUnderstanding.constraints.map((constraint) => constraint.statement),
   ]
      .filter(Boolean)
      .join("\n")
      .replace(/\r/g, "\n")
      .slice(0, 50000)
      .trim();
}

function getProjectBudgetSnapshot(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]): ProjectBudgetSnapshot {
   const corpus = getBudgetMilestoneCorpus(packet, milestone);
   const localMilestoneCorpus = [milestone?.workingContent || "", ...(milestone?.decisions || []), ...(milestone?.completionEvidence || [])].filter(Boolean).join("\n").replace(/\r/g, "\n").slice(0, 30000).trim();
   const lineItemCorpus = localMilestoneCorpus || corpus;
   const lineItems: ProjectBudgetLineItem[] = [];
   const lineItemPattern = /(?:^|\n)\s*[-*•]?\s*([^:\n]{2,120}):\s*\$\s*([\d,]+(?:\.\d{1,2})?)/gim;
   let lineItemMatch: RegExpExecArray | null;

   while ((lineItemMatch = lineItemPattern.exec(lineItemCorpus))) {
      const label = cleanAuthoritativeStatement(lineItemMatch[1], 180)
         .replace(/^[-*•]\s*/, "")
         .trim();
      const amount = parseProjectMoney(lineItemMatch[2]);
      if (!label || typeof amount !== "number") continue;
      if (/\b(?:total|required categories total|budget limit|remaining|reserved)\b/i.test(label)) continue;
      // Decision alternatives can also contain prices. They are comparison data,
      // not approved budget line items, so they must never become setup purchases.
      if (/^(?:option|alternative|candidate)\s*\d+\b/i.test(label)) continue;
      if (!lineItems.some((item) => normalizePrompt(item.label) === normalizePrompt(label))) {
         lineItems.push({ label, amount });
      }
   }

   const findAmount = (patterns: RegExp[]) => {
      for (const pattern of patterns) {
         const match = corpus.match(pattern);
         const parsed = parseProjectMoney(match?.[1]);
         if (typeof parsed === "number") return parsed;
      }
      return undefined;
   };

   const limit = findAmount([
      /\b(?:phase[- ]one|first[- ]phase|overall|total)?\s*budget\b[^$]{0,90}\b(?:capped at|limited to|at or below|under|no more than|limit(?: is| of)?|maximum(?: is| of)?)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
      /\b(?:phase[- ]one|first[- ]phase)\s+limit\b[^$]{0,40}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
      /\$\s*([\d,]+(?:\.\d{1,2})?)\s+(?:phase[- ]one|first[- ]phase)\s+(?:budget\s+)?limit\b/i,
      /\$\s*([\d,]+(?:\.\d{1,2})?)\s+(?:phase[- ]one|first[- ]phase)\s+budget\b/i,
   ]);

   let committed = findAmount([
      /\b(?:required(?: workspace and safety)? categories?|required spending|workspace and safety categories?)\b[^$]{0,100}\b(?:total|are|is|committed|assigned|allocated)\b[^$]{0,40}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
      /\$\s*([\d,]+(?:\.\d{1,2})?)\b[^.]{0,80}\b(?:assigned|allocated|committed)\b.*\b(?:required|workspace|safety)\b/i,
   ]);

   if (typeof committed !== "number" && lineItems.length >= 2) {
      committed = lineItems.reduce((total, item) => total + item.amount, 0);
   }

   let reserved = findAmount([
      /\b(?:reserve|reserved)\s+(?:the\s+)?(?:remaining\s+)?\$\s*([\d,]+(?:\.\d{1,2})?)/i,
      /\bremaining\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i,
      /\$\s*([\d,]+(?:\.\d{1,2})?)\b[^.]{0,100}\b(?:remains? reserved|is reserved|will be reserved)\b/i,
   ]);

   if (typeof reserved !== "number" && typeof limit === "number" && typeof committed === "number" && limit >= committed) {
      reserved = limit - committed;
   }

   const deferred: string[] = [];
   const sentences = corpus
      .split(/(?<=[.!?])\s+|\n+/)
      .map((item) => cleanAuthoritativeStatement(item, 1800))
      .filter(Boolean);

   for (const sentence of sentences) {
      const match = sentence.match(/^(.+?)\s+(?:are|is)\s+(?:deferred|not included|excluded)(?:\b|\s)/i);
      if (!match) continue;
      const items = match[1]
         .replace(/^(?:a|an|the)\s+/i, "")
         .split(/\s*,\s*|\s+and\s+/i)
         .map((item) => cleanAuthoritativeStatement(item, 220).replace(/^(?:and|or)\s+/i, ""))
         .filter((item) => item.length >= 3);
      deferred.push(...items);
   }

   return {
      limit,
      committed,
      reserved,
      lineItems: lineItems.slice(0, 16),
      deferred: uniqueProjectFacts(deferred, 12),
      corpus,
   };
}

function cleanDecisionRequirementFact(value?: string) {
   let clean = cleanAuthoritativeStatement(value, 3200)
      .replace(/[.!?]+$/, "")
      .trim();
   if (!clean) return "";

   // Situation summaries can contain a valid asset statement followed by stale
   // unresolved state. Keep the useful first clause and drop the superseded tail.
   const unresolvedTail = clean.search(/\b(?:the|this|these|those)\s+[^.]{0,280}\b(?:have|has)\s+not\s+been\s+(?:finalized|confirmed|decided|selected|verified|determined)\b/i);
   if (unresolvedTail > 0) clean = clean.slice(0, unresolvedTail).trim();

   return clean.replace(/[.!?]+$/, "").trim();
}

function isBroadDecisionRequirementSummary(value?: string) {
   const clean = cleanDecisionRequirementFact(value);
   if (!clean) return false;
   const topics = getMilestoneInputTopics(clean);
   return clean.length >= 150 && topics.length >= 4;
}

function getDecisionRequirementSpecificity(value?: string) {
   const clean = cleanDecisionRequirementFact(value);
   if (!clean) return -1000;

   let score = 0;
   if (/\b(?:\d+\s*-?amp|\$\s?[\d,]+|one high-draw|shared circuit|already own|already have)\b/i.test(clean)) score += 24;
   if (/\b(?:straight cuts?|crosscuts?|drilling|sanding|assembly|finishing|sheet goods?)\b/i.test(clean)) score += 22;
   if (/\b(?:mobile|movable|folding|portable|easy to reset|clear access path)\b/i.test(clean)) score += 18;
   if (/\b(?:shop vacuum|shop-vac|source collection|hearing protection|respiratory|eye protection|task lighting)\b/i.test(clean)) score += 18;
   if (/\b(?:deferred|not required|not included|no permanent|no stationary|will not include|do not require)\b/i.test(clean)) score += 14;
   if (/\b(?:confirmed|required|sufficient|will use|will remain|will be stored)\b/i.test(clean)) score += 8;
   if (isBroadDecisionRequirementSummary(clean)) score -= 28;
   score -= Math.min(14, clean.length / 90);
   return score;
}

function chooseSpecificDecisionRequirement(candidates: string[], include: RegExp[], reject: RegExp[] = []) {
   return (
      candidates
         .filter((fact) => include.every((pattern) => pattern.test(fact)))
         .filter((fact) => !reject.some((pattern) => pattern.test(fact)))
         .sort((left, right) => getDecisionRequirementSpecificity(right) - getDecisionRequirementSpecificity(left))[0] || ""
   );
}

function extractRequirementObject(value?: string) {
   const clean = cleanDecisionRequirementFact(value);
   if (!clean) return "";
   const match = clean.match(/\b(?:require|requires|required|must support|needs? to support)\b\s*:?[\s-]*(.+)$/i);
   if (!match?.[1]) return clean;
   return match[1].replace(/[.!?]+$/, "").trim();
}

function countDecisionRequirementTerms(value: string, patterns: RegExp[]) {
   return patterns.reduce((count, pattern) => count + (pattern.test(value) ? 1 : 0), 0);
}

function chooseWorkOperationsRequirement(candidates: string[]) {
   const operationPatterns = [/\bstraight cuts?\b/i, /\bcrosscuts?\b/i, /\bdrilling\b/i, /\bsanding\b/i, /\bassembly\b/i, /\b(?:light )?finishing\b/i, /\bsheet goods?\b/i, /\bmilling\b/i];

   return (
      candidates
         .filter((fact) => /\b(?:require|requires|required operations?|must support|needs? to support|must handle)\b/i.test(fact))
         .filter((fact) => countDecisionRequirementTerms(fact, operationPatterns) >= 2)
         .filter((fact) => !/\b(?:hearing protection|noise-producing|daytime hours?|safety equipment|dust control|source collection)\b/i.test(fact))
         .sort((left, right) => {
            const score = (fact: string) =>
               countDecisionRequirementTerms(fact, operationPatterns) * 20 + (/\b(?:projects?|setup|workspace|first version)\b/i.test(fact) ? 18 : 0) + (/\b(?:accurate|straight cuts?|crosscuts?)\b/i.test(fact) ? 8 : 0) - fact.length / 180;
            return score(right) - score(left);
         })[0] || ""
   );
}

function choosePortabilityRequirement(candidates: string[]) {
   const operationPatterns = [/\bstraight cuts?\b/i, /\bcrosscuts?\b/i, /\bdrilling\b/i, /\bsanding\b/i, /\bassembly\b/i, /\b(?:light )?finishing\b/i];

   return (
      candidates
         .filter((fact) => /\b(?:mobile|movable|folding|portable|easy to reset|reset after each|clear access path)\b/i.test(fact))
         .filter((fact) => /\b(?:setup|workspace|space|work surfaces?|tool storage|layout|garage)\b/i.test(fact))
         .filter((fact) => !/\b(?:deferred|not included|already own|already have)\b/i.test(fact))
         .sort((left, right) => {
            const score = (fact: string) =>
               (/\b(?:all work surfaces|tool storage)\b/i.test(fact) ? 30 : 0) +
               (/\b(?:mobile|movable|folding|portable)\b/i.test(fact) ? 18 : 0) +
               (/\b(?:easy to reset|reset after each)\b/i.test(fact) ? 18 : 0) +
               (/\bclear access path\b/i.test(fact) ? 8 : 0) -
               countDecisionRequirementTerms(fact, operationPatterns) * 16 -
               fact.length / 220;
            return score(right) - score(left);
         })[0] || ""
   );
}

function chooseElectricalRequirement(candidates: string[]) {
   return (
      candidates
         .filter((fact) => /\b(?:circuit|electrical|power|outlet|amp)\b/i.test(fact))
         .filter((fact) => /\b(?:sufficient|one high-draw|confirmed|shared 15-amp|shared circuit)\b/i.test(fact))
         .filter((fact) => !/\b(?:electrical capacity has been confirmed.*chemical storage|optional upgrades have been separated)\b/i.test(fact))
         .sort((left, right) => {
            const score = (fact: string) =>
               (/\bshared 15-amp\b/i.test(fact) ? 35 : 0) +
               (/\bsufficient\b/i.test(fact) ? 28 : 0) +
               (/\bone high-draw tool\b/i.test(fact) ? 28 : 0) +
               (/\b(?:circular saw|drill|sander|shop vacuum)\b/i.test(fact) ? 12 : 0) -
               (/\bnot required\b/i.test(fact) ? 10 : 0) -
               fact.length / 220;
            return score(right) - score(left);
         })[0] || ""
   );
}

function chooseDustControlRequirement(candidates: string[]) {
   return (
      candidates
         .filter((fact) => /\b(?:dust|shop vacuum|shop-vac|source collection|cleanup)\b/i.test(fact))
         .filter((fact) => /\b(?:controlled|connected|required|will use|will be used|regular cleanup)\b/i.test(fact))
         .filter((fact) => !/\$\s*[\d,]+|\b(?:deferred|not included|optional future)\b/i.test(fact))
         .filter((fact) => !/\b(?:required phase-one changes are|electrical capacity has been confirmed|chemical storage and noise controls)\b/i.test(fact))
         .sort((left, right) => {
            const score = (fact: string) =>
               (/\bshop vacuum\b|\bshop-vac\b/i.test(fact) ? 28 : 0) +
               (/\bconnected at the tool\b|\bsource collection\b/i.test(fact) ? 24 : 0) +
               (/\bregular cleanup\b|\bno accumulation\b/i.test(fact) ? 18 : 0) +
               (/\bdust will be controlled\b/i.test(fact) ? 18 : 0) -
               fact.length / 220;
            return score(right) - score(left);
         })[0] || ""
   );
}

function stripBudgetAmount(value: string) {
   return cleanDecisionRequirementFact(value)
      .replace(/\s*:\s*\$\s*[\d,]+(?:\.\d{1,2})?\s*$/i, "")
      .replace(/[.!?]+$/, "")
      .trim();
}

function buildSafetyRequirement(candidates: string[]) {
   const equipment =
      candidates.filter((fact) => /\b(?:eye|hearing|respiratory|general safety)\b/i.test(fact) && /\bsafety equipment\b/i.test(fact)).sort((left, right) => getDecisionRequirementSpecificity(right) - getDecisionRequirementSpecificity(left))[0] || "";
   const operatingRule = candidates.filter((fact) => /\b(?:hearing protection|noise-producing work|daytime hours?)\b/i.test(fact)).sort((left, right) => getDecisionRequirementSpecificity(right) - getDecisionRequirementSpecificity(left))[0] || "";

   const parts = uniqueProjectFacts([equipment ? `${stripBudgetAmount(equipment)} is required` : "", operatingRule ? cleanDecisionRequirementFact(operatingRule) : ""], 2);
   return parts.join("; ");
}

function chooseExplicitExclusions(candidates: string[]) {
   const exclusionTerms = [/\bdedicated (?:20-amp )?circuit\b/i, /\bpermanent dust collector\b/i, /\bexhaust fan\b/i, /\bfixed full-size workbench\b/i, /\bstationary machinery\b/i, /\bheavy milling\b/i, /\blarge cabinets?\b/i];

   return (
      candidates
         .filter((fact) => /\b(?:deferred|not required|not included|no permanent|no stationary|will not include|do not require)\b/i.test(fact))
         .sort((left, right) => {
            const score = (fact: string) =>
               countDecisionRequirementTerms(fact, exclusionTerms) * 24 + (/\b(?:deferred and are not included|optional future upgrades?)\b/i.test(fact) ? 10 : 0) - (/^expansion upgrades remain deferred\.?$/i.test(fact) ? 60 : 0) - fact.length / 260;
            return score(right) - score(left);
         })[0] || ""
   );
}

function getDecisionRequirementsForPrompt(packet: ProjectIntelligencePacket, prompt: string, active?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   const milestones = getAuthoritativeMilestones(packet);
   const promptLower = normalizePrompt(prompt);
   const mentioned = milestones.find((milestone) => {
      const title = normalizePrompt(milestone.title);
      const titleTokens = title.split(/\s+/).filter((token) => token.length >= 4);
      return titleTokens.filter((token) => promptLower.includes(token)).length >= Math.min(2, titleTokens.length);
   });
   const nextSelection = milestones.find((milestone) => milestone.status !== "complete" && getMilestoneGuidanceCategory(milestone.title) === "selection");
   const target = mentioned || (active && getMilestoneGuidanceCategory(active.title) === "selection" ? active : nextSelection) || active;
   const budgetMilestone = milestones.filter((milestone) => getMilestoneGuidanceCategory(milestone.title) === "budget").sort((left, right) => right.order - left.order)[0];
   const budgetSnapshot = getProjectBudgetSnapshot(packet, budgetMilestone || active);
   const rawCandidates = uniqueProjectFacts(
      [
         ...packet.projectUnderstanding.confirmedDecisions.map((decision) => decision.statement),
         ...packet.projectUnderstanding.constraints.map((constraint) => constraint.statement),
         ...getSituationFacts(packet.projectUnderstanding.situation, 10),
         ...milestones.flatMap((milestone) => getRecordedMilestoneDecisionFacts(milestone, 30)),
      ],
      120,
   );
   const candidates = uniqueProjectFacts(
      rawCandidates
         .map(cleanDecisionRequirementFact)
         .filter(Boolean)
         .filter((fact) => !isUnresolvedMilestoneInputFact(fact))
         .filter((fact) => !/^(?:they|these|those)\b/i.test(fact)),
      100,
   );

   const firstScopeFacts = milestones
      .filter((milestone) => getMilestoneGuidanceCategory(milestone.title) === "first-scope")
      .flatMap((milestone) => getRecordedMilestoneDecisionFacts(milestone, 30))
      .map(cleanDecisionRequirementFact)
      .filter(Boolean);

   const namedWork = chooseSpecificDecisionRequirement(firstScopeFacts, [/\b(?:projects?|uses?|scenarios?)\b/i, /\b(?:chose|chosen|selected|support)\b/i], [/\b(?:require|requires|required operations?|capabilities?)\b/i]);
   const operationsFact = chooseWorkOperationsRequirement([...firstScopeFacts, ...candidates]);
   const portability = choosePortabilityRequirement(candidates);
   const existingAssets = chooseSpecificDecisionRequirement(candidates, [/\b(?:already own|already have|existing)\b/i, /\b(?:drill|circular saw|shop vacuum|workbench|tools?)\b/i], [/\b(?:not finalized|not confirmed|still open|unresolved)\b/i]);
   const electrical = chooseElectricalRequirement(candidates);
   const dustControl = chooseDustControlRequirement(candidates);
   const safetyControl = buildSafetyRequirement(candidates);
   const exclusions = chooseExplicitExclusions(candidates);

   const requirements = uniqueProjectFacts(
      [
         typeof budgetSnapshot.reserved === "number" ? `Available budget: ${formatProjectMoney(budgetSnapshot.reserved)} remains available for the decision and any required accessories` : "",
         namedWork ? `Projects to support: ${namedWork.replace(/[.!?]+$/, "")}` : "",
         operationsFact ? `Required operations: ${extractRequirementObject(operationsFact)}` : "",
         portability ? `Space and reset: ${portability.replace(/[.!?]+$/, "")}` : "",
         existingAssets ? `Existing equipment: ${existingAssets.replace(/[.!?]+$/, "")}` : "",
         electrical ? `Power: ${electrical.replace(/[.!?]+$/, "")}` : "",
         dustControl ? `Dust control: ${dustControl.replace(/[.!?]+$/, "")}` : "",
         safetyControl && getProjectFactOverlapRatio(safetyControl, dustControl) < 0.55 ? `Safety requirements: ${safetyControl.replace(/[.!?]+$/, "")}` : "",
         exclusions ? `Deferred or excluded: ${exclusions.replace(/[.!?]+$/, "")}` : "",
      ],
      10,
   );

   return { target, requirements };
}

interface ProjectDecisionOptionCandidate {
   order: number;
   name: string;
   cost?: number;
   description: string;
   strengths: string[];
   tradeoffs: string[];
   score: number;
   budgetRemaining?: number;
}

interface ProjectOptionDecisionEvaluation {
   options: ProjectDecisionOptionCandidate[];
   best?: ProjectDecisionOptionCandidate;
   budget?: number;
   requirements: string[];
   validationBeforeExpansion: string;
   shouldPostpone: boolean;
   existingOverlap: string;
}

function splitProjectOptionSentences(value?: string) {
   return (value || "")
      .replace(/\r/g, "\n")
      .replace(/\n+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map((item) => cleanAuthoritativeStatement(item, 1800))
      .filter(Boolean);
}

function splitProjectOptionEvidence(value?: string) {
   const strengths: string[] = [];
   const tradeoffs: string[] = [];

   splitProjectOptionSentences(value).forEach((sentence) => {
      const butParts = sentence
         .split(/\s*,?\s+but\s+/i)
         .map((item) => cleanAuthoritativeStatement(item, 1200))
         .filter(Boolean);

      if (butParts.length >= 2) {
         strengths.push(butParts[0]);
         tradeoffs.push(butParts.slice(1).join("; "));
         return;
      }

      if (/\b(?:would not|cannot|can't|less convenient|more dust|more setup|more storage|take up|uses? almost|very little contingency|overlap|closer to stationary|conflict|limitation|drawback)\b/i.test(sentence)) {
         tradeoffs.push(sentence);
         return;
      }

      if (/\b(?:would|can|could|will|includes?|portable|mobile|easy to store|accurate|repeatable|shop-vac|dust-collection|dust adapter|guide track|folding stand)\b/i.test(sentence)) {
         strengths.push(sentence);
      }
   });

   return {
      strengths: uniqueProjectFacts(strengths, 4),
      tradeoffs: uniqueProjectFacts(tradeoffs, 4),
   };
}

function getProjectOptionDecisionCorpus(packet: ProjectIntelligencePacket, conversation: ProjectGuidanceConversationContext, active?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   const selectionMilestone =
      active && getMilestoneGuidanceCategory(active.title) === "selection" ? active : getAuthoritativeMilestones(packet).find((milestone) => milestone.status !== "complete" && getMilestoneGuidanceCategory(milestone.title) === "selection") || active;
   const recentUserMessages = (conversation.recentMessages || [])
      .filter((message) => message.role === "user")
      .slice()
      .reverse()
      .map((message) => message.content);
   const candidates = [conversation.lastUserPrompt || "", ...recentUserMessages, selectionMilestone?.workingContent || "", ...(selectionMilestone?.decisions || []), ...(selectionMilestone?.completionEvidence || [])].filter(Boolean);

   return (
      candidates
         .map((value) => ({
            value,
            count: (value.match(/\bOption\s+\d+\s*[—–-]/gi) || []).length,
         }))
         .sort((left, right) => right.count - left.count || right.value.length - left.value.length)[0]?.value || ""
   );
}

function parseProjectDecisionOptions(value?: string) {
   const raw = (value || "").replace(/\r/g, "\n").trim();
   if (!raw) return [] as ProjectDecisionOptionCandidate[];

   const normalized = raw.replace(/\s+(Option\s+\d+\s*[—–-])/gi, "\n$1").replace(/\s+(All\s+(?:three|the)\s+options?\b)/gi, "\n$1");
   const optionPattern = /(?:^|\n)\s*Option\s+(\d+)\s*[—–-]\s*([^:\n]+?)(?:\s*:\s*\$\s*([\d,]+(?:\.\d{1,2})?))?\s*(?:\n+|\s{2,})([\s\S]*?)(?=\n\s*Option\s+\d+\s*[—–-]|\n\s*All\s+(?:three|the)\s+options?\b|$)/gim;
   const options: ProjectDecisionOptionCandidate[] = [];
   let match: RegExpExecArray | null;

   while ((match = optionPattern.exec(normalized))) {
      const order = Number(match[1]);
      const name = cleanAuthoritativeStatement(match[2], 240).replace(/[.!?]+$/, "");
      const cost = parseProjectMoney(match[3]);
      const description = cleanAuthoritativeStatement(match[4], 4000);
      const evidence = splitProjectOptionEvidence(description);

      if (!name) continue;
      options.push({
         order: Number.isFinite(order) ? order : options.length + 1,
         name,
         cost,
         description,
         strengths: evidence.strengths,
         tradeoffs: evidence.tradeoffs,
         score: 0,
      });
   }

   return options.sort((left, right) => left.order - right.order).slice(0, 8);
}

function getProjectOptionRequirementCorpus(requirements: string[], packet: ProjectIntelligencePacket) {
   return [
      ...requirements,
      packet.projectUnderstanding.goal,
      packet.projectUnderstanding.successState,
      ...packet.projectUnderstanding.successCriteria.map((criterion) => criterion.statement),
      ...packet.projectUnderstanding.constraints.map((constraint) => constraint.statement),
      ...packet.projectUnderstanding.confirmedDecisions.map((decision) => decision.statement),
   ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
}

function getProjectOptionScore(option: ProjectDecisionOptionCandidate, requirements: string[], packet: ProjectIntelligencePacket, budget?: number) {
   const text = `${option.name} ${option.description}`.toLowerCase();
   const requirementCorpus = getProjectOptionRequirementCorpus(requirements, packet);
   let score = 0;

   if (typeof budget === "number" && typeof option.cost === "number") {
      const remaining = budget - option.cost;
      option.budgetRemaining = remaining;
      score += remaining >= 0 ? 12 : -100;
      if (remaining >= budget * 0.2) score += 8;
      else if (remaining >= budget * 0.1) score += 2;
      else score -= 8;
   }

   const operationPairs: Array<[RegExp, RegExp]> = [
      [/\bstraight cuts?\b/i, /\bstraight cuts?\b|\bguide track\b|\btrack\b/i],
      [/\bcrosscuts?\b/i, /\bcrosscuts?\b|\brepeated cuts?\b/i],
      [/\bsheet goods?\b|\bplywood\b/i, /\bsheet goods?\b|\bplywood\b|\bguide track\b/i],
      [/\bripping\b|\brip cuts?\b/i, /\bripping\b|\brip cuts?\b/i],
      [/\brepeated cuts?\b/i, /\brepeated cuts?\b|\brepeatable\b/i],
   ];

   operationPairs.forEach(([required, supported]) => {
      if (required.test(requirementCorpus)) {
         score += supported.test(text) ? 10 : 0;
         if (/\bwould not handle\b|\bcannot handle\b/i.test(text) && required.test(text)) score -= 12;
      }
   });

   if (/\b(?:mobile|portable|folding|easy to store|easy to reset)\b/i.test(requirementCorpus)) {
      if (/\b(?:mobile|portable|folding|easy to store)\b/i.test(text)) score += 15;
      if (/\b(?:more setup space|more storage space|stationary machinery|fixed footprint)\b/i.test(text)) score -= 16;
   }

   if (/\b(?:shop vacuum|shop-vac|source collection|dust control)\b/i.test(requirementCorpus)) {
      if (/\b(?:shop-vac adapter|dust adapter|dust-collection accessories|source collection)\b/i.test(text)) score += 9;
      if (/\bmore dust\b/i.test(text)) score -= 12;
   }

   if (/\b(?:stationary machinery|no permanent|deferred)\b/i.test(requirementCorpus) && /\b(?:stationary machinery|closer to stationary|fixed)\b/i.test(text)) {
      score -= 20;
   }

   if (/\boverlap(?:s|ping)?\b.*\balready own\b|\boverlap(?:s|ping)?\b.*\bexisting\b/i.test(text)) score -= 10;
   if (/\b(?:accurate|repeatable|easier|portable|easy to store)\b/i.test(text)) score += 5;

   return score;
}

function getValidationBeforeExpansionFact(packet: ProjectIntelligencePacket) {
   return (
      uniqueProjectFacts(
         [
            packet.projectUnderstanding.successState,
            ...packet.projectUnderstanding.successCriteria.map((criterion) => criterion.statement),
            ...packet.projectUnderstanding.confirmedDecisions.map((decision) => decision.statement),
            ...packet.projectUnderstanding.constraints.map((constraint) => constraint.statement),
         ]
            .map((item) => cleanAuthoritativeStatement(item, 1200))
            .filter((item) => /\b(?:complete|finish|use|test|run)\b.*\b(?:projects?|work|pilot|trial)\b.*\bbefore\b.*\b(?:equipment|purchase|upgrade|permanent|expand)/i.test(item)),
         1,
      )[0] || ""
   );
}

function getExistingOptionOverlap(option?: ProjectDecisionOptionCandidate) {
   if (!option) return "";
   const match = option.description.match(/\boverlap(?:s|ping)?\s+with\s+(?:the\s+)?([^.;]+)/i);
   return cleanAuthoritativeStatement(match?.[1], 500)
      .replace(/\bI already own\b/gi, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[.!?]+$/, "")
      .trim();
}

function getProjectOptionPrimaryStrength(option?: ProjectDecisionOptionCandidate) {
   if (!option) return "";
   return option.strengths.find((item) => !/^this includes\b/i.test(item) && !/^includes\b/i.test(item)) || option.strengths[0] || "";
}

function getProjectOptionDecisionEvaluation(
   packet: ProjectIntelligencePacket,
   prompt: string,
   conversation: ProjectGuidanceConversationContext,
   active?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number],
): ProjectOptionDecisionEvaluation {
   const optionCorpus = getProjectOptionDecisionCorpus(packet, conversation, active);
   const parsed = parseProjectDecisionOptions(optionCorpus);
   const decisionRequirements = getDecisionRequirementsForPrompt(packet, prompt, active);
   const requirements = decisionRequirements.requirements;
   const budgetSnapshot = getProjectBudgetSnapshot(packet, active);
   const budgetFromRequirements = requirements
      .map((item) => item.match(/\bAvailable budget:\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1])
      .map((value) => parseProjectMoney(value))
      .find((value) => typeof value === "number");
   const budgetFromOptionCorpus = parseProjectMoney(optionCorpus.match(/\b(?:remaining|available|reserved)\s+\$\s*([\d,]+(?:\.\d{1,2})?)/i)?.[1]);
   const snapshotReserved = typeof budgetSnapshot.reserved === "number" && budgetSnapshot.reserved > 0 ? budgetSnapshot.reserved : undefined;
   const budget = snapshotReserved ?? budgetFromRequirements ?? budgetFromOptionCorpus;
   const options = parsed
      .map((option) => ({
         ...option,
         score: getProjectOptionScore(option, requirements, packet, budget),
      }))
      .sort((left, right) => left.order - right.order);
   const best = [...options].sort((left, right) => right.score - left.score || left.order - right.order)[0];
   const validationBeforeExpansion = getValidationBeforeExpansionFact(packet);
   const existingOverlap = getExistingOptionOverlap(best);
   const allConsumeMostBudget = Boolean(typeof budget === "number" && options.length && options.every((option) => typeof option.cost === "number" && option.cost >= budget * 0.7));

   return {
      options,
      best,
      budget,
      requirements,
      validationBeforeExpansion,
      shouldPostpone: Boolean(validationBeforeExpansion && (existingOverlap || allConsumeMostBudget)),
      existingOverlap,
   };
}

function getProjectOptionByConversation(evaluation: ProjectOptionDecisionEvaluation, conversation: ProjectGuidanceConversationContext) {
   const directMemory = [conversation.lastRecommendation || "", conversation.lastSubject?.title || ""].filter(Boolean).join(" ").toLowerCase();
   const directMatch = evaluation.options.find((option) => directMemory.includes(option.name.toLowerCase()));
   if (directMatch) return directMatch;

   const lastResponse = conversation.lastAssistantResponse || "";
   const explicitRecommendation = lastResponse.match(/(?:best buy-now fit:|i recommend|recommendation is|choose)\s*(?:Option\s+\d+\s*[—–-]\s*)?([^\n.]+?)(?:\s*\(|[.!?]|$)/i)?.[1];
   const explicitMatch = evaluation.options.find((option) => normalizePrompt(explicitRecommendation).includes(normalizePrompt(option.name)));

   return explicitMatch || evaluation.best;
}

function getOptionDisplayLabel(option: ProjectDecisionOptionCandidate) {
   return `Option ${option.order} — ${option.name}${typeof option.cost === "number" ? ` (${formatProjectMoney(option.cost)})` : ""}`;
}

function getOptionComparisonLine(option: ProjectDecisionOptionCandidate, isBest: boolean) {
   const hardPhaseConflict = /\b(?:more dust|more setup space|closer to stationary machinery|fixed footprint)\b/i.test(`${option.name} ${option.description}`);
   const fit = isBest ? "Strongest overall fit" : hardPhaseConflict ? "Weak fit for the current phase" : "Viable with tradeoffs";
   const budget =
      typeof option.budgetRemaining === "number"
         ? option.budgetRemaining >= 0
            ? ` Leaves ${formatProjectMoney(option.budgetRemaining)} of the recorded decision budget.`
            : ` Exceeds the recorded decision budget by ${formatProjectMoney(Math.abs(option.budgetRemaining))}.`
         : "";
   const primaryStrength = getProjectOptionPrimaryStrength(option);
   const strength = primaryStrength ? ` Strength: ${ensureSentence(primaryStrength)}` : "";
   const tradeoff = option.tradeoffs.length
      ? ` Tradeoffs: ${option.tradeoffs
           .slice(0, 2)
           .map((item) => item.replace(/[.!?]+$/, ""))
           .join("; ")}.`
      : "";
   return `${option.order}. ${option.name}${typeof option.cost === "number" ? ` — ${formatProjectMoney(option.cost)}` : ""}: ${fit}.${budget}${strength}${tradeoff}`.trim();
}

function formatOptionConditionStrength(value?: string) {
   const clean = cleanAuthoritativeStatement(value, 1000).replace(/[.!?]+$/, "");
   if (!clean) return "";
   return clean
      .replace(/^it would handle\b/i, "handling")
      .replace(/^it would make\b/i, "making")
      .replace(/^it would provide\b/i, "providing")
      .replace(/^it would support\b/i, "supporting")
      .replace(/^it would allow\b/i, "allowing")
      .replace(/^it can handle\b/i, "handling")
      .replace(/^it can provide\b/i, "providing")
      .replace(/^this includes\b/i, "having")
      .replace(/^includes\b/i, "having")
      .replace(/^./, (character) => character.toLowerCase());
}

function getAlternativeOptionConditions(evaluation: ProjectOptionDecisionEvaluation, recommended?: ProjectDecisionOptionCandidate) {
   return evaluation.options
      .filter((option) => !recommended || option.name !== recommended.name)
      .map((option) => {
         const strength = formatOptionConditionStrength(getProjectOptionPrimaryStrength(option));
         const tradeoff = option.tradeoffs[0]?.replace(/[.!?]+$/, "");
         if (!strength) return "";
         return tradeoff
            ? `I would switch to ${option.name} if this capability became the dominant need: ${ensureSentence(getProjectOptionPrimaryStrength(option))} The tradeoff would also need to be acceptable: ${ensureSentence(tradeoff)}`
            : `I would switch to ${option.name} if this capability became the dominant need: ${ensureSentence(getProjectOptionPrimaryStrength(option))}`;
      })
      .filter(Boolean)
      .slice(0, 2);
}

function getExecutionMilestoneActions(packet: ProjectIntelligencePacket, milestone: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   const budgetMilestone = getAuthoritativeMilestones(packet)
      .filter((item) => getMilestoneGuidanceCategory(item.title) === "budget")
      .slice()
      .sort((left, right) => right.order - left.order)[0];
   const snapshot = getProjectBudgetSnapshot(packet, budgetMilestone);
   const requiredItems = snapshot.lineItems.filter((item) => !/\b(?:contingency|reserve|buffer)\b/i.test(item.label)).filter((item) => !/^(?:option|alternative|candidate)\s*\d+\b/i.test(item.label));
   const safetyAndInfrastructure = requiredItems.filter((item) => /\b(?:light|vac|dust|filter|hose|adapter|chemical|finish|cabinet|eye|hearing|respiratory|safety|ppe|cleanup)\b/i.test(item.label)).map((item) => item.label);
   const workspaceItems = requiredItems.filter((item) => /\b(?:work surface|workbench|folding|mobile|cart|storage|shelv|support)\b/i.test(item.label)).map((item) => item.label);
   const remainingItems = requiredItems.filter((item) => !safetyAndInfrastructure.includes(item.label) && !workspaceItems.includes(item.label)).map((item) => item.label);
   const earlierInputs = getEarlierDecisionInputsForMilestone(packet, milestone, 24);
   const earlierMilestoneFacts = getAuthoritativeMilestones(packet)
      .filter((item) => item.order < milestone.order)
      .flatMap((item) => getRecordedMilestoneDecisionFacts(item, 40));
   const executionInputCorpus = uniqueProjectFacts([...earlierInputs, ...earlierMilestoneFacts, ...getAuthoritativeConfirmedDecisions(packet)], 120);
   const earlierCorpus = executionInputCorpus.join(" ").toLowerCase();
   const deferredToolDecision = executionInputCorpus.find((item) =>
      /\b(?:decided not to purchase|will not purchase|no major (?:power )?tool|purchase (?:is|remains) deferred|major-tool purchase (?:is|remains) deferred|reserve (?:will )?remain(?:s)? untouched|keep the .*reserve intact)\b/i.test(item),
   );

   const purchasePhrase = formatNaturalActionSeries(uniqueProjectFacts([...safetyAndInfrastructure, ...remainingItems], 8));
   const workspacePhrase = formatNaturalActionSeries(uniqueProjectFacts(workspaceItems, 6));
   const controlLabels = uniqueProjectFacts(
      [
         /\b(?:task lighting|bright led|lighting)\b/i.test(earlierCorpus) ? "task lighting" : "",
         /\b(?:shop vacuum|shop-vac|source collection|dust control)\b/i.test(earlierCorpus) ? "shop-vac source collection" : "",
         /\b(?:airflow|ventilation|garage door|cross-ventilation)\b/i.test(earlierCorpus) ? "airflow" : "",
         /\b(?:chemical|finish storage|approved closed cabinet|flammable)\b/i.test(earlierCorpus) ? "safe finish and chemical storage" : "",
         /\b(?:shared 15-amp|one high-draw|circuit limit|electrical capacity)\b/i.test(earlierCorpus) ? "the confirmed electrical limit" : "",
         /\b(?:eye protection|hearing protection|respiratory protection|ppe|safety equipment|safe tool-specific)\b/i.test(earlierCorpus) ? "PPE and safe operating practices" : "",
         /\b(?:clear access path|access and reset|easy to reset|reset requirements)\b/i.test(earlierCorpus) ? "access and reset" : "",
      ],
      8,
   );
   const testPhrase = formatNaturalActionSeries([...controlLabels, "the confirmed layout"]);
   const reserveSuffix = deferredToolDecision ? "; keep the deferred major-tool reserve untouched" : "";

   return dedupeMilestoneActions(
      [
         purchasePhrase ? `Purchase the required safety, infrastructure, and operating items first: ${purchasePhrase}` : "Acquire the required safety, infrastructure, and operating items before assembling the setup",
         workspacePhrase ? `Build, assemble, and place ${workspacePhrase} in the confirmed layout while preserving access and reset requirements` : "Assemble and place the working surfaces, storage, and supporting equipment in the confirmed layout",
         testPhrase
            ? `Connect and test the existing tools with ${testPhrase}; verify safe operation and reset before the first real project${reserveSuffix}`
            : `Run a complete setup test with the available tools, confirm safe operation and reset, and record any problem before the first real project${reserveSuffix}`,
      ],
      3,
   );
}

function getOrderedMilestoneActions(packet: ProjectIntelligencePacket, milestone?: ProjectIntelligencePacket["projectUnderstanding"]["milestones"][number]) {
   if (!milestone) return [];

   const next = getFollowingMilestone(packet, milestone);
   const evidenceStatus = getMilestoneEvidenceStatus(packet, milestone);
   const relevantMaterials = getRelevantMaterialsForMilestone(packet, milestone);
   const sourceMaterials = relevantMaterials.map((material) => packet.materials.find((source) => source.id === material.id)).filter(Boolean) as ProjectMaterialSignal[];
   const projectCorpus = getProjectEvidenceCorpus(packet);
   const verificationActions = sourceMaterials
      .flatMap((material) => getMaterialEvidenceStatements(material, 10))
      .map(materialVerificationStatementToAction)
      .filter(Boolean)
      .filter((action) => !verificationActionAlreadyResolved(action, projectCorpus));
   const missingCriteriaActions = evidenceStatus.missing
      .map((criterion, index) => ({
         criterion,
         action: milestoneCriterionToAction(criterion),
         index,
         priority: /^A supported answer is recorded for:/i.test(criterion) ? 0 : /\b(?:separated from optional|save|record known|defer)\b/i.test(criterion) ? 2 : 1,
      }))
      .filter((item) => Boolean(item.action))
      .sort((left, right) => left.priority - right.priority || left.index - right.index)
      .map((item) => item.action);
   const concreteAction = getConcreteMilestoneAction(milestone);
   const materialSynthesisAction = relevantMaterials.length ? `Turn the confirmed findings from ${relevantMaterials.map((material) => `“${material.title}”`).join(", ")} into explicit requirements for this milestone` : "";
   const closeAction = next
      ? `Save the verified requirements and remaining unknowns, then use them to begin ${next.title.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`
      : "Save the final result, the evidence behind it, and any work that should remain deferred";

   if (getMilestoneGuidanceCategory(milestone.title) === "layout") {
      return dedupeMilestoneActions(getPhysicalLayoutMilestoneActions(packet), 3);
   }

   if (getMilestoneGuidanceCategory(milestone.title) === "budget") {
      return dedupeMilestoneActions(getBudgetMilestoneActions(packet, milestone), 3);
   }

   if (getMilestoneGuidanceCategory(milestone.title) === "execution") {
      return dedupeMilestoneActions(getExecutionMilestoneActions(packet, milestone), 3);
   }

   if (getMilestoneGuidanceCategory(milestone.title) === "coordination") {
      const usefulCriteriaActions = missingCriteriaActions.filter((action) => !/^(?:check|compare) (?:the )?result against|^review (?:the )?result against/i.test(action));
      return dedupeMilestoneActions([concreteAction, ...verificationActions, ...usefulCriteriaActions, materialSynthesisAction], 2);
   }

   return dedupeMilestoneActions([...verificationActions, ...missingCriteriaActions, concreteAction, materialSynthesisAction, closeAction], 3);
}

function getCompletedMilestoneReadback(packet: ProjectIntelligencePacket) {
   return getAuthoritativeMilestones(packet).filter((milestone) => milestone.status === "complete");
}

function getPersistentDecisionCandidateScore(value: string, milestoneOrder: number) {
   const clean = cleanAuthoritativeStatement(value, 2200);
   if (!clean) return -1000;
   let score = milestoneOrder * 4;
   if (/\b(?:decided|confirmed|verified|will|must|is sufficient|are sufficient|not required|deferred|excluded|remains|will not|cannot)\b/i.test(clean)) score += 28;
   if (/\$\s*[\d,]+|\b\d+\s*-?amp\b|\bone high-draw tool\b/i.test(clean)) score += 18;
   if (/\b(?:safety|electrical|power|dust|airflow|lighting|storage|ppe|protection|budget|reserve|contingency|mobile|folding|reset|major tool|stationary machinery)\b/i.test(clean)) score += 14;
   if (/\b(?:optional future|future option|reconsider|leading future option|untouched|unspent)\b/i.test(clean)) score += 10;
   if (/^(?:option|alternative|candidate)\s*\d+\b/i.test(clean)) score -= 90;
   if (/\b(?:have not been finalized|not yet finalized|still unresolved|still open|should confirm|needs? confirmation)\b/i.test(clean)) score -= 70;
   if (/^(?:i gathered|we gathered|these projects require|i chose the first projects)\b/i.test(clean)) score -= 22;
   if (/^[-*•]?\s*[^:]{2,100}:\s*\$\s*[\d,]+/i.test(clean)) score -= 18;
   if (/^(?:they|these|those)\b/i.test(clean)) score -= 30;
   score -= clean.length / 260;
   return score;
}

function getPersistentDecisionSemanticKey(value: string) {
   const clean = cleanAuthoritativeStatement(value, 2200).toLowerCase();
   const amount = clean.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)?.[1]?.replace(/,/g, "") || "";
   if (/\bcontingency\b/.test(clean)) return `contingency:${amount || "general"}`;
   if (/\breserv(?:e|ed)\b/.test(clean) && /\b(?:untouched|reserved|reserve|intact|available|remain|will)\b/.test(clean)) return `reserve:${amount || "general"}`;
   if (/\bbudget\b/.test(clean) && /\b(?:cap|limit|at or below|under|maximum)\b/.test(clean)) return `budget-limit:${amount || "general"}`;
   if (/\b(?:actual|required) purchases?\b/.test(clean) && amount) return `actual-purchases:${amount}`;
   if (/\b(?:not purchase|purchase is deferred|major power tool.*deferred)\b/.test(clean)) return "major-tool-deferred";
   if (/\btrack saw\b/.test(clean) && /\b(?:leading|future|conditional|reconsider)\b/.test(clean)) return "track-saw-future";
   if (/\btable saw\b/.test(clean) && /\b(?:excluded|will not|not purchase|deferred)\b/.test(clean)) return "table-saw-excluded";
   if (/\bmiter saw\b/.test(clean) && /\b(?:conditional|reconsider|only if)\b/.test(clean)) return "miter-saw-conditional";
   if (/\b(?:shared )?15-amp\b|\bone high-draw tool\b/.test(clean)) return "electrical-operating-limit";
   if (/\b(?:mobile|movable|folding)\b/.test(clean) && /\b(?:work surface|tool storage|setup|workspace|reset)\b/.test(clean)) return "mobility-reset";
   if (/\btask lighting\b/.test(clean)) return "task-lighting";
   if (/\b(?:shop vacuum|shop-vac|source collection|dust control)\b/.test(clean)) return "dust-control";
   if (/\b(?:finish|chemical|flammable)\b/.test(clean) && /\b(?:cabinet|stored|storage)\b/.test(clean)) return "chemical-storage";
   if (/\b(?:airflow|ventilation|garage door)\b/.test(clean)) return "airflow";
   if (/\b(?:ppe|eye protection|hearing protection|respiratory protection|safety equipment)\b/.test(clean)) return "ppe-safety";
   if (/\b(?:daytime|noise)\b/.test(clean)) return "noise-control";
   return normalizePrompt(clean)
      .split(/\s+/)
      .filter((token) => token.length >= 5)
      .slice(0, 8)
      .join("-");
}

type PersistentDecisionTopic = "budget" | "tool-strategy" | "workspace" | "infrastructure" | "safety" | "deferred" | "scope" | "product" | "technical" | "schedule" | "other";

function getPersistentDecisionTopic(value: string): PersistentDecisionTopic {
   const clean = cleanAuthoritativeStatement(value, 2400).toLowerCase();

   // Monetary summaries belong to the budget topic even when they do not use
   // the word "budget" (for example, "required categories total $1,300").
   if (/\$\s*[\d,]+/.test(clean) && /\b(?:budget|reserve|contingency|allocation|assigned|spent|purchases? totaled|required(?: workspace and safety)? categories? total|at or below|capped at|limit)\b/.test(clean)) return "budget";

   // A deliberate tool-purchase deferral is part of the tool strategy. Keep it
   // separate from deferred infrastructure so it is not repeated twice.
   if (/\b(?:major tool|major power tool|track saw|table saw|miter saw|tool purchase|purchase.*tool|tool.*purchase)\b/.test(clean)) return "tool-strategy";

   if (
      /\b(?:defer|deferred|not included|future upgrade|optional future|reconsider before|reconsidered before|will not include|outside (?:the )?(?:first|initial|current) phase)\b/.test(clean) &&
      /\b(?:circuit|collector|fan|bench|machinery|equipment|upgrade|large cabinet|heavy milling|professional production)\b/.test(clean)
   )
      return "deferred";
   if (/\b(?:ppe|eye protection|hearing protection|respiratory protection|safe operating|chemicals?|flammables?|finishes? storage|noise-producing|daytime hours)\b/.test(clean)) return "safety";
   if (/\b(?:electrical|power|outlet|circuit|amp|high-draw|task lighting|shop vacuum|shop-vac|source collection|dust control|airflow|ventilation|garage door)\b/.test(clean)) return "infrastructure";
   if (/\b(?:mobile|movable|folding|reset|multi-use|more than one use|household storage|bicycle|access path|work surface|workbench|tool storage|rolling(?:\s+\w+){0,3}\s+cart|cart(?:\s+\w+){0,3}\s+storage|layout|zone)\b/.test(clean)) return "workspace";
   if (/\b(?:parent brand|product family|sub-brand|subbrand|ecosystem|company promise|positioned under|relate to the parent|editorial hierarchy)\b/.test(clean)) return "product";
   if (/\b(?:next\.js|typescript|tailwind|vercel|github|react|api|database|framework|deployment|hosting|technology stack|tech stack)\b/.test(clean)) return "technical";
   if (/\b(?:deadline|target date|launch date|due date|schedule|calendar|time block)\b/.test(clean)) return "schedule";
   if (/\b(?:scope|first version|phase one|phase-one|will not include|excluded|avoid turning|professional production|heavy milling|large cabinet)\b/.test(clean)) return "scope";
   return "other";
}

function isPersistentPurchaseLine(value?: string) {
   const clean = cleanAuthoritativeStatement(value, 1800);
   if (!clean) return false;
   return /^[-*•]?\s*[^:]{2,140}:\s*\$\s*[\d,]+/i.test(clean) || /\b(?:purchased|installed|bought|acquired)\b[^.]{0,220}:\s*\$\s*[\d,]+/i.test(clean);
}

function normalizePersistentClause(value?: string) {
   return cleanAuthoritativeStatement(value, 2200)
      .replace(/^[-*•\d.)\s]+/, "")
      .replace(/[.!?]+$/, "")
      .trim();
}

function extractDeferredScopeItems(values: string[]) {
   const items: string[] = [];

   for (const value of values) {
      const clean = normalizePersistentClause(value);
      if (!clean) continue;
      if (/\b(?:major-tool purchase|major tool purchase|track saw|table saw|miter saw|\$\s*[\d,]+\s+reserve)\b/i.test(clean)) continue;

      const prefixMatch = clean.match(/^(.+?)\s+(?:are|is|remain|remains|will remain|will be)\s+(?:deferred|not included|excluded|outside\b)/i);
      const notIncludeMatch = clean.match(/\b(?:will not include|does not include|do not include)\s+(.+)$/i);
      const noMatch = clean.match(/^no\s+(.+?)\s+(?:was|were|will be)\s+(?:purchased|added|installed|included)$/i);
      const rawList = prefixMatch?.[1] || notIncludeMatch?.[1] || noMatch?.[1] || "";
      if (!rawList) continue;

      const normalizedList = rawList
         .replace(/^(?:a|an|the|expansion upgrades?|optional upgrades?)\s+/i, "")
         .replace(/\b(?:during|for|in)\s+(?:the\s+)?(?:first|initial|current|phase[- ]one)\s+(?:setup|phase|budget).*$/i, "")
         .trim();
      const splitItems = normalizedList
         .split(/\s*,\s*|\s+and\s+/i)
         .map((item) => item.replace(/^(?:a|an|the|and|or)\s+/i, "").trim())
         .map((item) => item.replace(/\b(?:are|is)\s*$/i, "").trim())
         .filter((item) => item.length >= 3 && item.length <= 120)
         .filter((item) => !/\b(?:reserve|contingency|track saw|table saw|miter saw|major-tool purchase|major tool purchase)\b/i.test(item));
      items.push(...splitItems);
   }

   return uniqueProjectFacts(items, 12);
}

function choosePersistentDecisionFact(facts: string[], include: RegExp, exclude?: RegExp) {
   return (
      facts
         .filter((fact) => include.test(fact) && !exclude?.test(fact))
         .slice()
         .sort((left, right) => getPersistentDecisionCandidateScore(right, 0) - getPersistentDecisionCandidateScore(left, 0))[0] || ""
   );
}

function joinPersistentDecisionClauses(values: string[]) {
   return uniqueProjectFacts(values.map((value) => cleanAuthoritativeStatement(value, 1800)).filter(Boolean), 8)
      .map((value) => value.replace(/[.!?]+$/, ""))
      .filter(Boolean)
      .join("; ");
}

function summarizePersistentDecisionTopic(topic: PersistentDecisionTopic, facts: string[], packet: ProjectIntelligencePacket) {
   if (!facts.length) return "";

   if (topic === "budget") {
      const budget = getPersistentBudgetReadback(packet);
      const clauses = [
         typeof budget.limit === "number" ? `the recorded phase-one limit is ${formatProjectMoney(budget.limit)}` : "",
         typeof budget.actualSpent === "number" ? `${formatProjectMoney(budget.actualSpent)} was spent on required purchases` : "",
         typeof budget.contingencyRemaining === "number" ? `${formatProjectMoney(budget.contingencyRemaining)} remains available as contingency` : "",
         typeof budget.protectedReserve === "number" ? `${formatProjectMoney(budget.protectedReserve)} remains protected for a future major purchase` : "",
      ].filter(Boolean);
      return clauses.length ? `Budget and reserves: ${clauses.join("; ")}` : `Budget and resources: ${joinPersistentDecisionClauses(facts.slice(0, 2))}`;
   }

   if (topic === "tool-strategy") {
      const eligibleFacts = facts.filter((fact) => !/\b(?:reserve|contingency)\b/i.test(fact));
      const deferred = choosePersistentDecisionFact(eligibleFacts, /\b(?:decided not to purchase|major-tool purchase is deferred|major tool purchase is deferred|no major power tool|will not purchase a major)\b/i);
      const future = choosePersistentDecisionFact(eligibleFacts, /\btrack saw\b.*\b(?:leading|future|conditional|reconsider)\b/i);
      const table = choosePersistentDecisionFact(eligibleFacts, /(?:\b(?:will not|not purchase|excluded|deferred)\b[^.]{0,120}\btable saw\b|\btable saw\b[^.]{0,120}\b(?:excluded|will not|not purchase|deferred)\b)/i);
      const miter = choosePersistentDecisionFact(eligibleFacts, /(?:\bmiter saw\b.*\b(?:conditional|reconsider|only if)\b|\b(?:reconsider|conditional|only if)\b.*\bmiter saw\b)/i);
      const clauses = uniqueProjectFacts([deferred, future, table, miter].filter(Boolean), 4);
      return clauses.length ? `Major-tool strategy: ${joinPersistentDecisionClauses(clauses)}` : `Major-tool strategy: ${joinPersistentDecisionClauses(eligibleFacts.slice(0, 3))}`;
   }

   if (topic === "workspace") {
      const corpus = `${facts.join(" ")} ${getRecordedProjectResolutionCorpus(packet)}`.toLowerCase();
      const clauses = [
         /\b(?:mobile|movable|folding)\b/.test(corpus) ? "work surfaces and tool storage remain mobile or folding" : "",
         /\b(?:more than one use|multi-use|household storage|bicycle)\b/.test(corpus) ? "the workspace remains available for its other uses" : "",
         /\b(?:central access path|center access path|clear access path|center path|large-item movement|move larger items)\b/.test(corpus) ? "the main access path stays clear" : "",
         /\b(?:easy to reset|can be reset|reset process|after each project|after a work session)\b/.test(corpus) ? "the setup remains easy to reset after each work session" : "",
      ].filter(Boolean);
      return clauses.length ? `Workspace operating model: ${clauses.join("; ")}` : `Workspace operating model: ${joinPersistentDecisionClauses(facts.slice(0, 2))}`;
   }

   if (topic === "infrastructure") {
      const power = choosePersistentDecisionFact(facts, /\b(?:15-amp|high-draw|electrical capacity|circuit is sufficient|circuit.*sufficient)\b/i);
      const lighting = choosePersistentDecisionFact(facts, /\b(?:task lighting|bright led|lighting works|lighting will be)\b/i);
      const dust = choosePersistentDecisionFact(facts, /\b(?:dust will be controlled|source collection|shop-vac source collection|shop vacuum connected|shop-vac connected)\b/i, /\b(?:15-amp|high-draw|circuit)\b/i);
      const airflow = choosePersistentDecisionFact(facts, /\b(?:airflow|ventilation|garage door)\b/i);
      const clauses = uniqueProjectFacts([power, lighting, dust, airflow].filter(Boolean), 4);
      return clauses.length ? `Infrastructure and operating limits: ${joinPersistentDecisionClauses(clauses)}` : `Infrastructure and operating limits: ${joinPersistentDecisionClauses(facts.slice(0, 3))}`;
   }

   if (topic === "safety") {
      const eligibleFacts = facts.filter((fact) => !isPersistentPurchaseLine(fact));
      const storageFact = choosePersistentDecisionFact(eligibleFacts, /\b(?:flammable|chemical|finish storage|approved closed cabinet)\b/i);
      const ppeFact = choosePersistentDecisionFact(eligibleFacts, /\b(?:ppe|eye protection|hearing protection|respiratory protection|safety equipment)\b/i);
      const noiseFact = choosePersistentDecisionFact(eligibleFacts, /\b(?:noise-producing|daytime hours|hearing protection.*cutting|hearing protection.*sanding)\b/i);
      const corpus = `${facts.join(" ")} ${getRecordedProjectResolutionCorpus(packet)}`.toLowerCase();
      const storage =
         storageFact || (/\b(?:chemicals?|finishes?|flammables?)\b/.test(corpus) && /\b(?:approved|closed|cabinet|storage|stored)\b/.test(corpus) ? "finishes and chemicals remain in approved closed storage away from outlets, sparks, and heat" : "");
      const ppe = ppeFact || (/\b(?:eye|hearing|respiratory|ppe|safety equipment)\b/.test(corpus) ? "eye, hearing, and respiratory protection remain required" : "");
      const noise = noiseFact || (/\b(?:noise|daytime)\b/.test(corpus) ? "noise-producing work remains limited to appropriate daytime hours" : "");
      const clauses = uniqueProjectFacts([storage, ppe, noise].filter(Boolean), 3);
      return clauses.length ? `Safety and operating controls: ${joinPersistentDecisionClauses(clauses)}` : "";
   }

   if (topic === "deferred") {
      const budgetMilestone = getAuthoritativeMilestones(packet)
         .filter((milestone) => getMilestoneGuidanceCategory(milestone.title) === "budget")
         .slice()
         .sort((left, right) => right.order - left.order)[0];
      const budgetDeferred = getProjectBudgetSnapshot(packet, budgetMilestone).deferred;
      const explicitItems = extractDeferredScopeItems([...facts, ...budgetDeferred]);
      if (explicitItems.length) {
         return `Deferred scope and upgrades: ${formatNaturalActionSeries(explicitItems)} remain outside the current phase`;
      }
      const explicit = facts
         .filter((fact) => !/\b(?:major-tool purchase|track saw|table saw|miter saw|reserve)\b/i.test(fact))
         .slice()
         .sort((left, right) => right.length - left.length)[0];
      return explicit ? `Deferred scope and upgrades: ${normalizePersistentClause(explicit)}` : "";
   }

   if (topic === "scope") return `Scope boundary: ${joinPersistentDecisionClauses(facts.slice(0, 2))}`;
   if (topic === "product") return `Product and positioning decisions: ${joinPersistentDecisionClauses(facts.slice(0, 3))}`;
   if (topic === "technical") return `Technical implementation decisions: ${joinPersistentDecisionClauses(facts.slice(0, 3))}`;
   if (topic === "schedule") return `Timing decisions: ${joinPersistentDecisionClauses(facts.slice(0, 2))}`;
   return facts[0] || "";
}

function getPersistentDecisionReadback(packet: ProjectIntelligencePacket, limit = 8) {
   const milestones = getAuthoritativeMilestones(packet);
   const candidates: Array<{ fact: string; score: number }> = [];

   for (const milestone of milestones) {
      if (milestone.status !== "complete") continue;
      for (const fact of getRecordedMilestoneDecisionFacts(milestone, 30)) {
         const clean = cleanDecisionRequirementFact(fact);
         if (!clean) continue;
         candidates.push({ fact: clean, score: getPersistentDecisionCandidateScore(clean, milestone.order) });
      }
   }

   for (const fact of getAuthoritativeConfirmedDecisions(packet)) {
      const clean = cleanDecisionRequirementFact(fact);
      if (!clean) continue;
      candidates.push({ fact: clean, score: getPersistentDecisionCandidateScore(clean, 0) + 8 });
   }

   const resolutionCorpus = getRecordedProjectResolutionCorpus(packet);
   const seenSemanticKeys = new Set<string>();
   const raw: string[] = [];

   for (const candidate of candidates
      .filter((item) => item.score > -20)
      .filter((item) => !isUnresolvedMilestoneInputFact(item.fact))
      .filter((item) => !/\b(?:should confirm|needs? to confirm|have not been finalized|not yet finalized)\b/i.test(item.fact))
      .filter((item) => !projectUpdateResolvesRecordedDecision(item.fact, resolutionCorpus) || !isUnresolvedMilestoneInputFact(item.fact))
      .sort((left, right) => right.score - left.score)) {
      const key = getPersistentDecisionSemanticKey(candidate.fact);
      if (key && seenSemanticKeys.has(key)) continue;
      if (raw.some((earlier) => getProjectFactOverlapRatio(candidate.fact, earlier) >= 0.72)) continue;
      if (key) seenSemanticKeys.add(key);
      raw.push(candidate.fact);
   }

   const groups = new Map<PersistentDecisionTopic, string[]>();
   for (const fact of raw) {
      const topic = getPersistentDecisionTopic(fact);
      groups.set(topic, [...(groups.get(topic) || []), fact]);
   }

   // Scope exclusions and deferred infrastructure describe the same enduring
   // boundary. Merge them so completed-project readbacks stay compact.
   const mergedDeferred = uniqueProjectFacts([...(groups.get("deferred") || []), ...(groups.get("scope") || [])], 20);
   if (mergedDeferred.length) groups.set("deferred", mergedDeferred);
   groups.delete("scope");

   // Monetary totals that are not themselves durable decisions should not leak
   // into a detached "other" bullet once a budget summary exists.
   if (groups.has("budget") && groups.has("other")) {
      groups.set(
         "other",
         (groups.get("other") || []).filter((fact) => !(/\$\s*[\d,]+/.test(fact) && /\b(?:total|assigned|allocated|spent|reserve|contingency|required categories?)\b/i.test(fact))),
      );
   }

   const order: PersistentDecisionTopic[] = ["budget", "tool-strategy", "workspace", "infrastructure", "safety", "deferred", "product", "technical", "schedule", "other"];
   const summaries: string[] = [];

   for (const topic of order) {
      // Once six governing themes are available, raw uncategorized history is
      // lower priority and usually reintroduces detail already summarized above.
      if (topic === "other" && summaries.length >= 6) continue;
      const summary = summarizePersistentDecisionTopic(topic, groups.get(topic) || [], packet);
      if (!summary) continue;
      if (summaries.some((earlier) => getProjectFactOverlapRatio(summary, earlier) >= 0.74)) continue;
      summaries.push(summary);
      if (summaries.length >= limit) break;
   }

   return summaries;
}

interface PersistentBudgetReadback {
   limit?: number;
   plannedRequired?: number;
   actualSpent?: number;
   contingencyRemaining?: number;
   protectedReserve?: number;
}

function findRecordedAmount(corpus: string, patterns: RegExp[]) {
   for (const pattern of patterns) {
      const match = corpus.match(pattern);
      const amount = parseProjectMoney(match?.[1]);
      if (typeof amount === "number") return amount;
   }
   return undefined;
}

function getPersistentBudgetReadback(packet: ProjectIntelligencePacket): PersistentBudgetReadback {
   const corpus = [
      packet.projectUnderstanding.situation,
      ...packet.projectUnderstanding.confirmedDecisions.map((decision) => decision.statement),
      ...getAuthoritativeMilestones(packet).flatMap((milestone) => [milestone.workingContent, ...milestone.decisions, ...milestone.completionEvidence]),
   ]
      .filter(Boolean)
      .join("\n")
      .replace(/\r/g, "\n")
      .slice(0, 70000);

   return {
      limit: findRecordedAmount(corpus, [
         /\b(?:phase[- ]one|first[- ]phase)\s+budget\b[^$]{0,100}\b(?:capped at|limited to|at or below|under|limit(?: is| of)?|maximum(?: is| of)?)\s*\$\s*([\d,]+(?:\.\d{1,2})?)/i,
         /\$\s*([\d,]+(?:\.\d{1,2})?)\s+(?:phase[- ]one|first[- ]phase)\s+(?:budget\s+)?limit\b/i,
      ]),
      plannedRequired: findRecordedAmount(corpus, [
         /\b(?:required(?: workspace and safety)? categories?|required workspace and safety needs|assigned to required workspace and safety needs)\b[^$]{0,120}\b(?:total|are|is|assigned|allocated)\b[^$]{0,50}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
         /\$\s*([\d,]+(?:\.\d{1,2})?)\b[^.]{0,100}\b(?:assigned|allocated)\b[^.]{0,100}\brequired\b/i,
      ]),
      actualSpent: findRecordedAmount(corpus, [
         /\b(?:required purchases?|actual purchases?|phase[- ]one purchases?)\b[^$]{0,100}\b(?:totaled|cost|were|are|spent)\b[^$]{0,50}\$\s*([\d,]+(?:\.\d{1,2})?)/i,
         /\$\s*([\d,]+(?:\.\d{1,2})?)\b[^.]{0,80}\b(?:was|were|has been|is)\s+(?:spent|used)\b/i,
      ]),
      contingencyRemaining: findRecordedAmount(corpus, [
         /\$\s*([\d,]+(?:\.\d{1,2})?)\s+contingency\b[^.]{0,100}\b(?:remains?|is)\s+(?:unspent|available|untouched|remaining)\b/i,
         /\bcontingency\b[^$]{0,80}\$\s*([\d,]+(?:\.\d{1,2})?)\b[^.]{0,80}\b(?:unspent|available|untouched|remaining)\b/i,
      ]),
      protectedReserve: findRecordedAmount(corpus, [
         /\$\s*([\d,]+(?:\.\d{1,2})?)\s+(?:major[- ]tool|tool|purchase)?\s*reserve\b[^.]{0,120}\b(?:remains?|is|will remain)\s+(?:untouched|reserved|available|intact)\b/i,
         /\b(?:reserve|reserved)\b[^$]{0,80}\$\s*([\d,]+(?:\.\d{1,2})?)\b/i,
      ]),
   };
}

function splitMaterialReadbackFacts(value?: string) {
   const clean = cleanAuthoritativeStatement(value, 20000)
      .replace(/\r/g, "\n")
      .replace(/[•·]\s*/g, "\n")
      .replace(/\s+-\s+(?=[A-Z0-9])/g, "\n")
      .trim();
   if (!clean) return [] as string[];

   return clean
      .split(/(?<=[.!?])\s+|\n+|;\s+(?=[A-Z])/)
      .map((item) => cleanAuthoritativeStatement(item, 2400))
      .filter((item) => item.length >= 18);
}

function getMaterialResolutionCandidates(packet: ProjectIntelligencePacket) {
   return getAuthoritativeMilestones(packet)
      .filter((milestone) => milestone.status === "complete")
      .slice()
      .sort((left, right) => right.order - left.order)
      .flatMap((milestone) => getRecordedMilestoneDecisionFacts(milestone, 30))
      .concat(getAuthoritativeConfirmedDecisions(packet))
      .map((fact) => cleanDecisionRequirementFact(fact))
      .filter(Boolean)
      .filter((fact) => !isUnresolvedMilestoneInputFact(fact));
}

function getResolutionForMaterialFinding(finding: string, packet: ProjectIntelligencePacket) {
   const candidates = getMaterialResolutionCandidates(packet)
      .filter((candidate) => projectUpdateResolvesRecordedDecision(finding, candidate))
      .sort((left, right) => {
         const overlapDifference = getProjectFactOverlapRatio(finding, right) - getProjectFactOverlapRatio(finding, left);
         if (Math.abs(overlapDifference) > 0.01) return overlapDifference;
         return getPersistentDecisionCandidateScore(right, 0) - getPersistentDecisionCandidateScore(left, 0);
      });
   return candidates[0] || "";
}

function getUsedMaterialReadback(packet: ProjectIntelligencePacket) {
   const understandingById = new Map(packet.projectUnderstanding.materials.map((material) => [material.id, material]));
   const resolutionCorpus = getRecordedProjectResolutionCorpus(packet);
   const materialEvidence = packet.evidence.filter((evidence) => evidence.source === "material").map((evidence) => evidence.text);

   return packet.materials.map((material) => {
      const understanding = understandingById.get(material.id);
      const normalizedTitle = normalizePrompt(material.title);
      const evidenceQuotes = packet.projectUnderstanding.confirmedDecisions
         .flatMap((decision) => decision.evidence)
         .filter((evidence) => evidence.sourceType === "material" && (!evidence.sourceId || evidence.sourceId === material.id))
         .map((evidence) => evidence.quote);
      const rawFacts = uniqueProjectFacts(
         [
            ...splitMaterialReadbackFacts(material.summary),
            ...splitMaterialReadbackFacts(material.details),
            ...splitMaterialReadbackFacts(understanding?.usefulContext),
            ...materialEvidence.filter((fact) => packet.materials.length === 1 || getProjectFactOverlapRatio(fact, `${material.title} ${material.details}`) >= 0.24),
            ...evidenceQuotes,
         ]
            .map((fact) => {
               const clean = cleanAuthoritativeStatement(fact, 2400);
               return normalizePrompt(clean).startsWith(normalizedTitle)
                  ? clean
                       .slice(material.title.length)
                       .replace(/^\s*(?:reference)?\s*:\s*/i, "")
                       .trim()
                  : clean;
            })
            .filter(Boolean)
            .filter((fact) => normalizePrompt(fact) !== normalizedTitle)
            .filter((fact) => !/^(?:reference|document|source)$/i.test(fact)),
         20,
      );
      const currentFindings = rawFacts
         .filter((fact) => !materialFindingHasBeenSuperseded(fact, resolutionCorpus))
         .filter((fact, index, all) => !all.slice(0, index).some((earlier) => getProjectFactOverlapRatio(fact, earlier) >= 0.76))
         .slice(0, 8);
      const resolvedRecommendations = rawFacts
         .filter((fact) => materialFindingHasBeenSuperseded(fact, resolutionCorpus))
         .map((finding) => ({ finding, resolution: getResolutionForMaterialFinding(finding, packet) }))
         .filter((item) => item.resolution)
         .filter((item, index, all) => !all.slice(0, index).some((earlier) => getProjectFactOverlapRatio(item.finding, earlier.finding) >= 0.72))
         .slice(0, 3);

      return {
         title: material.title,
         findings: currentFindings,
         resolvedRecommendations,
         relatedMilestones: uniqueProjectFacts(understanding?.relatedMilestones || [], 4),
         decisionsAffected: uniqueProjectFacts(understanding?.decisionsAffected || [], 4),
      };
   });
}

function getPriorityProjectFact(packet: ProjectIntelligencePacket) {
   const milestone = getAuthoritativeActiveMilestone(packet);

   if (milestone) {
      const next = getFollowingMilestone(packet, milestone);
      return {
         title: formatMilestoneOpenStateFact(milestone.title),
         detail: buildMilestoneRelationshipRationale(packet, milestone, next),
         kind: "fact" as const,
      };
   }

   const decision = getPriorityProjectDecision(packet, milestone);
   if (decision) {
      return {
         title: decision,
         detail: getPriorityDecisionReason(packet, decision) || "Resolving it changes the work that follows.",
         kind: "decision" as const,
      };
   }

   return {
      title: packet.projectUnderstanding.goal || packet.projectGoal,
      detail: packet.projectUnderstanding.situation,
      kind: "fact" as const,
   };
}

function getReadableProjectSubjectName(projectTitle?: string) {
   const clean = cleanAuthoritativeStatement(projectTitle, 400)
      .replace(/\b(?:software company launch|company launch|website launch|product launch|project launch)\b/gi, "")
      .replace(/\bproject\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
   return clean || cleanAuthoritativeStatement(projectTitle, 400) || "the project";
}

function getPriorityDecisionStatement(packet: ProjectIntelligencePacket) {
   const understanding = packet.projectUnderstanding;
   const active = getAuthoritativeActiveMilestone(packet);
   const explicit = understanding.unresolvedDecisions.map((item) => cleanAuthoritativeStatement(item.statement)).find(Boolean);
   if (explicit) return explicit;

   const milestoneQuestion = active?.openQuestions.map((item) => cleanAuthoritativeStatement(item)).find(Boolean);
   if (milestoneQuestion) return milestoneQuestion;

   const title = cleanAuthoritativeStatement(active?.title).replace(/[.!?]+$/, "");
   const searchable = title.toLowerCase();
   const projectName = getReadableProjectSubjectName(packet.projectTitle);

   if (/\b(?:brand|language|promise|positioning|identity|message)\b/.test(searchable)) {
      return `What should ${projectName}’s company promise be?`;
   }

   return milestoneTitleToDecisionQuestion(title);
}

function buildWeakDecisionAssessment(packet: ProjectIntelligencePacket) {
   const active = getAuthoritativeActiveMilestone(packet);
   const next = active ? getFollowingMilestone(packet, active) : undefined;
   const title = cleanAuthoritativeStatement(active?.title).replace(/[.!?]+$/, "");
   const searchable = title.toLowerCase();
   const projectName = getReadableProjectSubjectName(packet.projectTitle);

   if (/\b(?:brand|language|promise|positioning|identity|message)\b/.test(searchable)) {
      return `A weak decision would be a company promise that is so broad it could describe almost any company, so narrow it only fits one part of ${projectName}, or so polished that it sounds good without helping the project decide how its parts belong together.`;
   }

   if (/\b(?:relationship|parent|ecosystem|family|portfolio|role)\b/.test(searchable)) {
      return "A weak decision would give the parts overlapping roles, leave the hierarchy ambiguous, or describe the relationship without giving the next structure or workflow a clear standard to follow.";
   }

   if (/\b(?:scope|audience|participant|user|customer)\b/.test(searchable)) {
      return "A weak decision would name a broad audience or scope without ruling anything out, leaving later content, access, budget, and workflow choices just as uncertain as before.";
   }

   const nextLabel = next?.title ? ` It would also fail to give ${next.title.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} a concrete standard.` : "";
   return `A weak decision would restate the milestone without resolving the real choice, ignore the project’s constraints, or remain too vague to change the work that follows.${nextLabel}`;
}

function buildWorkReadinessStandard(packet: ProjectIntelligencePacket, conversation: ProjectGuidanceConversationContext) {
   const active = getAuthoritativeActiveMilestone(packet);
   if (!active) return [];
   const title = cleanAuthoritativeStatement(active.title).replace(/[.!?]+$/, "");
   const searchable = title.toLowerCase();
   const next = getFollowingMilestone(packet, active);

   if (/\b(?:brand|language|promise|positioning|identity|message)\b/.test(searchable)) {
      return [
         "The statement explains the company-level promise in one clear sentence",
         "It fits every major product or part of the project without becoming generic",
         "It rules out at least one direction that does not belong",
         next?.title ? `It gives the next milestone—${next.title.replace(/[.!?]+$/, "")}—a usable standard` : "It gives the next project decision a usable standard",
      ];
   }

   const recorded = getMilestoneCompletionChecks(packet, active)
      .map((item) => cleanAuthoritativeStatement(item))
      .filter(Boolean)
      .filter((item) => !/^A supported answer is recorded for:/i.test(item))
      .slice(0, 4);
   if (recorded.length) return recorded;

   const lastRecommendation = cleanAuthoritativeStatement(conversation.lastRecommendation);
   return uniqueProjectFacts(
      [
         lastRecommendation ? `A concrete version of ${lastRecommendation.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} exists` : "A concrete result exists",
         "The result has been tested against the project goal and confirmed constraints",
         next?.title ? `The result gives ${next.title.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} enough clarity to begin` : "The result is clear enough to support the next decision",
      ],
      4,
   );
}

function getReferencedMilestone(packet: ProjectIntelligencePacket, conversation: ProjectGuidanceConversationContext, preferActive = false) {
   if (!preferActive) {
      const remembered = findMilestoneByConversationSubject(packet, conversation);
      if (remembered) return remembered;
   }
   return getAuthoritativeActiveMilestone(packet);
}

function isRecordedMilestoneSequenceComplete(packet: ProjectIntelligencePacket) {
   const milestones = getAuthoritativeMilestones(packet);
   return milestones.length > 0 && milestones.every((milestone) => milestone.status === "complete") && !getAuthoritativeActiveMilestone(packet);
}

function getCompletedProjectReasoningCorpus(packet: ProjectIntelligencePacket) {
   return [
      packet.projectUnderstanding.goal,
      packet.projectUnderstanding.successState,
      ...packet.projectUnderstanding.successCriteria.map((criterion) => criterion.statement),
      ...packet.projectUnderstanding.confirmedDecisions.map((decision) => decision.statement),
      ...packet.projectUnderstanding.constraints.map((constraint) => constraint.statement),
      ...getAuthoritativeMilestones(packet).flatMap((milestone) => [milestone.title, milestone.goal, milestone.whyItMatters, milestone.workingContent, ...milestone.decisions, ...milestone.completionCriteria, ...milestone.completionEvidence]),
      ...packet.materials.flatMap((material) => [material.title, material.summary, material.details]),
   ]
      .filter(Boolean)
      .join("\n")
      .replace(/\r/g, "\n")
      .slice(0, 120000);
}

function getCompletedProjectValidationObservations(packet: ProjectIntelligencePacket) {
   const corpus = getCompletedProjectReasoningCorpus(packet).toLowerCase();
   const observations: string[] = [];

   if (/\b(?:accuracy|straight cuts?|guide|track saw|sheet goods?|plywood)\b/i.test(corpus)) {
      observations.push("Straight-cut accuracy and whether sheet goods can be handled without repeated correction or unsafe positioning");
   }
   if (/\b(?:crosscuts?|repeated cuts?|repeatability|miter saw)\b/i.test(corpus)) {
      observations.push("Crosscut repeatability and whether repeated cuts become the dominant workflow bottleneck");
   }
   if (/\b(?:setup effort|setup time|reset|folding|mobile|movable)\b/i.test(corpus)) {
      observations.push("Setup and reset time, including whether mobile or folding surfaces are easy enough to use consistently");
   }
   if (/\b(?:dust|shop-vac|shop vacuum|source collection|cleanup)\b/i.test(corpus)) {
      observations.push("Dust escaping source collection, cleanup effort, and whether hoses interfere with the work");
   }
   if (/\b(?:access path|walkway|bicycle|household storage|storage friction|garage access)\b/i.test(corpus)) {
      observations.push("Storage and access friction, including whether tools, hoses, or workpieces block the shared path");
   }
   if (/\b(?:15-amp|high-draw|circuit|electrical|power)\b/i.test(corpus)) {
      observations.push("Whether the recorded electrical operating limit causes interruptions or unsafe workarounds during real use");
   }
   if (/\b(?:airflow|ventilation|finishing|chemical|flammable)\b/i.test(corpus)) {
      observations.push("Whether airflow, finishing, and chemical-storage controls remain practical during an actual work session");
   }

   return uniqueProjectFacts(
      observations.length
         ? observations
         : ["Quality and repeatability of the finished work", "Setup, operating, cleanup, and reset effort", "Safety or reliability issues that only appear during real use", "Any repeated limitation that would justify spending the protected reserve"],
      8,
   );
}

function getCompletedProjectStrengthDraft(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const corpus = getCompletedProjectReasoningCorpus(packet);
   const budget = getPersistentBudgetReadback(packet);
   const qualities: string[] = [];
   if (/\b(?:safety|ppe|chemical storage|source collection|electrical|lighting)\b/i.test(corpus)) qualities.push("safe");
   if (/\b(?:mobile|movable|folding|reset)\b/i.test(corpus)) qualities.push("mobile and resettable");
   if (/\b(?:tested|usable|installed|implemented)\b/i.test(corpus)) qualities.push("usable and tested");
   if (typeof budget.actualSpent === "number" || typeof budget.protectedReserve === "number") qualities.push("financially disciplined");
   const readableQualities = qualities.length ? qualities.join(", ").replace(/, ([^,]+)$/, ", and $1") : "usable and intentionally limited";
   const budgetDetail = typeof budget.protectedReserve === "number" ? ` It also preserved ${formatProjectMoney(budget.protectedReserve)} for a later decision instead of forcing an early expansion purchase.` : "";

   return {
      currentUnderstanding: `The strongest part of the completed result is that it is ${readableQualities} without being overbuilt.`,
      assessment: `The project settled the operating limits, safety controls, layout, and required first-version resources before committing to optional expansion.${budgetDetail}`,
      recommendation: "Protect that discipline during real use: change the setup only when repeated evidence points to a specific limitation.",
      reason: "",
      watchOut: "",
      evidenceUsed: uniqueProjectFacts([corpus, typeof budget.protectedReserve === "number" ? formatProjectMoney(budget.protectedReserve) : ""], 8),
   };
}

function getCompletedProjectRiskDraft(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const observations = getCompletedProjectValidationObservations(packet);
   const validationFact = getValidationBeforeExpansionFact(packet);

   return {
      currentUnderstanding: "The biggest remaining risk is mistaking a successfully completed setup for a fully validated workflow.",
      assessment: `The recorded sequence proves that the first version was planned, built, and tested, but real use may still expose friction in ${observations
         .slice(0, 4)
         .map((item) => item.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase()))
         .join(", ")}.`,
      recommendation: validationFact ? ensureSentence(validationFact) : "Use the first few real projects to separate one-off inconvenience from a repeated limitation before changing the completed setup.",
      reason: "",
      watchOut: "",
      evidenceUsed: uniqueProjectFacts([validationFact, ...observations], 10),
   };
}

function getCompletedProjectObservationDraft(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const observations = getCompletedProjectValidationObservations(packet);
   const budget = getPersistentBudgetReadback(packet);
   const reserve = typeof budget.protectedReserve === "number" ? formatProjectMoney(budget.protectedReserve) : "the protected reserve";

   return {
      currentUnderstanding: `Before spending ${reserve}, observe the completed setup across several real uses rather than judging it from one session.`,
      assessment: observations.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n"),
      recommendation: "Record repeated friction, not isolated annoyance. A purchase should solve a limitation that appears across more than one real project.",
      reason: "",
      watchOut: "",
      evidenceUsed: observations,
   };
}

function getPromptReconsideredOption(prompt: string, packet: ProjectIntelligencePacket) {
   const match = prompt.match(/\breconsider(?:ing)?\s+(?:the\s+)?([^?.,]+?)(?:\s+package)?(?:\?|$)/i);
   const fromPrompt = cleanAuthoritativeStatement(match?.[1], 180).replace(/[.!?]+$/, "");
   if (fromPrompt) return fromPrompt;
   const decisions = getPersistentDecisionReadback(packet, 12);
   const conditional = decisions.find((decision) => /\b(?:leading future option|conditional|reconsider)\b/i.test(decision));
   const tool = conditional?.match(/\b([A-Za-z0-9-]+(?:\s+[A-Za-z0-9-]+){0,3}\s+saw)\b/i)?.[1];
   return cleanAuthoritativeStatement(tool, 180).replace(/[.!?]+$/, "");
}

function getConditionalOptionReconsiderationDraft(prompt: string, packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const option = getPromptReconsideredOption(prompt, packet) || "the deferred option";
   const corpus = getCompletedProjectReasoningCorpus(packet);
   const decisions = getPersistentDecisionReadback(packet, 14);
   const optionDecision = decisions.find((decision) => normalizePrompt(decision).includes(normalizePrompt(option)) && /\b(?:if|when|conditional|reconsider)\b/i.test(decision));
   const recordedCondition = optionDecision?.match(/\bif\s+(.+?)(?=;\s*(?:I|We|The|A|An)\b|[.!?]\s+(?:I|We|The|A|An)\b|$)/i)?.[1]?.replace(/[.!?]+$/, "") || "real use repeatedly exposes the specific limitation that option is meant to solve";
   const likelySignals = getCompletedProjectValidationObservations(packet)
      .filter((item) => /\b(?:accuracy|sheet|setup|dust|crosscut|repeatability)\b/i.test(item))
      .slice(0, 4);

   return {
      currentUnderstanding: `Reconsider ${/^the\b/i.test(option) ? option : `the ${option}`} only if ${recordedCondition.replace(/^./, (character) => character.toLowerCase())}.`,
      assessment: likelySignals.length
         ? `The supporting evidence should be repeatable across more than one real project:\n${likelySignals.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
         : "The limitation should repeat across more than one real use and should be traceable to the current setup rather than technique, planning, or a one-off mistake.",
      recommendation: `Spend the reserve only when ${/^the\b/i.test(option) ? option : `the ${option}`} has a clear, evidence-backed advantage over the existing setup and that advantage justifies its cost, storage, and workflow tradeoffs.`,
      reason: "",
      watchOut: "",
      evidenceUsed: uniqueProjectFacts([optionDecision || "", corpus, ...likelySignals], 10),
   };
}

function getCompletedDecisionRetrospectiveDraft(packet: ProjectIntelligencePacket): ProfileGuidanceDraft {
   const budget = getPersistentBudgetReadback(packet);
   const validationFact = getValidationBeforeExpansionFact(packet);
   const observations = getCompletedProjectValidationObservations(packet);
   const reserve = typeof budget.protectedReserve === "number" ? formatProjectMoney(budget.protectedReserve) : "the protected reserve";

   return {
      currentUnderstanding: "Yes. Based on the recorded project evidence, postponing the major purchase was still the right decision.",
      assessment: `The first-version setup was completed without that purchase, ${reserve} remains protected, and no repeated real-world bottleneck has been recorded yet. The project therefore gained a usable result while preserving the ability to make a better-informed decision later.`,
      recommendation: validationFact
         ? ensureSentence(validationFact)
         : `Revisit the decision only if real use repeatedly exposes a limitation in ${observations
              .slice(0, 4)
              .map((item) => item.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase()))
              .join(", ")}.`,
      reason: "",
      watchOut: "",
      evidenceUsed: uniqueProjectFacts([validationFact, ...observations, reserve], 10),
   };
}

function buildAuthoritativeProjectConversationDraft(intent: ProjectGuidanceIntent, packet: ProjectIntelligencePacket, prompt: string, conversation: ProjectGuidanceConversationContext): ProfileGuidanceDraft | null {
   const understanding = packet.projectUnderstanding;
   const active = getAuthoritativeActiveMilestone(packet);
   const referenced = getReferencedMilestone(packet, conversation);
   const confirmed = getAuthoritativeConfirmedDecisions(packet);
   const unresolved = getAuthoritativeUnresolvedDecisions(packet);
   const situations = getSituationFacts(understanding.situation, 3);
   const success = uniqueProjectFacts(
      [understanding.successState, ...understanding.successCriteria.map((criterion) => criterion.statement)].map((item) => cleanAuthoritativeStatement(item)),
      2,
   );
   const constraints = getAuthoritativeConstraints(packet).slice(0, 3);
   const dependencies = getAuthoritativeDependencyStatements(packet).slice(0, 2);

   const sequenceComplete = isRecordedMilestoneSequenceComplete(packet);

   if (intent === "completed-project-strength") {
      return getCompletedProjectStrengthDraft(packet);
   }

   if (intent === "completed-project-risk") {
      return getCompletedProjectRiskDraft(packet);
   }

   if (intent === "completed-project-observations") {
      return getCompletedProjectObservationDraft(packet);
   }

   if (intent === "conditional-option-reconsideration") {
      return getConditionalOptionReconsiderationDraft(prompt, packet);
   }

   if (intent === "completed-decision-retrospective") {
      return getCompletedDecisionRetrospectiveDraft(packet);
   }

   if (intent === "completed-milestones") {
      const completed = getCompletedMilestoneReadback(packet);
      const allMilestones = getAuthoritativeMilestones(packet);
      const allComplete = allMilestones.length > 0 && completed.length === allMilestones.length;

      return {
         currentUnderstanding: completed.length ? `Completed milestones for ${packet.projectTitle}:` : `No completed milestones are recorded for ${packet.projectTitle}.`,
         assessment: completed.length ? completed.map((milestone, index) => `${index + 1}. ${ensureSentence(milestone.title)}`).join("\n") : "",
         recommendation: "",
         reason: allComplete ? `All ${completed.length} recorded milestone${completed.length === 1 ? " is" : "s are"} complete, and no active milestone remains.` : "",
         watchOut: "",
         evidenceUsed: completed.flatMap((milestone) => [milestone.title, ...milestone.completionEvidence.slice(0, 2)]),
      };
   }

   if (intent === "persistent-decisions") {
      const decisions = getPersistentDecisionReadback(packet, 8);
      return {
         currentUnderstanding: decisions.length ? `The most important decisions that remain in effect for ${packet.projectTitle} are:` : `No durable confirmed decisions are recorded for ${packet.projectTitle}.`,
         assessment: decisions.length ? decisions.map((decision, index) => `${index + 1}. ${ensureSentence(decision)}`).join("\n") : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: decisions,
      };
   }

   if (intent === "budget-memory") {
      const budget = getPersistentBudgetReadback(packet);
      const facts = [
         typeof budget.limit === "number" ? `Phase-one budget limit: ${formatProjectMoney(budget.limit)}` : "",
         typeof budget.plannedRequired === "number" ? `Planned required workspace and safety allocation: ${formatProjectMoney(budget.plannedRequired)}` : "",
         typeof budget.actualSpent === "number" ? `Actual required purchases: ${formatProjectMoney(budget.actualSpent)}` : "",
         typeof budget.contingencyRemaining === "number" ? `Contingency still available: ${formatProjectMoney(budget.contingencyRemaining)}` : "",
         typeof budget.protectedReserve === "number" ? `Protected reserve still untouched: ${formatProjectMoney(budget.protectedReserve)}` : "",
      ].filter(Boolean);

      return {
         currentUnderstanding: facts.length ? `The budget figures I remember for ${packet.projectTitle} are:` : `No reliable budget figures are recorded for ${packet.projectTitle}.`,
         assessment: facts.map((fact, index) => `${index + 1}. ${ensureSentence(fact)}`).join("\n"),
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: facts,
      };
   }

   if (intent === "material-history") {
      const materials = getUsedMaterialReadback(packet);
      const sections = materials.map((material) => {
         const findings = material.findings.length ? material.findings.map((finding, index) => `${index + 1}. ${ensureSentence(finding)}`).join("\n") : "No durable finding was extracted from this material.";
         const resolved = material.resolvedRecommendations.length
            ? `\n\nLater verified project evidence resolved:\n${material.resolvedRecommendations
                 .map((item, index) => `${index + 1}. Original recommendation: ${ensureSentence(item.finding)} Later verification: ${ensureSentence(item.resolution)}`)
                 .join("\n")}`
            : "";
         const informed = material.relatedMilestones.length ? `It informed: ${material.relatedMilestones.join("; ")}.` : material.decisionsAffected.length ? `It affected: ${material.decisionsAffected.join("; ")}.` : "";
         return `${material.title}\n\nIt established:\n${findings}${resolved}${informed ? `\n\n${informed}` : ""}`;
      });

      return {
         currentUnderstanding: materials.length === 1 ? `I used ${materials[0].title} as project evidence.` : materials.length > 1 ? `I used ${materials.length} project materials as evidence.` : "No project material has been used as recorded evidence.",
         assessment: sections.join("\n\n"),
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: materials.flatMap((material) => [material.title, ...material.findings]),
      };
   }

   if (intent === "project-facts") {
      const facts = uniqueProjectFacts(
         [
            understanding.goal ? formatAuthoritativeGoalFact(understanding.goal) : "",
            success[0] ? `A successful result means ${success[0].replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}` : "",
            situations[0] ? `Right now: ${situations[0].replace(/[.!?]+$/, "")}` : "",
            active ? `The active milestone is ${active.title.replace(/[.!?]+$/, "")}` : "",
            confirmed.length ? `Already decided: ${formatFactSeries(confirmed.slice(0, 3))}` : "",
            unresolved.length ? `The main open choices are: ${formatFactSeries(unresolved.slice(0, 3))}` : "",
            dependencies.length ? `The current sequence depends on this: ${formatFactSeries(dependencies)}` : "",
            constraints.length ? `The project must stay within these limits: ${formatFactSeries(constraints.slice(0, 2))}` : "",
         ],
         7,
      );

      return {
         currentUnderstanding: `Here is the project context I am actually using for ${packet.projectTitle}:`,
         assessment: facts.map((fact, index) => `${index + 1}. ${ensureSentence(fact)}`).join("\n"),
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: facts,
      };
   }

   if (intent === "priority-fact") {
      const priority = getPriorityProjectFact(packet);
      const statement = cleanAuthoritativeStatement(priority.title).replace(/[.!?]+$/, "");
      const opening =
         priority.kind === "decision" && /^(?:who|what|when|where|why|how|which|whether)\b/i.test(statement)
            ? `The most important open question right now is: ${formatAuthoritativeQuestion(statement)}`
            : `The most important fact right now is this: ${ensureSentence(statement)}`;

      return {
         currentUnderstanding: opening,
         assessment: priority.detail ? ensureSentence(priority.detail) : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([priority.title, priority.detail, active?.title || ""], 5),
      };
   }

   if (intent === "priority-rationale" || intent === "rationale") {
      const subjectMilestone = conversation.lastSubject?.kind === "milestone" ? findMilestoneByConversationSubject(packet, conversation) : undefined;
      const relatedMilestone = subjectMilestone || active;
      const next = relatedMilestone ? getFollowingMilestone(packet, relatedMilestone) : undefined;
      const rationale = buildMilestoneRelationshipRationale(packet, relatedMilestone, next);

      return {
         currentUnderstanding: "",
         assessment: rationale || "The current priority matters because it closes the dependency the next major decision relies on.",
         recommendation: "",
         reason: next ? ensureSentence(`Once that is settled, the project can move into ${formatMilestoneAsGerund(next.title).replace(/^./, (character) => character.toLowerCase())}`) : "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([relatedMilestone?.title || "", rationale, next?.title || ""], 5),
      };
   }

   if (intent === "decision-impact") {
      const subjectMilestone = conversation.lastSubject?.kind === "milestone" ? findMilestoneByConversationSubject(packet, conversation) : undefined;
      const milestone = subjectMilestone || active;
      const downstream = milestone ? getFollowingMilestone(packet, milestone) : undefined;
      const explicitCandidates = uniqueProjectFacts(
         [...(milestone?.openQuestions || []), ...(milestone?.decisions || []), ...unresolved].map((item) => cleanAuthoritativeStatement(item)),
         6,
      );
      const explicitDecision = explicitCandidates.find((item) => !conversation.lastSubject?.title || getProjectFactOverlapRatio(item, conversation.lastSubject.title) < 0.82);
      const inferredDecision = downstream ? milestoneTitleToDecisionQuestion(downstream.title) : milestoneTitleToDecisionQuestion(milestone?.title);
      const decision = explicitDecision || inferredDecision;
      const rationale = buildMilestoneRelationshipRationale(packet, milestone, downstream);

      return {
         currentUnderstanding: decision ? `It affects the next major decision: ${formatAuthoritativeQuestion(decision)}` : "The saved project does not identify a separate downstream decision yet.",
         assessment: downstream ? buildDecisionImpactExplanation(downstream.title) : rationale,
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([decision || "", downstream?.title || "", rationale], 6),
      };
   }

   if (intent === "subject-unlock") {
      const subjectMilestone = findMilestoneByConversationSubject(packet, conversation) || active;
      const next = subjectMilestone ? getFollowingMilestone(packet, subjectMilestone) : undefined;
      const rationale = buildMilestoneRelationshipRationale(packet, subjectMilestone, next);

      return {
         currentUnderstanding: next
            ? `${formatMilestoneAsGerund(subjectMilestone?.title).replace(/^./, (character) => character.toUpperCase())} unlocks the next milestone: ${next.title.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toUpperCase())}.`
            : understanding.whatItUnlocks
              ? ensureSentence(understanding.whatItUnlocks)
              : "The project does not record a later dependency yet.",
         assessment: next ? buildDecisionImpactExplanation(next.title) : rationale,
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([subjectMilestone?.title || "", next?.title || "", rationale], 5),
      };
   }

   if (intent === "current-milestone") {
      const next = active ? getFollowingMilestone(packet, active) : undefined;
      return {
         currentUnderstanding: active ? `The current milestone is ${active.title.replace(/[.!?]+$/, "")}.` : "This project does not have an active milestone selected.",
         assessment: active?.goal && getProjectFactOverlapRatio(active.goal, active.title) < 0.75 ? ensureSentence(active.goal) : "",
         recommendation: "",
         reason: active ? buildMilestoneRelationshipRationale(packet, active, next) : "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([active?.title || "", active?.goal || "", active?.whyItMatters || ""], 5),
      };
   }

   if (intent === "milestone-rationale") {
      const milestone = referenced || active;
      const next = milestone ? getFollowingMilestone(packet, milestone) : undefined;
      const rationale = buildMilestoneRelationshipRationale(packet, milestone, next);

      return {
         currentUnderstanding: "",
         assessment: rationale,
         recommendation: "",
         reason: next ? ensureSentence(`That is why ${formatMilestoneAsGerund(next.title)} comes after it`) : "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([milestone?.title || "", rationale, next?.title || ""], 5),
      };
   }

   if (intent === "next-milestone") {
      const isFollowUp = /^(?:what happens after that|what comes after that|and then|what next after that)\??$/i.test(normalizePrompt(prompt));
      const base = isFollowUp ? findMilestoneByConversationSubject(packet, conversation) || active : active;
      const next = base ? getFollowingMilestone(packet, base) : undefined;
      const afterNext = next ? getFollowingMilestone(packet, next) : undefined;

      return {
         currentUnderstanding: next ? `After ${formatMilestoneAsGerund(base?.title)}, the next milestone is ${next.title.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toUpperCase())}.` : "There is no later unfinished milestone recorded.",
         assessment: next ? buildMilestoneRelationshipRationale(packet, next, afterNext) : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([base?.title || "", next?.title || "", next?.whyItMatters || ""], 5),
      };
   }

   if (intent === "decision-quality") {
      const decision = conversation.lastSubject?.kind === "decision" ? conversation.lastSubject.title : getPriorityDecisionStatement(packet);
      return {
         currentUnderstanding: decision ? `A weak answer to “${formatAuthoritativeQuestion(decision)}” would fail in one of these ways` : "A weak decision would leave the project no clearer than it is now.",
         assessment: buildWeakDecisionAssessment(packet),
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([decision, active?.title || "", active?.whyItMatters || ""], 6),
      };
   }

   if (intent === "work-readiness-standard") {
      const standards = buildWorkReadinessStandard(packet, conversation);
      return {
         currentUnderstanding: "That work is good enough to move forward when:",
         assessment: standards.length ? standards.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "The project does not yet record a usable completion standard.",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([active?.title || "", ...standards], 8),
      };
   }

   if (intent === "next-action" || intent === "next-action-detail") {
      const action = getConcreteMilestoneAction(active) || understanding.recommendedMove;
      const ordered = getOrderedMilestoneActions(packet, active);
      const activeTitle = cleanAuthoritativeStatement(active?.title).toLowerCase();
      const activeQuestions = active?.openQuestions.map((item) => cleanAuthoritativeStatement(item)).filter(Boolean) || [];
      const activeQuestionText = activeQuestions.join(" ").toLowerCase();
      const approvalContext = `${activeTitle} ${activeQuestionText}`;
      const isParticipantProgramApproval = /\b(?:participant|mentor|student|volunteer|department|sponsor|coordinator|privacy|background check|training|escalat|matching|application|driver|rider)\b/.test(approvalContext);
      const participantProgramHasInsuranceOrLiability = /\b(?:insurance|liability|vehicle requirements?|driver requirements?)\b/.test(approvalContext);
      const isSharedResourceOrProgramApproval = /\b(?:insurance|lease|liability|shared storage|storage allowed|loss|lost|damage|damaged|unsafe use|donation|borrow|checkout|return)\b/.test(approvalContext);
      const categoryValidation = /\b(?:brand|language|promise|positioning|identity|message)\b/.test(activeTitle)
         ? "Test each version against every major product or part of the project, and reject any version that only fits part of the work"
         : /\b(?:approval|license|licensing|permit|permission|operating rules?|quiet hours?|management|insurance|assign an owner)\b/.test(activeTitle)
           ? isParticipantProgramApproval
              ? participantProgramHasInsuranceOrLiability
                 ? "Record the department or host owner, approval path, insurance or liability requirements, privacy rules, volunteer screening or training requirements, and escalation boundaries before recruitment, applications, or matching"
                 : "Record the department owner, approval path, privacy requirements, volunteer screening or training requirements, and escalation boundaries before recruitment, applications, or matching"
              : isSharedResourceOrProgramApproval
                ? "Record the host or management decision, insurance or lease restrictions, approved storage conditions, and responsibility rules before accepting resources, making purchases, or designing the operating workflow"
                : "Record the management decision, licensing requirement, operating-time rules, and shared-space conditions before choosing a date, content choice, or equipment setup"
           : "";
      const validationStep =
         categoryValidation ||
         ordered.find((item) => /\b(?:test|compare|review|check|validate|reject)\b/i.test(item) && (!action || getProjectFactOverlapRatio(item, action) < 0.82)) ||
         ordered.find((item) => action && getProjectFactOverlapRatio(item, action) < 0.72) ||
         "";

      return {
         currentUnderstanding: action ? ensureSentence(action) : "The saved project does not contain enough detail for a defensible next action.",
         assessment: validationStep ? ensureSentence(validationStep) : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([action, validationStep, active?.title || ""], 6),
      };
   }

   if (intent === "milestone-completion-evidence") {
      const asksForMissingEvidence = /\b(?:still missing|evidence is missing|evidence remains|what is missing before|what remains before|missing before)\b/i.test(prompt);
      const normalizedPrompt = normalizePrompt(prompt);
      const explicitlyNamedMilestone = getAuthoritativeMilestones(packet).find((candidate) => {
         const normalizedTitle = normalizePrompt(candidate.title);
         return normalizedTitle.length > 5 && normalizedPrompt.includes(normalizedTitle);
      });
      // Completion-evidence questions that use “current”, “this”, or a follow-up
      // pronoun should stay attached to the active milestone. Conversation memory
      // is only a fallback when the user explicitly names a different milestone.
      // When the sequence has no active milestone, a generic follow-up must not
      // silently jump back to the first milestone in the project.
      const milestone = explicitlyNamedMilestone || active || (!asksForMissingEvidence ? referenced : undefined);
      const checks = getMilestoneCompletionChecks(packet, milestone);
      const evidenceStatus = getMilestoneEvidenceStatus(packet, milestone);
      const materialLine = evidenceStatus.materialTitles.length ? `Relevant materials already available for this check: ${evidenceStatus.materialTitles.join(", ")}.` : "";

      if (asksForMissingEvidence) {
         return {
            currentUnderstanding: !milestone
               ? "This project does not have an active milestone selected."
               : evidenceStatus.missing.length
                 ? `The evidence still missing for ${milestone.title.replace(/[.!?]+$/, "")} is:`
                 : `No completion evidence is still missing for ${milestone.title.replace(/[.!?]+$/, "")}.`,
            assessment: evidenceStatus.missing.length
               ? evidenceStatus.missing.map((check, index) => `${index + 1}. ${ensureSentence(check)}`).join("\n")
               : evidenceStatus.supported.length
                 ? `The saved work supports all recorded checks:\n${evidenceStatus.supported.map((check, index) => `${index + 1}. ${ensureSentence(check)}`).join("\n")}`
                 : "No explicit completion criteria are recorded.",
            recommendation: materialLine,
            reason: "",
            watchOut: "",
            evidenceUsed: uniqueProjectFacts([...evidenceStatus.supported, ...evidenceStatus.missing, ...evidenceStatus.materialTitles], 14),
         };
      }

      return {
         currentUnderstanding: milestone ? `I would consider ${milestone.title.replace(/[.!?]+$/, "")} complete when:` : "This project does not have an active milestone selected.",
         assessment: checks.length
            ? checks.map((check, index) => `${index + 1}. ${ensureSentence(check)}`).join("\n")
            : "No reliable completion criteria are recorded yet, so the milestone should remain open until a concrete output and review check are defined.",
         recommendation: materialLine,
         reason: checks.length ? "Those checks prove the milestone produced something the next work can depend on." : "",
         watchOut: evidenceStatus.supported.length ? `${evidenceStatus.supported.length} completion check${evidenceStatus.supported.length === 1 ? " is" : "s are"} already supported by saved work or materials.` : "",
         evidenceUsed: uniqueProjectFacts([...checks, ...evidenceStatus.materialTitles], 12),
      };
   }

   if (intent === "decision") {
      return {
         currentUnderstanding: confirmed.length ? "These decisions are settled:" : "No confirmed decisions are explicitly recorded yet.",
         assessment: confirmed.length ? confirmed.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: confirmed,
      };
   }

   if (intent === "unresolved") {
      return {
         currentUnderstanding: unresolved.length ? "These decisions are still open:" : "No unresolved decisions are explicitly recorded.",
         assessment: unresolved.length ? unresolved.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: unresolved,
      };
   }

   if (intent === "decision-status") {
      const sourceMilestone = getMostRelevantRecordedMilestone(packet, active);
      const conversationUpdate = getMostRecentDetailedProjectUpdate(conversation);
      const fallbackUpdate = sourceMilestone ? cleanAuthoritativeStatement([sourceMilestone.workingContent, ...sourceMilestone.completionEvidence].filter(Boolean).join("\n"), 20000) : "";
      const update = conversationUpdate || fallbackUpdate;
      const promptCategory = getMilestoneGuidanceCategory(prompt);
      const scopedCategory = promptCategory !== "general" ? promptCategory : getMilestoneGuidanceCategory(sourceMilestone?.title || active?.title || "");
      const recentMilestoneFacts = getRecordedMilestoneDecisionFacts(sourceMilestone, 20);
      const updateFacts = extractMilestoneSpecificUpdateFacts(update, sourceMilestone, 20);
      const scopedFacts = uniqueProjectFacts([...updateFacts, ...recentMilestoneFacts], 24).filter((fact) => factMatchesGuidanceCategory(fact, scopedCategory));
      const relevantConfirmed = confirmed.filter((fact) => factMatchesGuidanceCategory(fact, scopedCategory));
      const settled = uniqueProjectFacts(scopedFacts.length ? [...scopedFacts, ...relevantConfirmed] : [...updateFacts, ...recentMilestoneFacts, ...confirmed], scopedFacts.length ? 12 : 18);
      const resolutionCorpus = getRecordedProjectResolutionCorpus(packet, update);
      const stillOpen = unresolved
         .filter((statement) => promptCategory === "general" || factMatchesGuidanceCategory(statement, scopedCategory))
         .filter((statement) => !projectUpdateResolvesRecordedDecision(statement, resolutionCorpus))
         .filter((statement) => !settled.some((fact) => getProjectFactOverlapRatio(statement, fact) >= 0.5))
         .slice(0, 8);
      const scopeLabel = promptCategory !== "general" && active ? ` for ${active.title.replace(/[.!?]+$/, "")}` : "";

      return {
         currentUnderstanding: settled.length ? `These decisions are settled${scopeLabel}:` : `No additional decision is explicitly settled${scopeLabel}.`,
         assessment: [settled.length ? settled.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "", stillOpen.length ? `Still open:\n${stillOpen.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}` : ""]
            .filter(Boolean)
            .join("\n\n"),
         recommendation: stillOpen[0] ? ensureSentence(`The next decision to resolve is ${stillOpen[0].replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`) : "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([...settled, ...stillOpen], 24),
      };
   }

   if (intent === "premature-decision") {
      const future = getAuthoritativeMilestones(packet).filter((milestone) => milestone.status === "waiting");
      const later =
         future
            .flatMap((milestone) => [...milestone.openQuestions, ...milestone.decisions])
            .map((item) => cleanAuthoritativeStatement(item))
            .find(isAuthoritativeDecision) || future[0]?.title;
      return {
         currentUnderstanding: later ? `Do not lock ${later.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} yet.` : "I do not see a later choice that clearly needs to be postponed.",
         assessment: active ? ensureSentence(`Finish ${active.title.replace(/[.!?]+$/, "")} first because its result may change that later choice`) : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([later || "", active?.title || ""], 4),
      };
   }

   if (intent === "assumptions") {
      const explicit = uniqueProjectFacts(
         understanding.assumptions.map((item) => cleanAuthoritativeStatement(item.statement)),
         5,
      );
      const inferred = explicit.length
         ? explicit
         : uniqueProjectFacts(
              [
                 unresolved[0] ? `The project can keep moving while ${unresolved[0].replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} remains unresolved` : "",
                 active ? `${active.title.replace(/[.!?]+$/, "")} will produce enough clarity for the work that follows` : "",
              ],
              3,
           );
      return {
         currentUnderstanding: explicit.length ? "These assumptions are recorded:" : "These are the assumptions I would test rather than treat as facts:",
         assessment: inferred.length ? inferred.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "I do not have enough evidence to name a defensible assumption.",
         recommendation: inferred[0] ? `Test the first assumption before making a downstream commitment.` : "",
         reason: "",
         watchOut: "",
         evidenceUsed: inferred,
      };
   }

   if (intent === "risk") {
      const evidenceStatus = getMilestoneEvidenceStatus(packet, active);
      const relevantMaterials = getRelevantMaterialsForMilestone(packet, active);
      const primaryMissing = evidenceStatus.missing[0];
      const primaryDecision = getPriorityProjectDecision(packet, active);
      const next = active ? getFollowingMilestone(packet, active) : undefined;
      const risk = buildMilestoneDependencyRisk(packet, active, next);

      return {
         currentUnderstanding: primaryMissing
            ? `The main thing you may be overlooking is this completion check: ${ensureSentence(primaryMissing)}`
            : primaryDecision
              ? `The main thing you may be overlooking is the unresolved choice: ${ensureSentence(primaryDecision)}`
              : risk,
         assessment: active?.whyItMatters ? ensureSentence(active.whyItMatters) : "",
         recommendation: relevantMaterials.length
            ? `Review ${relevantMaterials.map((material) => `“${material.title}”`).join(", ")} against that gap before making the next commitment.`
            : getConcreteMilestoneAction(active)
              ? ensureSentence(getConcreteMilestoneAction(active))
              : "",
         reason: risk,
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([primaryMissing || "", primaryDecision || "", risk, ...relevantMaterials.map((material) => material.usefulContext)], 10),
      };
   }

   if (intent === "milestone-fit") {
      const explicitCurrentQuestion = /current milestone|this milestone/i.test(prompt);
      const asksWhetherMoreWorkIsNeeded = /\b(?:still need more work|more work needed|ready to complete|ready to close)\b/i.test(prompt);
      const subjectMilestone = explicitCurrentQuestion ? active : findMilestoneByConversationSubject(packet, conversation) || active;
      const ordered = getAuthoritativeMilestones(packet);
      const subjectIndex = subjectMilestone ? ordered.findIndex((milestone) => milestone.id === subjectMilestone.id) : -1;
      const prerequisite = subjectIndex > 0 ? ordered[subjectIndex - 1] : undefined;
      const nextAfterSubject = subjectMilestone ? getFollowingMilestone(packet, subjectMilestone) : undefined;
      const rationale = prerequisite ? buildMilestoneRelationshipRationale(packet, prerequisite, subjectMilestone) : buildMilestoneRelationshipRationale(packet, subjectMilestone, nextAfterSubject);
      const evidenceStatus = getMilestoneEvidenceStatus(packet, subjectMilestone);

      if (asksWhetherMoreWorkIsNeeded) {
         return {
            currentUnderstanding: !subjectMilestone
               ? "There is no active milestone to assess."
               : evidenceStatus.missing.length
                 ? `Yes. ${subjectMilestone.title.replace(/[.!?]+$/, "")} still needs more work.`
                 : `No. The saved work and materials now support closing ${subjectMilestone.title.replace(/[.!?]+$/, "")}.`,
            assessment: evidenceStatus.missing.length
               ? `The remaining completion checks are:\n${evidenceStatus.missing.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
               : evidenceStatus.supported.length
                 ? `The recorded evidence supports:\n${evidenceStatus.supported.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
                 : "No explicit completion criteria are recorded.",
            recommendation:
               subjectMilestone && !evidenceStatus.missing.length
                  ? `You can now close ${subjectMilestone.title.replace(/[.!?]+$/, "")} and move to ${nextAfterSubject?.title || "the next unfinished milestone"}.`
                  : getConcreteMilestoneAction(subjectMilestone)
                    ? ensureSentence(getConcreteMilestoneAction(subjectMilestone))
                    : "",
            reason: "",
            watchOut: evidenceStatus.materialTitles.length ? `Materials considered: ${evidenceStatus.materialTitles.join(", ")}.` : "",
            evidenceUsed: uniqueProjectFacts([...evidenceStatus.supported, ...evidenceStatus.missing, ...evidenceStatus.materialTitles], 14),
         };
      }

      return {
         currentUnderstanding: prerequisite
            ? `Yes. I still think ${formatMilestoneAsGerund(prerequisite.title)} should come before ${formatMilestoneAsGerund(subjectMilestone?.title)}.`
            : subjectMilestone
              ? `Yes. ${subjectMilestone.title.replace(/[.!?]+$/, "")} still matches the project’s current needs.`
              : "There is no active milestone to reassess.",
         assessment: rationale,
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([prerequisite?.title || "", subjectMilestone?.title || "", rationale], 6),
      };
   }

   if (intent === "recommendation-fit") {
      const previous = cleanAuthoritativeStatement(conversation.lastRecommendation || conversation.lastSubject?.title);
      const currentAction = getConcreteMilestoneAction(active) || cleanAuthoritativeStatement(understanding.recommendedMove || active?.title);
      const next = active ? getFollowingMilestone(packet, active) : undefined;
      const rationale = buildMilestoneRelationshipRationale(packet, active, next);
      const same = Boolean(previous && currentAction && (getProjectFactOverlapRatio(previous, currentAction) >= 0.48 || getProjectFactOverlapRatio(previous, active?.title || "") >= 0.35));

      return {
         currentUnderstanding: same
            ? `Yes. I still recommend ${formatMilestoneAsGerund(previous).replace(/^./, (character) => character.toLowerCase())}.`
            : previous
              ? `I would revise the earlier recommendation. The project now points to ${currentAction.replace(/[.!?]+$/, "")}.`
              : `The current project state points to ${currentAction.replace(/[.!?]+$/, "")}.`,
         assessment: rationale,
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([previous, currentAction, rationale], 5),
      };
   }

   if (intent === "challenge-recommendation") {
      const recommendation = cleanAuthoritativeStatement(conversation.lastRecommendation || conversation.lastSubject?.title || understanding.recommendedMove);
      const recommendationMilestone = active;
      const next = recommendationMilestone ? getFollowingMilestone(packet, recommendationMilestone) : undefined;
      const alternativeDecision = next ? milestoneTitleToDecisionQuestion(next.title) : "";
      const currentSubject = getMilestoneSubjectPhrase(recommendationMilestone?.title);
      const nextSubject = getMilestoneSubjectPhrase(next?.title);
      const counterargument = next
         ? `The strongest argument for reversing the order is that ${formatMilestoneAsGerund(next.title)} first could reveal constraints that should shape ${currentSubject}.`
         : "The strongest argument against the recommendation is that another unresolved dependency may have more leverage than the current plan shows.";

      return {
         currentUnderstanding: counterargument,
         assessment: next ? ensureSentence(`That could reduce rework if the decision about ${nextSubject.replace(/^./, (character) => character.toLowerCase())} materially changes what the current milestone needs to produce`) : "",
         recommendation: recommendation ? `I would still keep the original recommendation: ${ensureSentence(recommendation)} Treat it as a working decision to test rather than a long polishing phase.` : "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([recommendation, next?.title || "", alternativeDecision], 6),
      };
   }

   if (intent === "project-update") {
      const update = cleanAuthoritativeStatement(prompt, 16000);
      const explicitUpdateFacts = extractExplicitProjectUpdateFacts(prompt);
      const activeCategory = getMilestoneGuidanceCategory(active?.title || "");
      const budgetSnapshot = activeCategory === "budget" ? getProjectBudgetSnapshot(packet, active) : undefined;
      const budgetFacts = budgetSnapshot
         ? [
              typeof budgetSnapshot.limit === "number" ? `The phase-one budget is capped at ${formatProjectMoney(budgetSnapshot.limit)}` : "",
              typeof budgetSnapshot.committed === "number" ? `${formatProjectMoney(budgetSnapshot.committed)} is assigned to required workspace and safety categories` : "",
              typeof budgetSnapshot.reserved === "number" ? `${formatProjectMoney(budgetSnapshot.reserved)} remains reserved for the next major purchase and its accessories` : "",
              budgetSnapshot.lineItems.length
                 ? `The required cost categories are ${formatNaturalActionSeries(
                      budgetSnapshot.lineItems
                         .filter((item) => !/\b(?:contingency|reserve|buffer)\b/i.test(item.label))
                         .map((item) => `${item.label} (${formatProjectMoney(item.amount)})`)
                         .slice(0, 10),
                   )}`
                 : "",
              budgetSnapshot.deferred.length ? `Deferred from this phase: ${formatNaturalActionSeries(budgetSnapshot.deferred)}` : "",
           ]
         : [];
      const settledByUpdate = uniqueProjectFacts([...(budgetFacts.filter(Boolean).length ? budgetFacts : explicitUpdateFacts), ...confirmed.filter((statement) => update && getProjectFactOverlapRatio(statement, update) >= 0.5)], 12);
      const evidenceStatus = getMilestoneEvidenceStatus(packet, active);

      return {
         currentUnderstanding: active ? `I recorded that update inside ${active.title.replace(/[.!?]+$/, "")}.` : `I recorded that update for ${packet.projectTitle}.`,
         assessment: settledByUpdate.length
            ? `It settles or strengthens these points:\n${settledByUpdate.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
            : "It adds working evidence, but it does not yet settle a clearly recorded decision.",
         recommendation: evidenceStatus.missing.length
            ? `The milestone should stay open until these remaining checks are supported:\n${evidenceStatus.missing.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
            : active
              ? `The saved evidence now supports closing ${active.title.replace(/[.!?]+$/, "")}.`
              : "",
         reason: "",
         watchOut: evidenceStatus.materialTitles.length ? `Materials considered with the update: ${evidenceStatus.materialTitles.join(", ")}.` : "",
         evidenceUsed: uniqueProjectFacts([update, ...settledByUpdate, ...evidenceStatus.supported, ...evidenceStatus.missing], 16),
      };
   }

   if (intent === "project-change") {
      const sourceMilestone = getMostRelevantRecordedMilestone(packet, active);
      const conversationUpdate = getMostRecentDetailedProjectUpdate(conversation);
      const fallbackUpdate = sourceMilestone ? cleanAuthoritativeStatement([sourceMilestone.workingContent, ...sourceMilestone.completionEvidence].filter(Boolean).join("\n"), 20000) : "";
      const update = conversationUpdate || fallbackUpdate;
      const latestMilestoneFacts = getRecordedMilestoneDecisionFacts(sourceMilestone, 20);
      const newlySettled = uniqueProjectFacts([...extractMilestoneSpecificUpdateFacts(update, sourceMilestone, 22), ...latestMilestoneFacts, ...confirmed.filter((statement) => update && getProjectFactOverlapRatio(statement, update) >= 0.5)], 18);
      const evidenceStatus = getMilestoneEvidenceStatus(packet, active);
      const next = active ? getFollowingMilestone(packet, active) : undefined;
      const movedBeyondUpdatedMilestone = Boolean(sourceMilestone && active && active.order > sourceMilestone.order);

      return {
         currentUnderstanding: newlySettled.length ? `The update changed the project in ${newlySettled.length === 1 ? "one concrete way" : "these concrete ways"}:` : "The update added evidence, but it did not change a clearly recorded decision.",
         assessment: newlySettled.length ? newlySettled.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : update ? ensureSentence(update) : "",
         recommendation:
            movedBeyondUpdatedMilestone && active
               ? `Those settled requirements now act as inputs to ${active.title.replace(/[.!?]+$/, "")}.`
               : active
                 ? evidenceStatus.missing.length
                    ? `${active.title.replace(/[.!?]+$/, "")} remains active because ${evidenceStatus.missing.length} completion check${evidenceStatus.missing.length === 1 ? " is" : "s are"} still unsupported.`
                    : `${active.title.replace(/[.!?]+$/, "")} now has enough recorded support to close and move to ${next?.title || "the next unfinished milestone"}.`
                 : "",
         reason: movedBeyondUpdatedMilestone
            ? "The project should carry those decisions forward without reopening the milestone that produced them."
            : evidenceStatus.missing.length
              ? `Still missing:\n${evidenceStatus.missing.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
              : "",
         watchOut: evidenceStatus.materialTitles.length ? `Materials considered: ${evidenceStatus.materialTitles.join(", ")}.` : "",
         evidenceUsed: uniqueProjectFacts([update, ...newlySettled, ...evidenceStatus.supported, ...evidenceStatus.missing], 22),
      };
   }

   if (intent === "milestone-inputs") {
      const milestone = active || referenced;
      const earlierDecisions = getEarlierDecisionInputsForMilestone(packet, milestone, 10);
      const materialFindings = getMaterialInputFindingsForMilestone(packet, milestone, 6);
      const next = milestone ? getFollowingMilestone(packet, milestone) : undefined;

      return {
         currentUnderstanding: milestone ? `These earlier decisions and material findings should shape ${milestone.title.replace(/[.!?]+$/, "")}:` : "This project does not have an active milestone selected.",
         assessment: [
            earlierDecisions.length ? `Earlier decisions and constraints:\n${earlierDecisions.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}` : "",
            materialFindings.length ? `Material findings:\n${formatMaterialInputFindings(materialFindings)}` : "",
         ]
            .filter(Boolean)
            .join("\n\n"),
         recommendation:
            milestone && getMilestoneGuidanceCategory(milestone.title) === "budget"
               ? `Fund the required safety, infrastructure, and workspace needs first; keep deferred upgrades out of phase one, then protect the remaining budget for ${next?.title || "the next decision"}.`
               : milestone
                 ? `Use these as requirements for the current milestone without reopening the completed milestones that produced them.`
                 : "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([...earlierDecisions, ...materialFindings], 20),
      };
   }

   if (intent === "budget-status") {
      const milestone = active || referenced;
      const snapshot = getProjectBudgetSnapshot(packet, milestone);
      const pieces = [
         typeof snapshot.limit === "number" ? `The recorded phase-one budget is ${formatProjectMoney(snapshot.limit)}` : "",
         typeof snapshot.committed === "number" ? `${formatProjectMoney(snapshot.committed)} is assigned to required workspace and safety categories` : "",
         typeof snapshot.reserved === "number" ? `${formatProjectMoney(snapshot.reserved)} remains reserved for the next major purchase and its required accessories` : "",
      ].filter(Boolean);

      return {
         currentUnderstanding: pieces.length ? `${pieces.join(". ")}.` : "The current milestone does not yet contain a complete budget allocation.",
         assessment:
            typeof snapshot.limit === "number" && typeof snapshot.committed === "number" && typeof snapshot.reserved === "number"
               ? snapshot.committed + snapshot.reserved === snapshot.limit
                  ? "The recorded allocation is internally consistent with the budget limit."
                  : `The recorded figures do not fully reconcile: ${formatProjectMoney(snapshot.committed + snapshot.reserved)} is allocated against a ${formatProjectMoney(snapshot.limit)} limit.`
               : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts(
            [snapshot.limit ? `Budget limit: ${formatProjectMoney(snapshot.limit)}` : "", snapshot.committed ? `Committed: ${formatProjectMoney(snapshot.committed)}` : "", snapshot.reserved ? `Reserved: ${formatProjectMoney(snapshot.reserved)}` : ""],
            6,
         ),
      };
   }

   if (intent === "budget-scope") {
      const milestone = active || referenced;
      const snapshot = getProjectBudgetSnapshot(packet, milestone);
      const requiredLines = snapshot.lineItems.filter((item) => !/\b(?:contingency|reserve|buffer)\b/i.test(item.label)).map((item) => `${item.label}: ${formatProjectMoney(item.amount)}`);
      const deferred = snapshot.deferred;

      return {
         currentUnderstanding: "The phase-one budget separates required spending from deferred expansion work:",
         assessment: [
            requiredLines.length ? `Required now:\n${requiredLines.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}` : "Required now:\nNo itemized required spending is recorded yet.",
            deferred.length ? `Deferred:\n${deferred.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}` : "Deferred:\nNo explicit defer list is recorded yet.",
         ].join("\n\n"),
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([...requiredLines, ...deferred], 20),
      };
   }

   if (intent === "decision-requirements") {
      const { target, requirements } = getDecisionRequirementsForPrompt(packet, prompt, active);
      return {
         currentUnderstanding: target ? `These requirements should control ${target.title.replace(/[.!?]+$/, "")}:` : "These are the strongest recorded requirements for the decision:",
         assessment: requirements.length ? requirements.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "The project does not yet contain enough recorded requirements for a defensible comparison.",
         recommendation: requirements.length ? "Compare the realistic options against these requirements before selecting one." : "",
         reason: "",
         watchOut: "",
         evidenceUsed: requirements,
      };
   }

   if (intent === "ordered-actions") {
      const actions = getOrderedMilestoneActions(packet, active);
      const asksForSetupPriority = /\b(?:purchases?|items?|equipment|supplies|setup|installation|build work)\b[^?]{0,100}\b(?:first|priority|start)\b/i.test(normalizePrompt(prompt));

      return {
         currentUnderstanding: asksForSetupPriority ? "The purchases and setup work that should happen first are:" : "The three most useful actions, in order, are:",
         assessment: actions.length ? actions.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "The project does not contain enough milestone detail for a defensible three-step plan.",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: actions,
      };
   }

   if (intent === "senior-assessment" || intent === "project-lead") {
      if (sequenceComplete) {
         const strengthDraft = getCompletedProjectStrengthDraft(packet);
         const riskDraft = getCompletedProjectRiskDraft(packet);
         const observationDraft = getCompletedProjectObservationDraft(packet);
         return {
            currentUnderstanding: `My read: ${packet.projectTitle} completed its recorded milestone sequence and delivered a usable first-version result.`,
            assessment: `${strengthDraft.currentUnderstanding} ${strengthDraft.assessment}`.trim(),
            recommendation: `Treat the recorded phase as complete. ${observationDraft.recommendation}`,
            reason: riskDraft.currentUnderstanding,
            watchOut: "",
            evidenceUsed: uniqueProjectFacts([...strengthDraft.evidenceUsed, ...riskDraft.evidenceUsed, ...observationDraft.evidenceUsed], 18),
         };
      }

      const next = active ? getFollowingMilestone(packet, active) : undefined;
      const strength = success[0] || confirmed[0] || understanding.goal;
      const rationale = buildMilestoneRelationshipRationale(packet, active, next);
      const risk = buildMilestoneDependencyRisk(packet, active, next);
      const action = getConcreteMilestoneAction(active);

      return {
         currentUnderstanding: `My read: ${packet.projectTitle} has a credible direction${strength ? ` and a clear definition of success` : ""}, but the foundational decisions are not settled enough for the later execution work to be treated as final.`,
         assessment: active ? ensureSentence(`The right focus is ${formatMilestoneAsInfinitive(active.title)}. ${rationale}`) : "The project needs one explicit active milestone before execution can be judged reliably.",
         recommendation: action ? ensureSentence(action) : "",
         reason: risk,
         watchOut: constraints[0] ? ensureSentence(`Keep this constraint visible: ${constraints[0].replace(/[.!?]+$/, "")}`) : "",
         evidenceUsed: uniqueProjectFacts([strength || "", active?.title || "", rationale, risk, action], 8),
      };
   }

   return null;
}

function getProjectGuidanceSubject(intent: ProjectGuidanceIntent, packet: ProjectIntelligencePacket, conversation: ProjectGuidanceConversationContext, draft: ProfileGuidanceDraft): ProjectGuidanceSubject {
   const active = getAuthoritativeActiveMilestone(packet);
   const referenced = findMilestoneByConversationSubject(packet, conversation);

   if (intent === "next-milestone") {
      const base = referenced || active;
      const next = base ? getFollowingMilestone(packet, base) : undefined;
      return next ? { kind: "milestone", title: next.title, detail: next.whyItMatters, id: next.id } : { kind: "none", title: "", detail: "" };
   }

   if (["current-milestone", "milestone-rationale", "next-action", "next-action-detail", "milestone-completion-evidence", "milestone-fit", "skip-risk", "milestone-inputs", "budget-status", "budget-scope"].includes(intent)) {
      const milestone = referenced || active;
      return milestone ? { kind: "milestone", title: milestone.title, detail: milestone.whyItMatters, id: milestone.id } : { kind: "none", title: "", detail: "" };
   }

   if (intent === "priority-fact") {
      const priority = getPriorityProjectFact(packet);
      return { kind: priority.kind, title: priority.title, detail: priority.detail };
   }

   if (["decision-impact", "unresolved", "decision-status", "decision", "decision-requirements", "priority-decision", "decision-quality"].includes(intent)) {
      const inferredFromDraft = cleanAuthoritativeStatement(draft.currentUnderstanding)
         .replace(/^it affects the next major decision:\s*/i, "")
         .replace(/^the most important unresolved decision is:\s*/i, "")
         .replace(/[?]+$/, "");
      const decision = inferredFromDraft || getPriorityProjectDecision(packet, active) || getAuthoritativeConfirmedDecisions(packet)[0] || "";
      return decision ? { kind: "decision", title: decision, detail: draft.assessment } : { kind: "none", title: "", detail: "" };
   }

   if (
      [
         "challenge-recommendation",
         "recommendation-fit",
         "option-recommendation",
         "option-vs-existing",
         "option-counterargument",
         "option-change-condition",
         "purchase-deferral",
         "ordered-actions",
         "senior-assessment",
         "completed-project-strength",
         "completed-project-observations",
         "conditional-option-reconsideration",
         "completed-decision-retrospective",
         "project-lead",
      ].includes(intent)
   ) {
      const recommendation = cleanAuthoritativeStatement(draft.recommendation || conversation.lastRecommendation || active?.title || packet.projectUnderstanding.recommendedMove);
      return recommendation ? { kind: "recommendation", title: recommendation, detail: draft.reason || draft.assessment } : { kind: "none", title: "", detail: "" };
   }

   if (intent === "risk") {
      const risk = packet.projectUnderstanding.risks[0];
      return risk ? { kind: "risk", title: risk.title, detail: risk.consequence, id: risk.id } : { kind: "none", title: "", detail: "" };
   }

   if (intent === "project-update" || intent === "project-change") {
      return { kind: "update", title: cleanAuthoritativeStatement(conversation.lastUserPrompt), detail: draft.assessment };
   }

   if (intent === "project-identity" || intent === "project-understanding" || intent === "project-facts" || intent === "completed-milestones" || intent === "persistent-decisions" || intent === "budget-memory" || intent === "material-history") {
      return { kind: "project", title: packet.projectTitle, detail: packet.projectUnderstanding.goal };
   }

   return conversation.lastSubject || { kind: "project", title: packet.projectTitle, detail: packet.projectUnderstanding.goal };
}

function buildCanonicalProjectUnderstandingDraft(intent: ProjectGuidanceIntent, packet: ProjectIntelligencePacket, prompt = "", conversation: ProjectGuidanceConversationContext = {}): ProfileGuidanceDraft | null {
   if (!hasCanonicalProjectUnderstanding(packet)) {
      return null;
   }

   const understanding = packet.projectUnderstanding;
   const openWork = getCanonicalOpenWork(packet);
   const primaryRisk = getCanonicalPrimaryRisk(packet);
   const goal = compactText(understanding.goal || packet.projectGoal);
   const situation = compactText(understanding.situation);
   const nextMove = compactText(understanding.recommendedMove || packet.projectLeadState.nextMove);
   const whyNow = compactText(understanding.whyNow || packet.projectLeadState.whyNow);
   const afterThis = compactText(understanding.afterThis || packet.projectLeadState.afterNextMove);
   const successState = compactText(understanding.successState);
   const activeMilestone = understanding.milestones.find((milestone) => milestone.id === understanding.activeMilestoneId);
   const currentFocus = compactText(activeMilestone?.title || nextMove);
   const evidenceUsed = uniqueStrings(
      [goal, situation, currentFocus, whyNow, afterThis, primaryRisk, ...understanding.timeline.map((item) => `${item.label}: ${item.dateText}`), ...openWork, ...packet.materials.map((material) => `${material.title}: ${material.summary}`)],
      16,
   );
   const recentProjectUpdates = uniqueStrings(
      (conversation.recentMessages || [])
         .filter((message) => message.role === "user")
         .map((message) => compactText(message.content, 2400))
         .filter((message) => message.length >= 20 && !/[?]$/.test(message) && !/^(?:what|why|how|when|where|which|should|could|would|can|does|do|is|are)\b/i.test(message)),
      3,
   );
   const latestProjectUpdate = recentProjectUpdates[recentProjectUpdates.length - 1] || "";

   // ALLEVIN MK VIII — distinct project-lead answers.
   // Each intent reads a different part of the canonical project model so a
   // facts question, priority judgment, assumption review, and action question
   // cannot collapse into the same milestone paragraph.
   if (intent === "project-facts") {
      const coreFacts = [goal, successState, situation].filter(Boolean);
      const confirmed = uniqueProjectFacts(
         understanding.confirmedDecisions.map((decision) => decision.statement.replace(/[.!?]+$/, "")).filter((statement) => !coreFacts.some((fact) => getProjectFactOverlapRatio(statement, fact) >= 0.82)),
         3,
      );
      const unresolved = uniqueProjectFacts(
         understanding.unresolvedDecisions.map((decision) => decision.statement.replace(/[.!?]+$/, "")).filter((statement) => !currentFocus || getProjectFactOverlapRatio(statement, currentFocus) < 0.88),
         3,
      );
      const constraints = uniqueProjectFacts(
         understanding.constraints.map((constraint) => constraint.statement.replace(/[.!?]+$/, "")).filter((statement) => !coreFacts.some((fact) => getProjectFactOverlapRatio(statement, fact) >= 0.84)),
         3,
      );
      const facts = uniqueProjectFacts(
         [
            goal ? `Goal: ${goal}` : "",
            successState ? `Success: ${successState}` : "",
            situation ? `Current position: ${formatProjectSituationReadback(situation)}` : "",
            confirmed.length ? `Already established: ${confirmed.join("; ")}` : "",
            unresolved.length ? `Still unresolved: ${unresolved.join("; ")}` : "",
            currentFocus ? `Current milestone: ${currentFocus}` : "",
            constraints.length ? `Important constraints: ${constraints.join("; ")}` : "",
            latestProjectUpdate ? `Recent project update: ${latestProjectUpdate}` : "",
         ],
         8,
      );

      return {
         currentUnderstanding: `The most important facts I’m using for ${packet.projectTitle} are:`,
         assessment: facts.map((fact, index) => `${index + 1}. ${fact.replace(/[.!?]+$/, "")}`).join("\n"),
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: facts,
      };
   }

   if (intent === "priority-fact") {
      const dependency = understanding.dependencies.find((item) => item.state !== "satisfied");
      const decision = understanding.unresolvedDecisions[0];
      const risk = understanding.risks.find((item) => item.severity === "high") || understanding.risks.find((item) => getTextOverlapScore(`${item.title} ${item.consequence}`, `${dependency?.before || ""} ${dependency?.after || ""} ${currentFocus}`) >= 2);

      if (dependency) {
         return {
            currentUnderstanding: `The fact that matters most right now is that ${dependency.before.replace(/[.!?]+$/, "")} must be settled before ${dependency.after.replace(/[.!?]+$/, "")}.`,
            assessment: ensureSentence(dependency.reason),
            recommendation: "",
            reason: currentFocus ? ensureSentence(`That is why ${currentFocus.replace(/[.!?]+$/, "")} should remain the active focus`) : "",
            watchOut: risk?.consequence || "",
            evidenceUsed: uniqueStrings([dependency.before, dependency.after, dependency.reason, risk?.consequence || ""], 6),
         };
      }

      if (decision) {
         return {
            currentUnderstanding: `The most important unresolved fact is ${ensureSentence(decision.statement)}`,
            assessment: getPriorityDecisionReason(packet, decision.statement),
            recommendation: "",
            reason: "",
            watchOut: risk?.consequence || "",
            evidenceUsed: decision.evidence.map((item) => item.quote),
         };
      }

      return {
         currentUnderstanding: currentFocus ? `The fact that matters most is that ${currentFocus.replace(/[.!?]+$/, "")} is the active dependency.` : "The project does not yet expose a single controlling fact.",
         assessment: whyNow ? ensureSentence(whyNow) : "",
         recommendation: "",
         reason: "",
         watchOut: primaryRisk,
         evidenceUsed,
      };
   }

   if (intent === "decision-impact") {
      const previousRecommendation = compactText(conversation.lastRecommendation, 1200);
      const milestoneChoices = uniqueProjectFacts([...(activeMilestone?.openQuestions || []), ...(activeMilestone?.decisions || [])], 6);
      const matchingDecision =
         understanding.unresolvedDecisions.find((decision) => previousRecommendation && getProjectFactOverlapRatio(decision.statement, previousRecommendation) >= 0.45 && getProjectFactOverlapRatio(decision.statement, currentFocus) < 0.55) ||
         understanding.unresolvedDecisions.find((decision) => getProjectFactOverlapRatio(decision.statement, currentFocus) < 0.55);
      const decision = compactText(matchingDecision?.statement || milestoneChoices[0]);
      const downstream = compactText(afterThis || understanding.whatItUnlocks);

      return {
         currentUnderstanding: decision
            ? `That recommendation directly affects how the project resolves this choice: ${ensureSentence(decision)}`
            : downstream
              ? `That recommendation affects the decisions required before ${downstream.replace(/[.!?]+$/, "")}.`
              : "The project does not yet record a distinct downstream decision for that recommendation.",
         assessment: downstream ? ensureSentence(`It also shapes ${downstream.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`) : "",
         recommendation: "",
         reason: activeMilestone?.whyItMatters ? ensureSentence(activeMilestone.whyItMatters) : whyNow ? ensureSentence(whyNow) : "",
         watchOut: "",
         evidenceUsed: uniqueStrings([decision, downstream, previousRecommendation], 6),
      };
   }

   if (intent === "decision-status") {
      const update = getMostRecentDetailedProjectUpdate(conversation);
      const updateFacts = extractExplicitProjectUpdateFacts(update);
      const ready = updateFacts.length ? updateFacts : understanding.confirmedDecisions.slice(0, 10).map((decision) => decision.statement);
      const waiting = understanding.unresolvedDecisions
         .map((decision) => decision.statement)
         .filter((statement) => !projectUpdateResolvesRecordedDecision(statement, update))
         .filter((statement) => !ready.some((fact) => getProjectFactOverlapRatio(statement, fact) >= 0.5))
         .slice(0, 8);
      const lines = [
         ready.length ? `Ready or already settled:\n${ready.map((item) => `- ${item}`).join("\n")}` : "Ready or already settled:\n- No additional decision is explicitly ready yet.",
         waiting.length ? `Still needs evidence or a choice:\n${waiting.map((item) => `- ${item}`).join("\n")}` : "Still needs evidence or a choice:\n- No unresolved decision is explicitly recorded.",
      ];

      return {
         currentUnderstanding: "",
         assessment: lines.join("\n\n"),
         recommendation: waiting[0] ? ensureSentence(`Handle ${waiting[0].replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} first`) : "",
         reason: waiting[0] ? getPriorityDecisionReason(packet, waiting[0]) : "",
         watchOut: "",
         evidenceUsed: uniqueStrings([...ready, ...waiting], 18),
      };
   }

   if (intent === "assumptions") {
      const explicitAssumptions = understanding.assumptions.slice(0, 6).map((assumption) => assumption.statement);
      const derivedAssumptions = explicitAssumptions.length
         ? []
         : uniqueStrings(
              [
                 activeMilestone ? `The current plan is treating ${activeMilestone.title.replace(/[.!?]+$/, "")} as the right first dependency.` : "",
                 understanding.unresolvedDecisions[0] ? `Later work can wait while ${understanding.unresolvedDecisions[0].statement.replace(/[.!?]+$/, "")} remains open.` : "",
                 understanding.constraints[0] ? `${understanding.constraints[0].statement.replace(/[.!?]+$/, "")} will remain stable while the project moves forward.` : "",
              ],
              4,
           );
      const assumptions = explicitAssumptions.length ? explicitAssumptions : derivedAssumptions;

      return {
         currentUnderstanding: explicitAssumptions.length ? "These assumptions are explicitly recorded:" : "No assumptions are explicitly labeled, but the current plan appears to rely on these:",
         assessment: assumptions.length ? assumptions.map((item, index) => `${index + 1}. ${item.replace(/[.!?]+$/, "")}`).join("\n") : "I do not have enough saved evidence to identify a defensible assumption.",
         recommendation: assumptions[0] ? ensureSentence(`Test the first assumption before allowing later work to depend on it`) : "",
         reason: "",
         watchOut: "",
         evidenceUsed: assumptions,
      };
   }

   if (intent === "premature-decision") {
      const futureMilestones = understanding.milestones.filter((milestone) => milestone.status === "waiting").sort((left, right) => left.order - right.order);
      const laterDecision = futureMilestones.flatMap((milestone) => [...milestone.decisions, ...milestone.openQuestions]).find(Boolean) || understanding.options[0]?.name || futureMilestones[0]?.title || "";

      return {
         currentUnderstanding: laterDecision ? `Do not finalize ${laterDecision.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} yet.` : "I do not see a later decision that clearly needs to be deferred.",
         assessment: currentFocus ? ensureSentence(`First finish ${currentFocus.replace(/[.!?]+$/, "")}; that work may change the evidence or constraints used for the later choice`) : "",
         recommendation: "",
         reason: afterThis ? ensureSentence(`The project can make that decision with better information once it reaches ${afterThis.replace(/[.!?]+$/, "")}`) : "",
         watchOut: "",
         evidenceUsed: uniqueStrings([laterDecision, currentFocus, afterThis], 6),
      };
   }

   if (intent === "next-action-detail") {
      const openQuestion = activeMilestone?.openQuestions[0];
      const decision = activeMilestone?.decisions[0];
      const completionCheck = getScopedMilestoneCompletionCriteria(activeMilestone)[0];
      const startingPrompt = compactText(activeMilestone?.startingPrompt, 1200);
      const action = openQuestion
         ? `Write and record a concrete answer to: ${openQuestion.replace(/[.!?]+$/, "")}`
         : decision
           ? `Document the decision for ${decision.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`
           : completionCheck
             ? `Produce the first piece of evidence for ${completionCheck.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`
             : startingPrompt || (activeMilestone ? `Create the smallest artifact that proves progress on ${activeMilestone.title.replace(/[.!?]+$/, "")}` : nextMove);

      return {
         currentUnderstanding: action ? ensureSentence(action) : "I do not have enough milestone detail to name a defensible action.",
         assessment: activeMilestone?.whyItMatters ? ensureSentence(activeMilestone.whyItMatters) : whyNow ? ensureSentence(whyNow) : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueStrings([openQuestion || "", decision || "", completionCheck || "", startingPrompt], 6),
      };
   }

   if (intent === "milestone-completion-evidence") {
      const explicitCriteria = uniqueStrings(getScopedMilestoneCompletionCriteria(activeMilestone), 8);
      const decisionCriteria = uniqueStrings([...(activeMilestone?.decisions || []).map((item) => `The decision is recorded: ${item}`), ...(activeMilestone?.openQuestions || []).map((item) => `There is a supported answer to: ${item}`)], 6);
      const fallbackCriteria = uniqueStrings(
         [
            activeMilestone?.goal ? `A usable result exists for ${activeMilestone.goal.replace(/[.!?]+$/, "")}` : "",
            ...understanding.successCriteria
               .filter((criterion) => !criterion.satisfied)
               .slice(0, 3)
               .map((criterion) => criterion.statement),
         ],
         5,
      );
      const criteria = explicitCriteria.length ? explicitCriteria : decisionCriteria.length ? decisionCriteria : fallbackCriteria;

      return {
         currentUnderstanding: activeMilestone ? `To complete ${activeMilestone.title.replace(/[.!?]+$/, "")}, these checks need to be true:` : "This project does not have an active milestone selected.",
         assessment: criteria.length
            ? criteria.map((item, index) => `${index + 1}. ${item.replace(/[.!?]+$/, "")}`).join("\n")
            : "No completion criteria are recorded yet, so the milestone should stay open until a concrete result and review check are added.",
         recommendation: "",
         reason: criteria.length ? ensureSentence(`Together, those checks show that the milestone produced something the next work can safely depend on`) : "",
         watchOut: "",
         evidenceUsed: criteria,
      };
   }

   if (intent === "project-update") {
      const update = compactText(prompt, 2400);
      const matchedDecision = understanding.unresolvedDecisions.find((decision) => getTextOverlapScore(decision.statement, update) >= 2);
      const matchedMilestone = understanding.milestones.find((milestone) => getTextOverlapScore(milestone.title, update) >= 2);
      const affectedFocus = compactText(matchedMilestone?.title || activeMilestone?.title || nextMove);

      return {
         currentUnderstanding: update ? `I’m treating this as new project evidence: ${ensureSentence(update)}` : "I did not receive a usable project update.",
         assessment: matchedDecision
            ? ensureSentence(`This gives us new evidence for ${matchedDecision.statement.replace(/[.!?]+$/, "")}`)
            : affectedFocus
              ? ensureSentence(`This may change the decisions, completion checks, or sequence inside ${affectedFocus.replace(/[.!?]+$/, "")}`)
              : "",
         recommendation: affectedFocus ? ensureSentence(`Reassess the active milestone before adding a new branch of work`) : "",
         reason: afterThis ? ensureSentence(`The main question is whether this update now unlocks ${afterThis.replace(/[.!?]+$/, "")}`) : "",
         watchOut: "",
         evidenceUsed: uniqueStrings([update, matchedDecision?.statement || "", affectedFocus, afterThis], 8),
      };
   }

   if (intent === "project-change") {
      const update = compactText(latestProjectUpdate || conversation.lastUserPrompt, 2400);
      const completed = understanding.completedWork.slice(-2);
      const changedFocus = activeMilestone?.title || nextMove;

      return {
         currentUnderstanding: update ? `The latest update adds this project evidence: ${ensureSentence(update)}` : "The latest update is not available in the current conversation context.",
         assessment: completed.length ? ensureSentence(`Completed work now includes ${completed.join(" and ")}`) : changedFocus ? ensureSentence(`The active focus is ${changedFocus.replace(/[.!?]+$/, "")}`) : "",
         recommendation: changedFocus ? ensureSentence(`Use the update to reassess the decisions and completion checks inside ${changedFocus.replace(/[.!?]+$/, "")}`) : "",
         reason: understanding.whatItUnlocks ? ensureSentence(understanding.whatItUnlocks) : "",
         watchOut: "",
         evidenceUsed: uniqueStrings([update, ...completed, changedFocus], 8),
      };
   }

   if (intent === "conversation-transform") {
      const previous = compactText(conversation.lastAssistantResponse, 4000);
      return {
         currentUnderstanding: previous || "I do not have a previous project response to transform.",
         assessment: "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: previous ? [previous] : [],
      };
   }

   // ALLEVIN MK VIII direct project readbacks:
   // These answers use the canonical project title and tracked milestone.
   // They intentionally avoid personality openers, canned fallback language,
   // and unresolved-decision text masquerading as milestone state.
   if (intent === "project-identity") {
      return {
         currentUnderstanding: `We’re working on ${packet.projectTitle}.`,
         assessment: goal ? ensureSentence(goal) : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueStrings([packet.projectTitle, goal], 4),
      };
   }

   if (intent === "current-milestone") {
      const trackedMilestone = activeMilestone || understanding.milestones.find((milestone) => milestone.status === "active") || understanding.milestones.find((milestone) => milestone.status !== "complete");
      const milestoneTitle = compactText(trackedMilestone?.title);
      const milestoneGoal = compactText(trackedMilestone?.goal);
      const milestoneReason = compactText(trackedMilestone?.whyItMatters);
      const normalizedTitle = normalizePrompt(milestoneTitle);
      const normalizedGoal = normalizePrompt(milestoneGoal);
      const goalRepeatsTitle = Boolean(
         milestoneTitle && milestoneGoal && (normalizedTitle === normalizedGoal || normalizedGoal.startsWith(normalizedTitle) || normalizedTitle.startsWith(normalizedGoal) || getTextOverlapScore(milestoneTitle, milestoneGoal) >= 2),
      );

      return {
         currentUnderstanding: trackedMilestone ? `The current milestone is ${milestoneTitle.replace(/[.!?]+$/, "")}.` : "This project does not have an active milestone selected.",
         assessment: trackedMilestone && milestoneGoal && !goalRepeatsTitle ? ensureSentence(milestoneGoal) : "",
         recommendation: trackedMilestone ? "" : nextMove ? `The best checkpoint to activate is ${nextMove.replace(/[.!?]+$/, "")}.` : "",
         reason: trackedMilestone && milestoneReason && getTextOverlapScore(milestoneReason, milestoneTitle) < 6 ? ensureSentence(milestoneReason) : "",
         watchOut: "",
         evidenceUsed: trackedMilestone ? uniqueStrings([milestoneTitle, milestoneGoal, milestoneReason], 6) : evidenceUsed,
      };
   }

   if (intent === "milestone-rationale") {
      const tracked = activeMilestone || understanding.milestones.find((milestone) => milestone.status === "active") || understanding.milestones.find((milestone) => milestone.status !== "complete");
      const reason = compactText(tracked?.whyItMatters || whyNow);
      const unlock = compactText(understanding.whatItUnlocks || afterThis);

      return {
         currentUnderstanding: "",
         assessment: reason ? ensureSentence(reason) : "This milestone comes first because the work after it depends on the decision or evidence it produces.",
         recommendation: "",
         reason: unlock ? ensureSentence(`Finishing it should make ${unlock.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} easier to complete`) : "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "next-milestone") {
      const ordered = [...understanding.milestones].sort((left, right) => left.order - right.order);
      const activeIndex = ordered.findIndex((milestone) => milestone.id === understanding.activeMilestoneId || milestone.status === "active");
      const next = activeIndex >= 0 ? ordered.slice(activeIndex + 1).find((milestone) => milestone.status !== "complete") : ordered.find((milestone) => milestone.status !== "complete");

      return {
         currentUnderstanding: next ? `The next milestone is ${next.title.replace(/[.!?]+$/, "")}.` : "There is no later unfinished milestone recorded.",
         assessment: next?.whyItMatters ? ensureSentence(next.whyItMatters) : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: next ? uniqueStrings([next.title, next.whyItMatters], 4) : [],
      };
   }

   if (intent === "milestone-completion") {
      const ordered = [...understanding.milestones].sort((left, right) => left.order - right.order);
      const activeIndex = ordered.findIndex((milestone) => milestone.id === understanding.activeMilestoneId || milestone.status === "active");
      const current = activeIndex >= 0 ? ordered[activeIndex] : ordered.find((milestone) => milestone.status !== "complete");
      const next = activeIndex >= 0 ? ordered.slice(activeIndex + 1).find((milestone) => milestone.status !== "complete") : undefined;

      return {
         currentUnderstanding: current ? `I’m treating ${current.title.replace(/[.!?]+$/, "")} as complete.` : "I could not identify the milestone you completed.",
         assessment: next ? `The project should now move to ${next.title.replace(/[.!?]+$/, "")}.` : "That completes the recorded milestone sequence.",
         recommendation: "",
         reason: next?.whyItMatters ? ensureSentence(next.whyItMatters) : "",
         watchOut: "",
         evidenceUsed: uniqueStrings([current?.title || "", next?.title || ""], 4),
      };
   }

   if (intent === "milestone-change") {
      const completed = understanding.completedWork.slice(-3);
      const current = activeMilestone || understanding.milestones.find((milestone) => milestone.status === "active");

      return {
         currentUnderstanding: completed.length ? `Completed work now includes ${completed.join(", ")}.` : "The completed milestone has been recorded.",
         assessment: current ? `The active focus is now ${current.title.replace(/[.!?]+$/, "")}.` : "There is no later active milestone recorded.",
         recommendation: "",
         reason: current?.whyItMatters ? ensureSentence(current.whyItMatters) : "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "recommendation-fit") {
      const previousRecommendation = compactText(conversation.lastRecommendation, 1600);
      const activeAction = getConcreteMilestoneAction(activeMilestone);
      const currentRecommendation = compactText(activeAction || nextMove || currentFocus, 1600);
      const sameDirection = Boolean(previousRecommendation && currentRecommendation && (normalizePrompt(previousRecommendation) === normalizePrompt(currentRecommendation) || getTextOverlapScore(previousRecommendation, currentRecommendation) >= 2));
      const dependency = understanding.dependencies.find(
         (item) => item.state !== "satisfied" && getTextOverlapScore(item.before, previousRecommendation || currentRecommendation) >= 1 && !isSameExecutiveWorkItem(item.before, previousRecommendation || currentRecommendation),
      );
      const relevantRisk = understanding.risks.find((risk) => getTextOverlapScore(`${risk.title} ${risk.consequence}`, previousRecommendation || currentRecommendation) >= 2);

      if (!previousRecommendation) {
         return {
            currentUnderstanding: "I do not have a previous recommendation recorded for this project turn.",
            assessment: currentRecommendation ? `The current project state points to ${ensureSentence(currentRecommendation)}` : "",
            recommendation: "",
            reason: whyNow ? ensureSentence(whyNow) : "",
            watchOut: relevantRisk?.consequence || "",
            evidenceUsed,
         };
      }

      if (sameDirection) {
         return {
            currentUnderstanding: `Yes. I would still recommend ${previousRecommendation.replace(/[.!?]+$/, "")}.`,
            assessment: activeMilestone
               ? buildMilestoneRelationshipRationale(packet, activeMilestone, getFollowingMilestone(packet, activeMilestone))
               : whyNow
                 ? ensureSentence(whyNow)
                 : "The project state has not introduced a stronger competing dependency.",
            recommendation: dependency ? ensureSentence(`Keep the recommendation provisional until ${dependency.before.replace(/[.!?]+$/, "")} is confirmed`) : "",
            reason: understanding.whatItUnlocks ? ensureSentence(understanding.whatItUnlocks) : "",
            watchOut: relevantRisk?.consequence || "",
            evidenceUsed: uniqueStrings([previousRecommendation, currentRecommendation, dependency?.reason || "", relevantRisk?.consequence || ""], 8),
         };
      }

      return {
         currentUnderstanding: `I would adjust the earlier recommendation. The project now points to ${currentRecommendation ? ensureSentence(currentRecommendation) : "a different active priority."}`,
         assessment: whyNow ? ensureSentence(whyNow) : "The current project state no longer supports treating the earlier move as the first priority.",
         recommendation: currentRecommendation,
         reason: understanding.whatItUnlocks ? ensureSentence(understanding.whatItUnlocks) : "",
         watchOut: relevantRisk?.consequence || "",
         evidenceUsed: uniqueStrings([previousRecommendation, currentRecommendation, latestProjectUpdate, relevantRisk?.consequence || ""], 8),
      };
   }

   if (intent === "milestone-fit") {
      const tracked = activeMilestone || understanding.milestones.find((milestone) => milestone.status === "active");
      const unresolved = understanding.unresolvedDecisions[0]?.statement;
      const blocked = understanding.openWork[0];

      return {
         currentUnderstanding: tracked ? `Yes. ${tracked.title.replace(/[.!?]+$/, "")} still matches the project’s current needs.` : "There is no active milestone to assess.",
         assessment: tracked?.whyItMatters ? ensureSentence(tracked.whyItMatters) : "",
         recommendation: unresolved ? ensureSentence(`Keep it active until this decision is resolved: ${unresolved}`) : blocked ? ensureSentence(`Keep it active until ${blocked.replace(/[.!?]+$/, "")} is addressed`) : "",
         reason: "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "missing-information") {
      const missing = uniqueStrings(
         [
            ...understanding.unresolvedDecisions.map((decision) => decision.statement),
            ...understanding.conversation.unresolvedQuestions,
            ...packet.readiness.missingChecks,
            ...packet.dependencies.filter((dependency) => dependency.state !== "satisfied").map((dependency) => dependency.text),
         ],
         6,
      );

      return {
         currentUnderstanding: "",
         assessment: missing.length ? missing.map((item, index) => `${index + 1}. ${item}`).join("\n") : "The saved project does not show a critical information gap right now.",
         recommendation: missing[0] ? ensureSentence(`Resolve ${missing[0].replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())} first`) : "",
         reason: "",
         watchOut: "",
         evidenceUsed: missing,
      };
   }

   if (intent === "skip-risk") {
      const tracked = activeMilestone || understanding.milestones.find((milestone) => milestone.status === "active");
      const next = understanding.milestones
         .filter((milestone) => milestone.status !== "complete")
         .sort((left, right) => left.order - right.order)
         .find((milestone) => tracked && milestone.order > tracked.order);
      const consequence = tracked?.risks[0] || understanding.risks[0]?.consequence || understanding.watchOuts[0];

      return {
         currentUnderstanding: tracked ? `Skipping ${tracked.title.replace(/[.!?]+$/, "")} would leave its key decision or evidence unresolved.` : "There is no active milestone to skip.",
         assessment: consequence ? ensureSentence(consequence) : next ? ensureSentence(`The next milestone may be built on assumptions that have not been checked`) : "",
         recommendation: tracked ? `Finish or deliberately close ${tracked.title.replace(/[.!?]+$/, "")} before moving on.` : "",
         reason: "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "evidence") {
      const milestone = activeMilestone || getAuthoritativeActiveMilestone(packet);
      const evidenceStatus = getMilestoneEvidenceStatus(packet, milestone);
      const savedEvidence = uniqueProjectFacts(
         [...(milestone?.completionEvidence || []), ...(milestone?.decisions || []), ...evidenceStatus.evidenceFacts].map((item) => cleanAuthoritativeStatement(item)),
         12,
      );

      return {
         currentUnderstanding: milestone
            ? savedEvidence.length
               ? `The evidence already available for ${milestone.title.replace(/[.!?]+$/, "")} is:`
               : `No concrete evidence is recorded yet for ${milestone.title.replace(/[.!?]+$/, "")}.`
            : "This project does not have an active milestone selected.",
         assessment: savedEvidence.length ? savedEvidence.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n") : "",
         recommendation: evidenceStatus.missing.length
            ? `Still missing:\n${evidenceStatus.missing.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
            : milestone && evidenceStatus.supported.length
              ? `The recorded evidence supports all completion checks for this milestone.`
              : "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([...savedEvidence, ...evidenceStatus.supported, ...evidenceStatus.missing], 18),
      };
   }

   if (intent === "material-carryover") {
      const milestone = activeMilestone || getAuthoritativeActiveMilestone(packet);
      const named = getPromptReferencedMaterial(packet, prompt);
      const relevant = getRelevantMaterialsForMilestone(packet, milestone);
      const fallback = relevant.length ? packet.materials.find((material) => material.id === relevant[0].id) : undefined;
      const material = named || fallback || packet.materials[0];
      const implications = getMaterialCarryoverImplications(packet, material, milestone);

      return {
         currentUnderstanding: material && milestone ? `These findings from ${material.title} still matter for the current milestone, ${milestone.title.replace(/[.!?]+$/, "")}:` : "I do not have both a saved material and an active milestone to connect.",
         assessment: implications.length
            ? implications.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")
            : material
              ? getMaterialEvidenceStatements(material, 5)
                   .map((item, index) => `${index + 1}. ${ensureSentence(item)}`)
                   .join("\n")
              : "",
         recommendation: milestone && implications.length ? `Use those findings as requirements for the current milestone; they should shape the work without reopening the milestone that was already completed.` : "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([material?.title || "", ...implications], 12),
      };
   }

   if (intent === "material-impact") {
      const material = getPromptReferencedMaterial(packet, prompt);
      const affected = getMostAffectedMilestoneForMaterial(packet, material);
      const facts = getMaterialEvidenceStatements(material, 5);
      const milestone = affected?.milestone;

      return {
         currentUnderstanding: material ? `${material.title} adds concrete evidence to ${milestone?.title || currentFocus || "the project"}.` : "No specific saved material is available for this question.",
         assessment: facts.length ? `It establishes:\n${facts.map((fact, index) => `${index + 1}. ${ensureSentence(fact)}`).join("\n")}` : material?.summary ? ensureSentence(material.summary) : "",
         recommendation: milestone && activeMilestone && milestone.id !== activeMilestone.id ? `It does not replace the current milestone. Keep it as evidence for ${milestone.title.replace(/[.!?]+$/, "")}.` : "",
         reason: milestone?.whyItMatters ? ensureSentence(milestone.whyItMatters) : "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([material?.title || "", ...facts, milestone?.title || ""], 12),
      };
   }

   if (intent === "material-milestone") {
      const material = getPromptReferencedMaterial(packet, prompt);
      const affected = getMostAffectedMilestoneForMaterial(packet, material);
      const milestone = affected?.milestone;

      return {
         currentUnderstanding: material && milestone ? `${material.title} affects ${milestone.title.replace(/[.!?]+$/, "")} most.` : "I cannot connect that material to a specific milestone from the saved evidence.",
         assessment: milestone ? ensureSentence(`Its details directly address the conditions, decisions, or completion checks inside ${milestone.title.replace(/[.!?]+$/, "")}`) : "",
         recommendation: activeMilestone && milestone && activeMilestone.id !== milestone.id ? `Keep the current milestone in place; this material becomes active evidence when the project reaches ${milestone.title.replace(/[.!?]+$/, "")}.` : "",
         reason: milestone?.whyItMatters ? ensureSentence(milestone.whyItMatters) : "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([material?.title || "", material?.summary || "", milestone?.title || ""], 10),
      };
   }

   if (intent === "material-completion") {
      const material = getPromptReferencedMaterial(packet, prompt);
      const current = activeMilestone || getAuthoritativeActiveMilestone(packet);
      const affected = getMostAffectedMilestoneForMaterial(packet, material);
      const support = getMaterialSupportForMilestone(material, current);
      const affectsDifferentMilestone = Boolean(affected?.milestone && current && affected.milestone.id !== current.id);

      return {
         currentUnderstanding:
            !material || !current
               ? "I do not have both a saved material and an active milestone to compare."
               : support.supported.length
                 ? `${material.title} supports ${support.supported.length} completion check${support.supported.length === 1 ? "" : "s"} inside ${current.title.replace(/[.!?]+$/, "")}, but it does not complete the milestone by itself.`
                 : `No. ${material.title} does not complete any part of ${current.title.replace(/[.!?]+$/, "")}.`,
         assessment: support.supported.length
            ? `It supports:\n${support.supported.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}`
            : affectsDifferentMilestone
              ? `Its strongest connection is ${affected?.milestone.title.replace(/[.!?]+$/, "")}, not the active milestone.`
              : "The material does not match the active milestone’s recorded completion criteria.",
         recommendation: support.missing.length ? `The active milestone still needs:\n${support.missing.map((item, index) => `${index + 1}. ${ensureSentence(item)}`).join("\n")}` : "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([material?.title || "", ...support.supported, ...support.missing, affected?.milestone.title || ""], 16),
      };
   }

   if (intent === "material-source") {
      const active = activeMilestone || getAuthoritativeActiveMilestone(packet);
      const relevant = getRelevantMaterialsForMilestone(packet, active);
      const named = getPromptReferencedMaterial(packet, prompt);
      const materials = named ? [named] : relevant.length ? (relevant.map((item) => packet.materials.find((material) => material.id === item.id)).filter(Boolean) as ProjectMaterialSignal[]) : packet.materials.slice(0, 1);

      return {
         currentUnderstanding: materials.length ? `I’m using ${materials.map((material) => material.title).join(", ")} for that answer.` : "No saved material was used for that answer.",
         assessment: materials.length
            ? uniqueProjectFacts(
                 materials.flatMap((material) => getMaterialEvidenceStatements(material, 3)),
                 6,
              )
                 .map((item, index) => `${index + 1}. ${ensureSentence(item)}`)
                 .join("\n")
            : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts(
            materials.flatMap((material) => [material.title, material.summary]),
            10,
         ),
      };
   }

   if (intent === "option-comparison" || intent === "option-recommendation" || intent === "option-vs-existing" || intent === "option-counterargument" || intent === "option-change-condition" || intent === "purchase-deferral") {
      const evaluation = getProjectOptionDecisionEvaluation(packet, prompt, conversation, activeMilestone);
      const recommended = getProjectOptionByConversation(evaluation, conversation);

      if (!evaluation.options.length || !recommended) {
         return {
            currentUnderstanding: "I do not have enough recorded option detail to compare the choices reliably.",
            assessment: "Record each option’s cost, intended benefit, and main tradeoff inside the active milestone, then compare them again.",
            recommendation: "",
            reason: "",
            watchOut: "",
            evidenceUsed: [],
         };
      }

      if (intent === "option-comparison") {
         const ranked = evaluation.options.map((option) => getOptionComparisonLine(option, option.name === recommended.name)).join("\n");
         const bestReason = uniqueProjectFacts(
            [
               ...recommended.strengths.filter((item) => !/^this includes\b/i.test(item) && !/^includes\b/i.test(item)),
               typeof recommended.budgetRemaining === "number" ? `${formatProjectMoney(recommended.budgetRemaining)} remains after the package before any unlisted accessories` : "",
            ],
            3,
         );

         return {
            currentUnderstanding: evaluation.budget ? `All recorded options fit within the ${formatProjectMoney(evaluation.budget)} decision budget, but they do not fit the project equally well.` : "The options do not fit the project equally well.",
            assessment: ranked,
            recommendation: `Best buy-now fit: ${getOptionDisplayLabel(recommended)}.`,
            reason: bestReason.length ? bestReason.map((item) => ensureSentence(item)).join(" ") : "",
            watchOut: evaluation.shouldPostpone ? "The project’s own validation plan supports testing the existing setup before committing most of the remaining budget." : "",
            evidenceUsed: uniqueProjectFacts(
               evaluation.options.flatMap((option) => [option.name, option.description]),
               18,
            ),
         };
      }

      if (intent === "option-recommendation") {
         const strengths = uniqueProjectFacts(
            recommended.strengths.filter((item) => !/^this includes\b/i.test(item) && !/^includes\b/i.test(item)),
            3,
         );
         const tradeoffs = uniqueProjectFacts(recommended.tradeoffs, 2);
         const budgetSentence = typeof recommended.budgetRemaining === "number" ? `${formatProjectMoney(recommended.budgetRemaining)} would remain before any unlisted accessories or replacement parts` : "";

         return {
            currentUnderstanding: `If the project is choosing among these options now, I recommend ${getOptionDisplayLabel(recommended)}.`,
            assessment: uniqueProjectFacts([...strengths, budgetSentence, tradeoffs.length ? `The main tradeoff is ${lowerSentenceStart(tradeoffs.join("; "))}` : ""], 5)
               .map((item) => ensureSentence(item))
               .join(" "),
            recommendation: evaluation.shouldPostpone
               ? `Treat that as the best buy-now option, not an automatic purchase. Keep the budget reserved until the first real projects show that the existing setup cannot meet the required accuracy, safety, or workflow.`
               : `Choose ${recommended.name} only after confirming the package includes every accessory required for safe use within the recorded budget.`,
            reason: evaluation.validationBeforeExpansion ? ensureSentence(evaluation.validationBeforeExpansion) : "",
            watchOut: "",
            evidenceUsed: uniqueProjectFacts([recommended.description, ...evaluation.requirements], 16),
         };
      }

      if (intent === "option-vs-existing") {
         const overlap = evaluation.existingOverlap || getExistingOptionOverlap(recommended);
         const improvements = uniqueProjectFacts(
            recommended.strengths.filter((item) => !/\bthis includes\b/i.test(item)),
            3,
         );
         const overlapSentence = overlap ? `Its advantage is incremental rather than completely new because it overlaps with ${overlap}.` : "It should only replace the existing approach if it removes a measured accuracy, safety, or setup problem.";

         return {
            currentUnderstanding: `${recommended.name} is better than the current setup only in the areas its guided system improves.`,
            assessment: [improvements.length ? improvements.map((item) => ensureSentence(item)).join(" ") : "", overlapSentence].filter(Boolean).join(" "),
            recommendation: `Do not buy it merely because it is a more specialized tool; buy it only if the existing setup fails a real project on accuracy, repeatability, dust control, or setup effort.`,
            reason: "",
            watchOut: "",
            evidenceUsed: uniqueProjectFacts([recommended.description, overlap, ...evaluation.requirements], 14),
         };
      }

      if (intent === "option-counterargument") {
         const objections = uniqueProjectFacts(
            [
               ...recommended.tradeoffs,
               evaluation.existingOverlap ? `Some of its capability overlaps with ${evaluation.existingOverlap}` : "",
               typeof recommended.budgetRemaining === "number" && recommended.budgetRemaining < 100 ? `It would leave only ${formatProjectMoney(recommended.budgetRemaining)} before unlisted accessories or replacement parts` : "",
               evaluation.validationBeforeExpansion,
            ],
            4,
         );

         return {
            currentUnderstanding: `The strongest argument against ${recommended.name} is that the project may be paying for refinement before proving the existing setup is inadequate.`,
            assessment: objections.map((item) => ensureSentence(item.replace(/^./, (character) => character.toUpperCase()))).join(" "),
            recommendation: `Keep the recommendation conditional: use the first real projects to prove that the specific limitation this option solves is actually blocking the work.`,
            reason: "",
            watchOut: "",
            evidenceUsed: uniqueProjectFacts([recommended.description, ...objections], 14),
         };
      }

      if (intent === "option-change-condition") {
         const conditions = getAlternativeOptionConditions(evaluation, recommended);
         const existingSetupCondition = evaluation.existingOverlap
            ? `I would also change the recommendation to “buy nothing yet” if the existing setup using ${evaluation.existingOverlap} can complete the first projects with acceptable accuracy, cleanup, and setup time.`
            : `I would change the recommendation to “buy nothing yet” if the existing setup can complete the first projects with acceptable accuracy, cleanup, and setup time.`;

         return {
            currentUnderstanding: `I would change the recommendation if the first real projects reveal a different bottleneck than the one ${recommended.name} solves.`,
            assessment: [...conditions, existingSetupCondition]
               .filter(Boolean)
               .map((item, index) => `${index + 1}. ${ensureSentence(item)}`)
               .join("\n"),
            recommendation: `Use observed project friction—not workshop convention—to decide whether the recommendation should change.`,
            reason: "",
            watchOut: "",
            evidenceUsed: uniqueProjectFacts(
               evaluation.options.flatMap((option) => [option.name, option.description]),
               18,
            ),
         };
      }

      const existingTool = evaluation.existingOverlap || "the existing tools and portable guide";
      const budgetPressure = evaluation.options
         .filter((option) => typeof option.budgetRemaining === "number")
         .map((option) => `${option.name} would leave ${formatProjectMoney(option.budgetRemaining)}`)
         .join("; ");

      return {
         currentUnderstanding: evaluation.shouldPostpone
            ? "Yes. Postponing the major-tool purchase is the stronger project decision right now."
            : "Postponing is reasonable, but the project does not yet contain enough evidence to say it is clearly better than every buy-now option.",
         assessment: uniqueProjectFacts(
            [
               evaluation.validationBeforeExpansion,
               `The project already has an existing setup using ${existingTool} available for the first real tests`,
               budgetPressure ? `Every option consumes most of the remaining decision budget: ${budgetPressure}` : "",
               `Waiting preserves the budget until the work reveals whether the real bottleneck is straight-cut accuracy, repeated crosscuts, ripping, dust control, or setup effort`,
            ],
            5,
         )
            .map((item) => ensureSentence(item))
            .join(" "),
         recommendation: `Keep the ${evaluation.budget ? formatProjectMoney(evaluation.budget) : "remaining"} reserve intact through at least the first real project, then revisit ${recommended.name} only if the existing setup produces a repeatable limitation.`,
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueProjectFacts([evaluation.validationBeforeExpansion, recommended.description, ...evaluation.requirements], 18),
      };
   }

   if (intent === "material-next") {
      const materialMove = getCanonicalMaterialNextMove(packet, currentFocus, afterThis);

      return {
         currentUnderstanding: "The material does not replace the current milestone; it makes it more specific.",
         assessment: materialMove.recommendation,
         recommendation: "",
         reason: materialMove.reason,
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "material-tension") {
      const tensions = understanding.tensions;

      return {
         currentUnderstanding: "",
         assessment: tensions.length ? tensions.map((tension, index) => `${index + 1}. ${tension.sideA} conflicts with ${tension.sideB}. ${tension.consequence}`).join("\n") : "I do not see a supported tension in the saved project evidence.",
         recommendation: tensions[0]?.decisionNeeded || "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueStrings(
            tensions.flatMap((tension) => tension.evidence.map((item) => item.quote)),
            20,
         ),
      };
   }

   if (intent === "material-decisions") {
      const decisions = getCanonicalMaterialDecisions(packet);
      return {
         currentUnderstanding: "",
         assessment: normalizePrompt(prompt).includes("unresolved")
            ? decisions.unresolved.length
               ? decisions.unresolved.map((item, index) => `${index + 1}. ${item}`).join("\n")
               : "The material does not leave a clear strategic decision unresolved."
            : decisions.decided.length
              ? decisions.decided.map((item, index) => `${index + 1}. ${item}`).join("\n")
              : "The material does not record any clear final decisions yet.",
         recommendation: normalizePrompt(prompt).includes("unresolved") || !decisions.unresolved.length ? "" : `Still unresolved:\n${decisions.unresolved.map((item, index) => `${index + 1}. ${item}`).join("\n")}`,
         reason: "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "material-rationale") {
      const tension = understanding.tensions[0];
      const unresolved = understanding.unresolvedDecisions[0];

      return {
         currentUnderstanding: currentFocus ? `The current checkpoint is ${currentFocus.replace(/[.!?]+$/, "")}.` : "",
         assessment: tension ? ensureSentence(`${tension.sideA} is in tension with ${tension.sideB}`) : unresolved ? ensureSentence(`The recommendation is addressing the unresolved decision: ${unresolved.statement}`) : ensureSentence(whyNow),
         recommendation: tension?.decisionNeeded || unresolved?.statement || nextMove,
         reason: understanding.whatItUnlocks || whyNow,
         watchOut: tension?.consequence || understanding.watchOuts[0] || "",
         evidenceUsed: uniqueStrings([...evidenceUsed, ...(tension?.evidence.map((item) => item.quote) || []), ...(unresolved?.evidence.map((item) => item.quote) || [])], 20),
      };
   }

   if (intent === "material-recommendation") {
      const materialMove = getCanonicalMaterialNextMove(packet, currentFocus, afterThis);
      const tensions = understanding.tensions;
      const decisions = getCanonicalMaterialDecisions(packet);

      return {
         currentUnderstanding: currentFocus ? ensureSentence(`The current checkpoint is ${currentFocus.replace(/[.!?]+$/, "")}`) : "",
         assessment: tensions[0]
            ? ensureSentence(`${tensions[0].sideA} is in tension with ${tensions[0].sideB}`)
            : decisions.unresolved[0]
              ? ensureSentence(`The main unresolved decision is ${decisions.unresolved[0]}`)
              : "The selected material supports the current checkpoint without changing the project direction.",
         recommendation: materialMove.recommendation,
         reason: materialMove.reason,
         watchOut: understanding.watchOuts[0] || "",
         evidenceUsed: uniqueStrings(
            [...evidenceUsed, ...understanding.confirmedDecisions.flatMap((decision) => decision.evidence.map((item) => item.quote)), ...understanding.unresolvedDecisions.flatMap((decision) => decision.evidence.map((item) => item.quote))],
            20,
         ),
      };
   }

   if (intent === "milestone-focus") {
      return {
         currentUnderstanding: currentFocus ? `The saved current checkpoint is ${currentFocus.replace(/[.!?]+$/, "")}.` : "",
         assessment: "That sounds like a move toward another progress checkpoint. Before switching, either finish the current checkpoint or mark it complete so Project Understanding and the homepage advance with you.",
         recommendation: afterThis ? `The next saved checkpoint is ${afterThis.replace(/[.!?]+$/, "")}.` : "",
         reason: whyNow,
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "priority-decision") {
      const explicitDecision = understanding.unresolvedDecisions[0];
      const decision = explicitDecision?.statement || getPriorityDecisionStatement(packet);
      const active = getAuthoritativeActiveMilestone(packet);
      const next = active ? getFollowingMilestone(packet, active) : undefined;
      const rationale = explicitDecision ? getPriorityDecisionReason(packet, explicitDecision.statement) : buildMilestoneRelationshipRationale(packet, active, next);

      return {
         currentUnderstanding: decision ? `The most important unresolved decision is: ${formatAuthoritativeQuestion(decision)}` : "No unresolved decision can be inferred from the saved project state.",
         assessment: rationale,
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: explicitDecision
            ? uniqueStrings(
                 explicitDecision.evidence.map((evidence) => evidence.quote),
                 12,
              )
            : uniqueProjectFacts([active?.title || "", active?.whyItMatters || "", next?.title || ""], 8),
      };
   }

   if (intent === "priority-rationale") {
      const priorityDecision = understanding.unresolvedDecisions[0];
      const priorWasFactPriority = conversation.previousIntent === "priority-fact";
      const dependency = understanding.dependencies.find((item) => item.state !== "satisfied");

      if (priorWasFactPriority) {
         return {
            // "Why?" after a fact-priority judgment explains the controlling
            // dependency, not a different unresolved decision.
            currentUnderstanding: "",
            assessment: activeMilestone?.whyItMatters
               ? ensureSentence(activeMilestone.whyItMatters)
               : dependency?.reason
                 ? ensureSentence(dependency.reason)
                 : whyNow
                   ? ensureSentence(whyNow)
                   : "This is the earliest unresolved dependency that changes the work that follows.",
            recommendation: "",
            reason: afterThis ? ensureSentence(`Resolving it clears the path into ${afterThis.replace(/[.!?]+$/, "")}`) : "",
            watchOut: "",
            evidenceUsed: uniqueStrings([activeMilestone?.whyItMatters || "", dependency?.reason || "", afterThis], 8),
         };
      }

      const inferredDecision = getPriorityDecisionStatement(packet);
      const active = getAuthoritativeActiveMilestone(packet);
      const next = active ? getFollowingMilestone(packet, active) : undefined;
      return {
         // The previous turn already named the ranked decision. This follow-up
         // explains the controlling dependency without restarting the project.
         currentUnderstanding: "",
         assessment: priorityDecision ? getPriorityDecisionReason(packet, priorityDecision.statement) : buildMilestoneRelationshipRationale(packet, active, next) || "This decision controls the standard the work that follows must use.",
         recommendation: "",
         reason: next ? ensureSentence(`Resolving it clears the path into ${next.title.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`) : "",
         watchOut: "",
         evidenceUsed: priorityDecision
            ? uniqueStrings(
                 priorityDecision.evidence.map((evidence) => evidence.quote),
                 12,
              )
            : uniqueProjectFacts([inferredDecision, active?.title || "", next?.title || ""], 8),
      };
   }

   if (intent === "rationale") {
      return {
         currentUnderstanding: currentFocus ? ensureSentence(currentFocus) : "",
         assessment: whyNow || ensureSentence("This is the first unfinished checkpoint that the later work depends on"),
         recommendation: afterThis ? ensureSentence(`Once it is settled, move to ${afterThis.replace(/[.!?]+$/, "")}`) : "",
         reason: "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "progress-points") {
      const points = understanding.milestones.map((milestone, index) => `${index + 1}. ${milestone.title}${milestone.status === "complete" ? " — complete" : milestone.status === "active" ? " — current" : ""}`);

      return {
         currentUnderstanding: "",
         assessment: points.join("\n"),
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "relationship") {
      const confirmed = understanding.confirmedDecisions.slice(0, 4);
      const unresolved = understanding.unresolvedDecisions.slice(0, 3);
      const options = understanding.options.slice(0, 3);
      const relationships = understanding.dependencies.slice(0, 5);

      const assessment = confirmed.length
         ? confirmed.map((decision) => ensureSentence(decision.statement)).join(" ")
         : relationships.length
           ? relationships.map((dependency) => ensureSentence(`${dependency.before} informs ${dependency.after}`)).join(" ")
           : "The project does not yet contain enough explicit evidence to define the relationship confidently.";

      const recommendation = unresolved[0]?.statement ? ensureSentence(unresolved[0].statement) : options.length >= 2 ? ensureSentence(`Compare ${options[0].name} with ${options[1].name} against the project goal and constraints`) : nextMove;

      return {
         currentUnderstanding: "",
         assessment,
         recommendation,
         reason: whyNow,
         watchOut: understanding.watchOuts[0] || "",
         evidenceUsed: uniqueStrings([...confirmed.flatMap((decision) => decision.evidence.map((evidence) => evidence.quote)), ...unresolved.flatMap((decision) => decision.evidence.map((evidence) => evidence.quote))]),
      };
   }

   if (intent === "hierarchy-comparison" || intent === "hierarchy-explanation") {
      const options = understanding.options.slice(0, 4);
      const tension = understanding.tensions[0];

      if (!options.length) {
         return {
            currentUnderstanding: "",
            assessment: "No explicit options are recorded yet, so there is nothing evidence-based to compare.",
            recommendation: "",
            reason: "",
            watchOut: "",
            evidenceUsed: [],
         };
      }

      const assessment = options
         .map((option, index) => {
            const advantages = option.advantages.length ? ` Advantages: ${option.advantages.join("; ")}.` : "";
            const disadvantages = option.disadvantages.length ? ` Disadvantages: ${option.disadvantages.join("; ")}.` : "";
            return `${index + 1}. ${option.name}.${advantages}${disadvantages} ${option.fitWithGoal}`.trim();
         })
         .join("\n");

      return {
         currentUnderstanding: tension ? ensureSentence(`${tension.sideA} is in tension with ${tension.sideB}`) : "",
         assessment,
         recommendation: tension?.decisionNeeded || nextMove,
         reason: whyNow,
         watchOut: tension?.consequence || understanding.watchOuts[0] || "",
         evidenceUsed: uniqueStrings(options.flatMap((option) => option.evidence.map((item) => item.quote))),
      };
   }

   if (intent === "decision") {
      const confirmed = understanding.confirmedDecisions.slice(0, 10);

      return {
         currentUnderstanding: "",
         assessment: confirmed.length ? confirmed.map((decision, index) => `${index + 1}. ${decision.statement}`).join("\n") : "No confirmed decisions are explicitly recorded yet.",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueStrings(
            confirmed.flatMap((decision) => decision.evidence.map((evidence) => evidence.quote)),
            20,
         ),
      };
   }

   if (intent === "conversation-summary") {
      const completed = understanding.completedWork.length ? `Completed: ${understanding.completedWork.join(", ")}.` : "";
      const decisions = understanding.decisions.length ? `Decided: ${understanding.decisions.join(", ")}.` : "";
      const current = currentFocus ? `Current focus: ${currentFocus}.` : "";

      return {
         currentUnderstanding: "",
         assessment: [completed, decisions, current].filter(Boolean).join(" ") || "The project has a clear current focus, but no completed decisions have been recorded yet.",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "unresolved") {
      // Read back choices only. Milestones, research tasks, implementation
      // work, and generated open-work items stay in their own routes.
      const unresolved = getUnresolvedDecisionReadbackItems(understanding);
      const supportingEvidence = understanding.unresolvedDecisions.filter((decision) => unresolved.some((item) => getDecisionReadbackOverlap(item, decision.statement) >= 0.6)).flatMap((decision) => decision.evidence.map((evidence) => evidence.quote));

      return {
         currentUnderstanding: "",
         assessment: unresolved.length ? unresolved.map((item, index) => `${index + 1}. ${item}`).join("\n") : "No unresolved decisions are explicitly recorded.",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed: uniqueStrings(supportingEvidence, 20),
      };
   }

   if (intent === "risk") {
      const severityRank = { high: 3, medium: 2, low: 1 } as const;
      const riskItems = understanding.risks
         .filter((item, index, items) => items.findIndex((candidate) => candidate.title.toLowerCase() === item.title.toLowerCase()) === index)
         .sort((left, right) => severityRank[right.severity] - severityRank[left.severity])
         .slice(0, 3);
      const primary = riskItems[0];
      const secondary = riskItems[1];
      const mitigation = compactText(primary?.mitigation || nextMove);

      const assessment = primary
         ? ensureSentence(primary.title)
         : openWork.length > 1
           ? ensureSentence(`The main thing to watch is the handoff between ${openWork[0]} and ${openWork[1]}; neither should be assumed complete until it is confirmed`)
           : "I do not see a major hidden risk in the notes yet, but the current milestone still needs a clear confirmation before the project moves on.";

      const reason = secondary ? ensureSentence(secondary.title) : "";
      const watchOut = mitigation
         ? ensureSentence(
              mitigation
                 .replace(/[.!?]+$/, "")
                 .replace(/^book\b/i, "I’d book")
                 .replace(/^confirm\b/i, "I’d confirm")
                 .replace(/^send\b/i, "I’d send")
                 .replace(/^test\b/i, "I’d test")
                 .replace(/^coordinate\b/i, "I’d coordinate")
                 .replace(/^(?!I’d\b)/, "I’d "),
           )
         : "";

      return {
         currentUnderstanding: "",
         assessment,
         recommendation: "",
         reason,
         watchOut,
         evidenceUsed,
      };
   }

   if (intent === "readiness") {
      const incomplete = openWork.slice(0, 5);

      if (!incomplete.length && understanding.momentum === "complete") {
         return {
            currentUnderstanding: "",
            assessment: successState ? ensureSentence(`Yes. ${successState}`) : "Yes. The project has reached its finished outcome.",
            recommendation: "",
            reason: "",
            watchOut: "",
            evidenceUsed,
         };
      }

      const conciseItems = incomplete.map((item) => getProjectLeadWorkLabel(item));
      const uniqueItems = uniqueStrings(conciseItems, 5);
      const unresolvedSummary = uniqueItems.length === 1 ? uniqueItems[0] : uniqueItems.length === 2 ? `${uniqueItems[0]} and ${uniqueItems[1]}` : `${uniqueItems.slice(0, -1).join(", ")}, and ${uniqueItems[uniqueItems.length - 1]}`;

      return {
         currentUnderstanding: "",
         assessment: ensureSentence(uniqueItems.length ? `Not yet. ${unresolvedSummary} ${uniqueItems.length === 1 ? "is" : "are"} still open` : "Not yet. The finished outcome has not been confirmed"),
         recommendation: "",
         reason: successState ? ensureSentence(`Once those pieces are confirmed, ${successState.replace(/[.!?]+$/, "").replace(/^./, (character) => character.toLowerCase())}`) : whyNow,
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "project-understanding") {
      // A project-about question should explain the project, not silently turn
      // into a priority recommendation or risk review. Keep the readback
      // focused on the goal and current situation.
      const situationRepeatsGoal = Boolean(goal && situation && getTextOverlapScore(goal, situation) >= 5);
      const readableSituation = formatProjectSituationReadback(situation);

      return {
         currentUnderstanding: goal ? ensureSentence(goal) : "",
         assessment: readableSituation && !situationRepeatsGoal ? readableSituation : "",
         recommendation: "",
         reason: "",
         watchOut: "",
         evidenceUsed,
      };
   }

   if (intent === "simplification") {
      return {
         currentUnderstanding: situation ? ensureSentence(situation) : "",
         assessment: currentFocus ? ensureSentence(`Keep the project centered on ${currentFocus.replace(/[.!?]+$/, "")}`) : "",
         recommendation: nextMove,
         reason: whyNow,
         watchOut: primaryRisk,
         evidenceUsed,
      };
   }

   if (intent === "next-action") {
      const tracked = activeMilestone || understanding.milestones.find((milestone) => milestone.status === "active");
      const milestoneTitle = compactText(tracked?.title || nextMove);
      const concreteStart = compactText(tracked?.startingPrompt);
      const rationale = compactText(tracked?.whyItMatters || whyNow);
      const followingMilestone = getImmediateFollowingMilestoneLabel(afterThis);
      const continuation = followingMilestone && !isSameExecutiveWorkItem(followingMilestone, milestoneTitle) ? ensureSentence(`After that, continue with ${followingMilestone.replace(/^./, (character) => character.toLowerCase())}`) : "";
      const riskIsRelevant = Boolean(primaryRisk && getTextOverlapScore(primaryRisk, `${milestoneTitle} ${rationale}`) >= 2 && !/no detected timeline|milestone sequencing may be unreliable/i.test(primaryRisk));

      return {
         currentUnderstanding: milestoneTitle ? `Work on ${milestoneTitle.replace(/[.!?]+$/, "")} next.` : "I do not have a clear next action yet.",
         assessment: concreteStart && !isSameExecutiveWorkItem(concreteStart, milestoneTitle) ? ensureSentence(concreteStart) : "",
         recommendation: "",
         reason: [rationale ? ensureSentence(rationale) : "", continuation].filter(Boolean).join(" "),
         watchOut: riskIsRelevant ? primaryRisk : "",
         evidenceUsed: uniqueStrings([milestoneTitle, concreteStart, rationale, followingMilestone], 8),
      };
   }

   if (intent === "project-lead" || intent === "general") {
      const followingMilestone = getImmediateFollowingMilestoneLabel(afterThis);
      const continuation = followingMilestone ? ensureSentence(`After that, continue with ${followingMilestone.replace(/^./, (character) => character.toLowerCase())}`) : "";

      return {
         currentUnderstanding: "",
         assessment: nextMove,
         recommendation: "",
         reason: [whyNow, continuation].filter(Boolean).join(" "),
         watchOut: primaryRisk,
         evidenceUsed,
      };
   }

   return null;
}

// ========================================
// Public guidance builder
// ========================================

export function buildProjectGuidance(input: ProjectGuidanceInput): ProjectGuidanceResult {
   const intent = getProjectGuidanceIntent(input.prompt, input.conversation, input.packet);
   const packet = input.packet;

   if (!packet.projectTitle) {
      const response = "I do not have an active project yet.";

      return {
         handled: false,
         intent,
         response,
         judgment: response,
         reason: "",
         nextAction: "",
         watchOut: "",
         profile: packet.reasoningProfile || "general",
         currentUnderstanding: response,
         assessment: "",
         evidenceUsed: [],
         confidence: 0,
         coachingMode: getProjectCoachingMode(input.prompt),
         subject: { kind: "none", title: "", detail: "" },
      };
   }

   const coachingMode = getProjectCoachingMode(input.prompt);
   const profileDraft = buildProfileGuidance(packet, input.fallbackNextAction);
   const authoritativeDraft = buildAuthoritativeProjectConversationDraft(intent, packet, input.prompt, input.conversation || {});
   const canonicalDraft = buildCanonicalProjectUnderstandingDraft(intent, packet, input.prompt, input.conversation);
   const groundedDraft = authoritativeDraft || canonicalDraft || applyIntent(intent, packet, profileDraft, input.prompt);
   const draft = authoritativeDraft ? groundedDraft : applyDecisionCoachMode(coachingMode, input.prompt, packet, groundedDraft);
   const response = formatResponse(draft, intent, coachingMode);
   const confidence = Math.max(0, Math.min(98, Math.round(packet.confidence * 0.7 + packet.reasoningProfileConfidence * 0.3)));

   const actionIntents: ProjectGuidanceIntent[] = [
      "next-action",
      "next-action-detail",
      "priority-decision",
      "simplification",
      "project-lead",
      "senior-assessment",
      "completed-project-observations",
      "conditional-option-reconsideration",
      "completed-decision-retrospective",
      "ordered-actions",
      "material-next",
      "material-recommendation",
      "option-recommendation",
      "purchase-deferral",
   ];
   const nextAction = actionIntents.includes(intent)
      ? draft.recommendation || (intent === "next-action" || intent === "next-action-detail" || intent === "ordered-actions" ? draft.currentUnderstanding : "") || packet.projectUnderstanding?.recommendedMove || packet.projectLeadState?.nextMove || ""
      : "";
   const subject = getProjectGuidanceSubject(intent, packet, input.conversation || {}, draft);

   return {
      handled: true,
      intent,
      response,
      judgment: draft.assessment,
      reason: draft.reason,
      nextAction,
      watchOut: draft.watchOut,
      profile: packet.reasoningProfile,
      currentUnderstanding: draft.currentUnderstanding,
      assessment: draft.assessment,
      evidenceUsed: uniqueStrings(draft.evidenceUsed),
      confidence,
      coachingMode,
      subject,
   };
}
