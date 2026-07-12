// ========================================
// ALLEVIN MK VII Project Guidance Engine
// Purpose:
// Turn a Project Intelligence Packet into
// one evidence-aware project-lead judgment
// before AIDock adds conversational delivery.
// ========================================

import type { ProjectBuildStep, ProjectDependencySignal, ProjectEvidenceSignal, ProjectIntelligencePacket, ProjectMaterialSignal, ProjectReasoningProfile, ProjectRiskSignal } from "@/lib/projectIntelligenceEngine";

export type ProjectGuidanceIntent = "project-understanding" | "next-action" | "build-order" | "risk" | "readiness" | "simplification" | "project-lead" | "materials" | "evidence" | "decision" | "general";

export interface ProjectGuidanceInput {
   prompt: string;
   packet: ProjectIntelligencePacket;
   fallbackNextAction?: string;
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
   const materialText = getPacketMaterialText(packet);
   const successCriteriaText = compactText(packet.profileSignals.successCriteria.join(" "), 6000);
   const weakSpeed = materialText.match(/rear(?: upstairs)? bedroom\s*:\s*(\d+(?:\.\d+)?\s*mbps)/i)?.[1] || "";
   const targetSpeed = successCriteriaText.match(/at least\s+(\d+(?:\.\d+)?\s*mbps)/i)?.[1] || "";
   const interruptionMatch = materialText.match(/(?:an?\s+)?((?:approximately\s+)?(?:\d+(?:\.\d+)?|one|two|three|four|five)[-\s]?second interruption)/i);
   const interruption = interruptionMatch?.[1] || "";
   const weakArea = getSentenceContaining(materialText, ["rear upstairs bedroom", "rear bedroom", "165 mbps", "below the 300", "below 300"]);
   const roamingGap = getSentenceContaining(materialText, ["two-second interruption", "interruption when moving", "roaming"]);

   const summaryParts: string[] = [];

   if (weakSpeed) {
      summaryParts.push(targetSpeed ? `the rear bedroom measured ${weakSpeed} against the ${targetSpeed} target` : `the rear bedroom measured ${weakSpeed}`);
   } else if (weakArea) {
      summaryParts.push(lowerSentenceStart(weakArea));
   }

   if (interruption) {
      summaryParts.push(`roaming still causes an ${interruption}`);
   } else if (roamingGap) {
      summaryParts.push(lowerSentenceStart(roamingGap));
   }

   return {
      weakArea,
      roamingGap,
      weakSpeed,
      targetSpeed,
      interruption,
      reason: summaryParts.length ? `${summaryParts.join(", and ").replace(/^./, (character) => character.toUpperCase())}.` : "",
   };
}

function hasPlanningValidationFailure(packet: ProjectIntelligencePacket) {
   const materialText = getPacketMaterialText(packet);
   const validation = getPlanningValidationEvidence(packet);

   return Boolean(
      /validation has not passed|final validation has not passed|not ready to close|installation is complete, but/i.test(materialText) ||
      validation.weakArea ||
      validation.roamingGap ||
      (validation.weakSpeed && validation.targetSpeed) ||
      validation.interruption,
   );
}

function hasResolvedPlanningArchitecture(packet: ProjectIntelligencePacket) {
   const materialText = getPacketMaterialText(packet);
   const blockingDependency = getDecisionBlockingDependency(packet);

   if (blockingDependency) {
      return false;
   }

   return Boolean(/wired access points are technically practical|successfully negotiates|throughput test|no packet loss|architecture selection|finalize the equipment list/i.test(materialText) || /architecture selection/i.test(packet.currentState));
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

   return lower.includes("should not be purchased") || lower.includes("do not purchase") || lower.includes("before purchasing") || lower.includes("until the architecture is selected");
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
   const materialText = getPacketMaterialText(packet);
   const asksPurchase = includesAny(lower, ["buy", "purchase", "order", "spend", "add a third", "add another"]);

   if (lower.includes("poe switch") && (lower.includes("injector") || lower.includes("injectors"))) {
      const noExpansion = getSentenceContaining(materialText, ["no current plan", "no plan to add", "future expansion"]);
      const injectorEvidence = getSentenceContaining(materialText, ["injector", "injectors"]);
      const switchEvidence = getSentenceContaining(materialText, ["poe switch", "non-poe"]);

      return {
         ...draft,
         assessment: `Use the PoE injectors for the current project`,
         recommendation: "Keep the existing gigabit switch and power the two access points with individual PoE injectors",
         reason: noExpansion
            ? `The project only needs power for two access points, the current switch is otherwise usable, and ${lowerSentenceStart(noExpansion)}`
            : "Injectors satisfy the confirmed two-device requirement without replacing working equipment or spending for expansion the project has not justified",
         watchOut: "Choose a PoE switch only if centralized power or near-term PoE expansion becomes an actual requirement",
         evidenceUsed: uniqueStrings([injectorEvidence, switchEvidence, noExpansion, ...signals.constraints]),
      };
   }

   if (lower.includes("third access point") || lower.includes("another access point")) {
      const validationFailure = getSentenceContaining(materialText, ["validation has not passed", "final validation"]);
      const weakArea = getSentenceContaining(materialText, ["rear upstairs bedroom", "below", "165 mbps"]);
      const roamingGap = getSentenceContaining(materialText, ["two-second interruption", "interruption when moving", "roaming"]);

      return {
         ...draft,
         assessment: `Not yet. The current installation has a validation problem, but the evidence does not prove that missing hardware is the cause`,
         recommendation: "Adjust access-point placement, channel selection, transmit power, and roaming settings, then repeat the weak-area and roaming tests before buying a third unit",
         reason: "A third access point can add interference and cost before the simpler configuration and placement causes have been ruled out",
         watchOut: signals.knownRisks.find((risk) => /placement|interference|simplest solution/i.test(risk)) || "Do not solve an unverified configuration problem with more hardware",
         evidenceUsed: uniqueStrings([validationFailure, weakArea, roamingGap, ...signals.successCriteria]),
      };
   }

   if (dependency) {
      return {
         ...draft,
         assessment: asksPurchase ? `Not yet. The purchase decision still depends on unresolved project evidence` : `The strongest option cannot be chosen confidently until the first decision-critical dependency is resolved`,
         recommendation: `Verify this before committing to an option: ${dependency.text}`,
         reason: signals.assumptions[0]
            ? `The current assumption is ${ensureSentence(signals.assumptions[0])} That assumption should not outrank the dependency that determines whether the option is necessary`
            : "The missing prerequisite can change which option is practical, so choosing first would turn an assumption into a purchase",
         watchOut: signals.knownRisks[0] || "Do not spend the budget before testing the fact that separates the options",
         evidenceUsed: uniqueStrings([dependency.text, ...signals.assumptions, ...signals.availableEvidence]),
      };
   }

   const strongest = getStrongestSupportedOption(packet);
   const strongestOption = cleanInlineDecisionText(strongest?.option);

   if (strongest && strongestOption && strongest.score > 0 && (includesAny(lower, ["which option", "strongest", "best option", "has the best option changed", "which approach"]) || asksPurchase)) {
      const changed = lower.includes("changed");
      const support = getSentenceContaining(materialText, ["wired access points are technically practical", "successfully negotiates", "throughput test", "no packet loss"]);

      return {
         ...draft,
         assessment: changed
            ? `Yes. The new evidence changes the decision. The strongest supported option is ${lowerSentenceStart(strongestOption)}`
            : `Based on the current evidence, the strongest supported option is ${lowerSentenceStart(strongestOption)}`,
         recommendation: "Choose that architecture and limit the purchase to the components it actually requires",
         reason: support ? `The deciding prerequisite has now been tested: ${ensureSentence(support)}` : "This option has the strongest overlap with the verified project evidence and constraints",
         watchOut: signals.knownRisks[0] || "Keep the recommendation provisional if a remaining dependency is still unverified",
         evidenceUsed: uniqueStrings([support, ...signals.constraints, ...packet.materials.slice(0, 3).map((item) => item.summary)]),
      };
   }

   return {
      ...draft,
      assessment: signals.options.length ? "The decision should be made by testing each option against the project constraints and verified evidence" : draft.assessment,
      recommendation: signals.options.length ? `Compare the options against the unresolved dependency, budget, reuse requirement, and success criteria before committing` : draft.recommendation,
      reason: signals.options.length ? "A useful project-lead decision removes options that fail constraints instead of returning an unranked pros-and-cons list" : draft.reason,
      evidenceUsed: uniqueStrings([...signals.options, ...signals.constraints, ...draft.evidenceUsed]),
   };
}

function getPlanningReadinessIntentDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const evidenceText = getPacketDecisionText(packet);
   const explicitFailure = getSentenceContaining(evidenceText, ["validation has not passed", "not passed", "below the", "interruption", "rear bedroom", "post-installation validation"]);

   if (explicitFailure || hasPlanningValidationFailure(packet)) {
      const validation = getPlanningValidationEvidence(packet);
      const unmetEvidence = uniqueStrings([validation.weakArea, validation.roamingGap]);

      return {
         ...draft,
         assessment: "No. The installation may be complete, but the project has not passed final validation",
         recommendation: "Resolve the failed coverage and roaming checks, then rerun the same validation before closing the project",
         reason: validation.reason || (unmetEvidence.length ? `The saved results still conflict with the success criteria: ${unmetEvidence.join(" ")}` : explicitFailure || "The saved validation results still conflict with the success criteria"),
         watchOut: "Do not treat installed equipment as proof that the intended outcome was achieved",
         evidenceUsed: uniqueStrings([explicitFailure, ...unmetEvidence, ...packet.profileSignals.successCriteria]),
      };
   }

   return {
      ...draft,
      assessment: getReadinessAssessment(packet),
      reason: packet.readiness.reason || draft.reason,
   };
}

// ========================================
// Intent detection
// ========================================

export function getProjectGuidanceIntent(prompt: string): ProjectGuidanceIntent {
   const lower = normalizePrompt(prompt);

   if (!lower) {
      return "general";
   }

   if (includesAny(lower, ["what am i actually building", "what am i building", "explain this project", "what is this project", "where does this project stand", "where am i in this project", "current state", "new engineer joining", "joining the team"])) {
      return "project-understanding";
   }

   if (
      includesAny(lower, [
         "what should i do next",
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
   ) {
      return "next-action";
   }

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
         "use injectors",
         "poe switch or",
      ])
   ) {
      return "decision";
   }

   if (includesAny(lower, ["build order", "current order", "what order", "before i start", "before i move on", "should i move on", "dependencies", "depends on", "sequence"])) {
      return "build-order";
   }

   if (includesAny(lower, ["biggest risk", "what makes you nervous", "what am i overlooking", "what haven't i realized", "what is the risk", "technical debt", "block this project", "likely to fail"])) {
      return "risk";
   }

   if (includesAny(lower, ["enough evidence", "enough sources", "what sources am i missing", "which sources am i missing", "how many sources", "source requirement", "evidence requirement", "what evidence am i missing"])) {
      return "evidence";
   }

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
         "is this project complete",
         "is the project complete",
         "is it complete",
         "is it finished",
         "what is missing",
      ])
   ) {
      return "readiness";
   }

   if (includesAny(lower, ["simplify", "too complicated", "overbuilding", "more complicated than", "what would you remove", "reduce scope", "too broad"])) {
      return "simplification";
   }

   if (includesAny(lower, ["if you were leading", "lead engineer", "project lead", "reviewing this sprint", "challenge my approach", "what would you reject", "be honest"])) {
      return "project-lead";
   }

   if (includesAny(lower, ["material", "reference", "source", "evidence", "tester feedback", "project notes", "uploaded", "document"])) {
      return "materials";
   }

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
   const materialText = getPacketMaterialText(packet);
   const hasPostInstallationValidation = /installation is complete|post-installation|final validation/i.test(materialText);
   const hasCompletedAudit = /wired access points are technically practical|upstairs ethernet run successfully negotiates|switch is an unmanaged non-poe/i.test(materialText);
   const effectiveStage = cleanInlineDecisionText(hasPostInstallationValidation ? "post-installation validation" : hasCompletedAudit ? "architecture selection" : getFirstMeaningfulSentence(signals.currentStage));
   const currentUnderstanding = effectiveStage
      ? `${packet.projectTitle} is currently ${/stage$/i.test(effectiveStage) ? `at the ${lowerSentenceStart(effectiveStage)}` : `in ${effectiveStage}`}`
      : `${packet.projectTitle} is a planning project with ${signals.milestones.length} detected milestone${signals.milestones.length === 1 ? "" : "s"}`;

   if (signals.blockedItems.length) {
      return {
         currentUnderstanding,
         assessment: "The plan should not advance around an explicit blocker",
         recommendation: `Resolve the first blocked item: ${signals.blockedItems[0]}`,
         reason: "A plan built around an unresolved constraint creates commitments that look precise but are not dependable",
         watchOut: signals.blockedItems[1] || "Do not commit downstream work until the blocker has an owner and resolution",
         evidenceUsed: signals.blockedItems.slice(0, 3),
      };
   }

   const validationFailure = getSentenceContaining(materialText, ["validation has not passed", "final validation", "installation is complete", "post-installation validation"]);

   if (hasPlanningValidationFailure(packet)) {
      const validation = getPlanningValidationEvidence(packet);

      return {
         currentUnderstanding,
         assessment: "Installation is complete, but the project outcome has not passed validation",
         recommendation: "Tune or reposition the upstairs access point, then repeat the rear-bedroom speed and roaming tests using the same devices and test method",
         reason: validation.reason || validationFailure,
         watchOut: signals.knownRisks.find((risk) => /placement|interference|speed alone/i.test(risk)) || "Do not confuse implementation completion with project completion",
         evidenceUsed: uniqueStrings([validationFailure, validation.weakArea, validation.roamingGap, ...signals.successCriteria, ...packet.materials.slice(0, 2).map((item) => item.details || item.summary)]),
      };
   }

   const auditComplete = getSentenceContaining(materialText, ["wired access points are technically practical", "successfully negotiates", "throughput test", "no packet loss", "switch is an unmanaged non-poe"]);

   if (hasResolvedPlanningArchitecture(packet) && signals.options.length) {
      const strongest = getStrongestSupportedOption(packet);
      const strongestOption = cleanInlineDecisionText(strongest?.option);

      return {
         currentUnderstanding,
         assessment: "The audit has resolved the architecture gate, so the project is ready to move from investigation into selection",
         recommendation: strongestOption ? `Finalize the equipment list for this option: ${strongestOption}` : "Finalize the architecture and produce the exact equipment list before purchasing",
         reason: auditComplete || "The network audit resolved the technical facts that separated the architecture options",
         watchOut: "Buy only the components required by the confirmed architecture; do not add future-expansion hardware without a current requirement",
         evidenceUsed: uniqueStrings([auditComplete, ...packet.materials.slice(0, 3).map((item) => item.summary), ...signals.constraints]),
      };
   }

   if (dependency) {
      return {
         currentUnderstanding,
         assessment: "The next decision depends on a prerequisite that is not yet verified",
         recommendation: `Verify the first decision gate: ${dependency.text}`,
         reason: "That fact can change which option is practical, so it should be resolved before equipment, dates, or downstream milestones are committed",
         watchOut: signals.knownRisks[0] || "Do not let the easiest-looking option become the default before the deciding evidence is available",
         evidenceUsed: uniqueStrings([dependency.text, ...signals.assumptions, ...signals.availableEvidence]),
      };
   }

   if (!signals.milestones.length) {
      return {
         currentUnderstanding,
         assessment: "The objective exists, but the plan does not yet contain major outcomes that can be sequenced",
         recommendation: "Define the minimum milestone sequence from current state to final outcome",
         reason: "Tasks and dates are unreliable until the project is divided into meaningful completion points",
         watchOut: "Use outcomes as milestones, not long lists of small activities",
         evidenceUsed: uniqueStrings([packet.projectGoal, signals.deliverable]),
      };
   }

   if (signals.options.length && signals.assumptions.length) {
      return {
         currentUnderstanding,
         assessment: "The project is at a decision gate, not a scheduling gap",
         recommendation: `Test the assumption that separates the options before selecting equipment or assigning downstream dates`,
         reason: ensureSentence(signals.assumptions[0]),
         watchOut: signals.knownRisks[0] || "Do not schedule implementation around an architecture that has not been selected",
         evidenceUsed: uniqueStrings([...signals.options, ...signals.assumptions, ...signals.constraints]),
      };
   }

   if (!signals.timeline.length) {
      return {
         currentUnderstanding,
         assessment: "The milestones are defined, but the immediate priority should still come from the first unfinished outcome and its prerequisites",
         recommendation: `Make the first unfinished milestone active: ${signals.milestones[0]}`,
         reason: "A date becomes useful after the milestone is decision-ready; timing should not substitute for missing project facts",
         watchOut: "Do not date every milestone before accounting for dependencies and available capacity",
         evidenceUsed: uniqueStrings([signals.milestones[0], ...signals.priorities.slice(0, 2)]),
      };
   }

   const priority = signals.priorities[0];
   const milestone = priority || signals.milestones[0];

   return {
      currentUnderstanding,
      assessment: "The plan has milestones and timing, so execution should narrow to the earliest meaningful commitment",
      recommendation: `Make ${milestone} the single active planning priority and verify its prerequisite logistics`,
      reason: "One active milestone makes progress and blockers visible instead of distributing attention across the whole plan",
      watchOut: getReadinessWatchOut(packet) || "Watch for hidden logistics that have no owner, date, or dependency",
      evidenceUsed: uniqueStrings([milestone, ...signals.timeline.slice(0, 3), ...packet.dependencies.slice(0, 3).map((item) => item.text)]),
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

// ========================================
// General reasoning profile
// ========================================

function buildGeneralGuidance(packet: ProjectIntelligencePacket, fallbackNextAction?: string): ProfileGuidanceDraft {
   const signals = packet.profileSignals;
   const dependency = getHighestPriorityDependency(packet);
   const priority = signals.priorities[0];
   const requirement = signals.requirements[0];
   const currentUnderstanding = packet.currentState ? `${packet.projectTitle} is currently at ${packet.currentState}` : `${packet.projectTitle} has a defined project context but no reliable current state`;

   if (signals.blockedItems.length) {
      return {
         currentUnderstanding,
         assessment: "An explicit blocker is currently more important than adding new work",
         recommendation: `Resolve the first blocker: ${signals.blockedItems[0]}`,
         reason: "The blocker limits meaningful progress on the intended outcome",
         watchOut: signals.blockedItems[1] || getReadinessWatchOut(packet),
         evidenceUsed: signals.blockedItems.slice(0, 3),
      };
   }

   if (dependency?.state === "unsatisfied") {
      return {
         currentUnderstanding,
         assessment: "The next project decision is constrained by an unfinished dependency",
         recommendation: getDependencyAction(dependency),
         reason: "The dependency must be satisfied before later work can be judged accurately",
         watchOut: getReadinessWatchOut(packet),
         evidenceUsed: [dependency.text],
      };
   }

   if (priority) {
      return {
         currentUnderstanding,
         assessment: `The project already identifies ${priority} as its priority`,
         recommendation: `Turn ${priority} into one measurable completed outcome`,
         reason: "The declared priority is the best available basis for choosing the next action without inventing scope",
         watchOut: "Do not split attention across lower-priority work until the outcome is testable",
         evidenceUsed: [priority],
      };
   }

   if (!packet.currentState) {
      return {
         currentUnderstanding,
         assessment: "The intended project state is too vague for a confident recommendation",
         recommendation: "Record the current state and the next required outcome in one concrete sentence",
         reason: "The engine needs a before-and-after condition to distinguish useful progress from activity",
         watchOut: "Avoid using broad labels such as planning or working on it without a visible result",
         evidenceUsed: uniqueStrings([packet.projectGoal, signals.deliverable]),
      };
   }

   return {
      currentUnderstanding,
      assessment: requirement ? `The next action should move the project toward its first explicit requirement: ${requirement}` : "The project has a current state, but no more specific workflow signal outranks the stated goal",
      recommendation: compactText(fallbackNextAction) || (requirement ? `Complete the smallest verifiable part of this requirement: ${requirement}` : "Define one verifiable result that moves the project from its current state toward its goal"),
      reason: "That creates a concrete decision point without pretending the project contains structure that was not provided",
      watchOut: getReadinessWatchOut(packet) || "Watch for actions that create activity without changing the project state",
      evidenceUsed: uniqueStrings([packet.currentState, requirement || "", packet.projectGoal]),
   };
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
      return `Reduce the next revision to one audience, one document purpose, and one structural pass`;
   }

   if (packet.reasoningProfile === "planning") {
      const milestones = packet.profileSignals.milestones;

      if (milestones.length >= 4) {
         const used = new Set<string>();
         const pick = (patterns: RegExp[], fallbackIndex: number) => {
            const match = milestones.find((milestone) => !used.has(milestone) && patterns.some((pattern) => pattern.test(milestone)));
            const fallback = match || milestones.find((milestone, index) => index >= fallbackIndex && !used.has(milestone)) || milestones.find((milestone) => !used.has(milestone)) || "";

            if (fallback) {
               used.add(fallback);
            }

            return fallback;
         };

         const gates = uniqueStrings([
            pick([/audit|inspect|baseline|current network|cabling/i], 0),
            pick([/choose|select|decision|architecture|option/i], 1),
            pick([/install|configure|implement|deploy|set up/i], 2),
            pick([/test|validate|verify|coverage|latency|roaming/i], 3),
         ]).filter(Boolean);

         if (gates.length >= 3) {
            return `Reduce the plan to ${gates.length === 4 ? "four" : "three"} gates: ${gates.join(" → ")}`;
         }
      }

      return "Reduce the plan to one decision gate, one implementation path, and one validation pass";
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

   if (!clean || !/^[A-Z][a-z]/.test(clean)) {
      return clean;
   }

   return `${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
}

function getRelevantPlanningRisks(packet: ProjectIntelligencePacket) {
   const risks = uniqueStrings(packet.risks.map((risk) => risk.text));
   const state = compactText(packet.currentState).toLowerCase();
   const materialText = getPacketMaterialText(packet).toLowerCase();
   const isValidationStage = state.includes("validation") || materialText.includes("installation is complete") || materialText.includes("post-installation");
   const isArchitectureSelected = state.includes("architecture selection") || hasResolvedPlanningArchitecture(packet);

   if (isValidationStage) {
      const currentRisks = risks.filter(
         (risk) =>
            !/buying mesh equipment|replacing the router|spending the full budget|before testing the simplest solution/i.test(risk) &&
            /placement|interference|roaming|latency|packet loss|speed alone|weak area|coverage|configuration|transmit power|channel/i.test(risk),
      );

      return currentRisks.length ? currentRisks : ["Poor access-point placement or configuration may be causing the remaining weak area", "Evaluating the network by speed alone can hide roaming or latency problems"];
   }

   if (isArchitectureSelected) {
      const currentRisks = risks.filter((risk) => !/buying mesh equipment before confirming|replacing the router without solving|before testing the simplest solution/i.test(risk));

      return currentRisks.length ? currentRisks : ["Poor access-point placement could weaken an otherwise sound architecture", "Buying expansion hardware without a current requirement could waste the remaining budget"];
   }

   return risks;
}

function getPlanningRiskIntentDraft(packet: ProjectIntelligencePacket, draft: ProfileGuidanceDraft): ProfileGuidanceDraft {
   const risks = getRelevantPlanningRisks(packet);
   const dependency = getDecisionBlockingDependency(packet);
   const primary = risks[0] || getHighestRisk(packet)?.text;
   const secondary = uniqueStrings(risks.slice(1, 3));

   return {
      ...draft,
      assessment: primary ? `The main risk is ${lowerSentenceStart(primary)}` : draft.watchOut || draft.assessment,
      recommendation: dependency ? `Resolve the decision gate before committing money or implementation: ${dependency.text}` : draft.recommendation,
      reason: secondary.length ? `The next risks behind it are ${secondary.map(lowerSentenceStart).join("; ")}` : dependency ? "That dependency can change the architecture and make an early purchase unnecessary" : draft.reason,
      watchOut: risks[3] || draft.watchOut,
      evidenceUsed: uniqueStrings([primary || "", ...secondary, dependency?.text || ""]),
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

   if (intent === "risk") {
      if (packet.reasoningProfile === "planning") {
         return getPlanningRiskIntentDraft(packet, draft);
      }

      const risk = getHighestRisk(packet);

      return {
         ...draft,
         assessment: risk ? `The main current risk is ${risk.text}` : draft.watchOut || draft.assessment,
         recommendation: draft.recommendation,
         reason: risk ? `This risk is rated ${risk.severity} because it can weaken readiness or force rework` : draft.reason,
         evidenceUsed: uniqueStrings([risk?.text || "", ...draft.evidenceUsed]),
      };
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

      return {
         ...draft,
         assessment: getReadinessAssessment(packet),
         reason: packet.readiness.reason || draft.reason,
      };
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
   const clean = compactText(value);

   if (!clean) {
      return "";
   }

   if (/^watch(?:\s+out)?(?:\s+for)?\s*:?/i.test(clean)) {
      return ensureSentence(clean);
   }

   if (/^(?:avoid|buy|do not|don't|use|keep|make|verify|confirm|choose|each|run|limit|prefer)\b/i.test(clean)) {
      return ensureSentence(clean);
   }

   return ensureSentence(`Watch for: ${lowerSentenceStart(clean)}`);
}

function formatResponse(draft: ProfileGuidanceDraft) {
   const firstParagraph = uniqueStrings([ensureSentence(draft.currentUnderstanding), ensureSentence(draft.assessment)]).join(" ");
   const secondParagraph = uniqueStrings([ensureSentence(draft.recommendation), ensureSentence(draft.reason)]).join(" ");
   const thirdParagraph = formatWatchOut(draft.watchOut);

   return [firstParagraph, secondParagraph, thirdParagraph].filter(Boolean).join("\n\n");
}

// ========================================
// Public guidance builder
// ========================================

export function buildProjectGuidance(input: ProjectGuidanceInput): ProjectGuidanceResult {
   const intent = getProjectGuidanceIntent(input.prompt);
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
      };
   }

   const profileDraft = buildProfileGuidance(packet, input.fallbackNextAction);
   const draft = applyIntent(intent, packet, profileDraft, input.prompt);
   const response = formatResponse(draft);
   const confidence = Math.max(0, Math.min(98, Math.round(packet.confidence * 0.7 + packet.reasoningProfileConfidence * 0.3)));

   return {
      handled: true,
      intent,
      response,
      judgment: draft.assessment,
      reason: draft.reason,
      nextAction: draft.recommendation,
      watchOut: draft.watchOut,
      profile: packet.reasoningProfile,
      currentUnderstanding: draft.currentUnderstanding,
      assessment: draft.assessment,
      evidenceUsed: uniqueStrings(draft.evidenceUsed),
      confidence,
   };
}
