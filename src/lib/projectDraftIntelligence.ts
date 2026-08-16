// ========================================
// ALLEVIN MK XI Project Draft Intelligence
// Purpose:
// Give Projects and AIDock one shared authority for turning a user's ramble
// into a grounded project guide. The LLM provides the primary semantic read;
// the local planner validates it and supplies a safe dependency-based fallback.
// ========================================

import { requestAllevinLLM } from "@/lib/allevinLLMClient";

export type ProjectDraftType = "software" | "research" | "writing" | "planning" | "checklist" | "general";

export interface ProjectDraftGuide {
   projectType: ProjectDraftType;
   goal: string;
   successCriteria: string[];
   currentSituation: string[];
   confirmedDecisions: string[];
   openQuestions: string[];
   constraints: string[];
   workingNotes: string[];
   milestones: string[];
   recommendedStartingPoint: string;
   source: "model" | "local" | "mixed";
}

export interface BuildProjectDraftGuideInput {
   title: string;
   description: string;
}

interface ModelProjectDraftSections {
   goal: string;
   successCriteria: string[];
   currentSituation: string[];
   confirmedDecisions: string[];
   openQuestions: string[];
   constraints: string[];
   workingNotes: string[];
   milestones: string[];
   recommendedStartingPoint: string;
}

// ========================================
// Text safety and normalization
// ========================================

const PROJECT_DRAFT_LIMITS = {
   title: 120,
   description: 20000,
   statement: 700,
   milestone: 140,
   startingPoint: 700,
} as const;

const PROJECT_DRAFT_STOP_WORDS = new Set([
   "about",
   "after",
   "again",
   "against",
   "also",
   "because",
   "before",
   "being",
   "between",
   "could",
   "current",
   "does",
   "from",
   "have",
   "into",
   "more",
   "most",
   "other",
   "project",
   "should",
   "some",
   "that",
   "their",
   "there",
   "these",
   "they",
   "this",
   "those",
   "through",
   "under",
   "using",
   "want",
   "what",
   "when",
   "where",
   "which",
   "while",
   "with",
   "would",
]);

const PROJECT_DRAFT_ACTION_VERBS = [
   "assign",
   "build",
   "check",
   "choose",
   "clear",
   "collect",
   "compare",
   "complete",
   "confirm",
   "create",
   "decide",
   "define",
   "design",
   "document",
   "draft",
   "establish",
   "evaluate",
   "finalize",
   "gather",
   "identify",
   "install",
   "inventory",
   "map",
   "migrate",
   "organize",
   "prepare",
   "print",
   "produce",
   "publish",
   "review",
   "scan",
   "revise",
   "run",
   "select",
   "set",
   "test",
   "train",
   "translate",
   "validate",
   "verify",
   "write",
];

function stripUnsafeMarkup(value?: string) {
   return (value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
      .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "")
      .replace(/<[^>]+>/g, "");
}

function cleanText(value?: string, limit: number = PROJECT_DRAFT_LIMITS.description) {
   const clean = stripUnsafeMarkup(value)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n")
      .trim();

   return clean.length > limit ? clean.slice(0, limit).trim() : clean;
}

function compactText(value?: string, limit: number = PROJECT_DRAFT_LIMITS.statement) {
   const clean = cleanText(value, limit).replace(/\s+/g, " ").trim();
   return clean.length > limit ? clean.slice(0, limit).trim() : clean;
}

function cleanTitle(value?: string) {
   return compactText(value, PROJECT_DRAFT_LIMITS.title)
      .replace(/\n+/g, " ")
      .replace(/[.!?]+$/, "")
      .trim();
}

function stripListMarker(value?: string) {
   return compactText(value, PROJECT_DRAFT_LIMITS.statement)
      .replace(/^(?:[-*•+]\s+|\d+[.)]\s+|\[[ xX]\]\s*)/, "")
      .replace(/[.!?]+$/, "")
      .trim();
}

function normalizeKey(value?: string) {
   return compactText(value, 2000)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function getTokens(value?: string) {
   return new Set(
      normalizeKey(value)
         .split(" ")
         .filter((token) => token.length >= 3 && !PROJECT_DRAFT_STOP_WORDS.has(token)),
   );
}

function getOverlap(left?: string, right?: string) {
   const leftTokens = getTokens(left);
   const rightTokens = getTokens(right);

   if (!leftTokens.size || !rightTokens.size) {
      return 0;
   }

   let shared = 0;
   leftTokens.forEach((token) => {
      if (rightTokens.has(token)) {
         shared += 1;
      }
   });

   return shared / Math.min(leftTokens.size, rightTokens.size);
}

function joinNaturalList(values: string[]) {
   const clean = values.filter(Boolean);
   if (clean.length <= 1) return clean[0] || "";
   if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
   return `${clean.slice(0, -1).join(", ")}, and ${clean[clean.length - 1]}`;
}

function uniqueStatements(values: string[], limit = 10) {
   const result: string[] = [];

   for (const value of values) {
      const clean = stripListMarker(value);

      if (!clean || isInstructionLike(clean)) {
         continue;
      }

      const duplicate = result.some((existing) => normalizeKey(existing) === normalizeKey(clean) || getOverlap(existing, clean) >= 0.82);

      if (!duplicate) {
         result.push(clean);
      }

      if (result.length >= limit) {
         break;
      }
   }

   return result;
}

function getMilestoneActionClass(value: string) {
   const verb = normalizeKey(value).split(" ")[0] || "";

   if (["inventory", "gather", "collect", "organize", "catalog", "audit", "map"].includes(verb)) return "collect";
   if (["confirm", "clear", "approve", "verify", "validate", "check"].includes(verb)) return "confirm";
   if (["choose", "decide", "select", "resolve", "set", "define"].includes(verb)) return "decide";
   if (["design", "plan", "structure", "outline"].includes(verb)) return "design";
   if (["create", "build", "write", "draft", "produce", "prepare", "assemble", "install", "migrate"].includes(verb)) return "produce";
   if (["test", "review", "evaluate", "walk", "pilot", "trial"].includes(verb)) return "test";
   if (["revise", "finalize", "release", "launch", "handoff", "deliver"].includes(verb)) return "close";

   return verb;
}

function isDuplicateMilestone(left: string, right: string) {
   const leftKey = normalizeKey(left);
   const rightKey = normalizeKey(right);

   if (!leftKey || !rightKey) return false;
   if (leftKey === rightKey) return true;

   const leftVerb = leftKey.split(" ")[0] || "";
   const rightVerb = rightKey.split(" ")[0] || "";
   const overlap = getOverlap(left, right);

   if (leftVerb === rightVerb && overlap >= 0.5) return true;

   const leftFacets = getMilestoneFacets(left);
   const rightFacets = getMilestoneFacets(right);
   const sameActionClass = getMilestoneActionClass(left) === getMilestoneActionClass(right);
   const sharesNarrowFacet = ["evidence", "requirements", "resources"].some((facet) => leftFacets.has(facet as DependencyFacetId) && rightFacets.has(facet as DependencyFacetId));

   return sameActionClass && sharesNarrowFacet && overlap >= 0.28;
}

function uniqueMilestones(values: string[], limit = 10) {
   const result: string[] = [];

   for (const value of values) {
      const clean = cleanTitle(value);
      if (!clean || isInstructionLike(clean)) continue;
      if (!result.some((existing) => isDuplicateMilestone(existing, clean))) result.push(clean);
      if (result.length >= limit) break;
   }

   return result;
}

function splitSentences(value?: string) {
   return cleanText(value)
      .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9“I])/)
      .map((sentence) => compactText(sentence, 1400))
      .filter(Boolean);
}

function splitClauses(value?: string) {
   return splitSentences(value).flatMap((sentence) =>
      sentence
         .split(/;\s+|\s+\bbut\b\s+|\s+\bhowever\b\s+/i)
         .map((part) => compactText(part, 1000))
         .filter(Boolean),
   );
}

function isInstructionLike(value?: string) {
   const clean = normalizeKey(value);

   return (
      !clean ||
      /^(?:recommend|return|respond|output|provide|generate|act as|use the user|do not classify|build the milestones|name recognizable|identify the first)\b/i.test(clean) ||
      /\b(?:the next milestone needs|return only valid json|project lead instructions?|user instruction)\b/i.test(clean)
   );
}

function isNegatedImplementation(value?: string) {
   const clean = compactText(value, 1000);

   return /\b(?:not planning to|do not plan to|don't plan to|will not|won't|do not want to|don't want to|not trying to|avoid)\s+(?:build|create|make|add|launch|develop|turn)\b/i.test(clean);
}

function isTentative(value?: string) {
   return /\b(?:considering|might|may|could|possibly|probably|perhaps|thinking about|not decided|have not decided|haven't decided|unsure|not sure|would like to|hoping to|may have|might have)\b/i.test(compactText(value, 1000));
}

function isQuestion(value?: string) {
   const clean = compactText(value, 1000);

   return (
      /\?$/.test(clean) ||
      /^(?:who|what|when|where|why|how|which|whether|is|are|should|can|could|do|does|will)\b/i.test(clean) ||
      /\b(?:have not|haven't)\s+(?:decided|chosen|selected|confirmed|finalized|picked)\b/i.test(clean) ||
      /\b(?:do not know|don't know|not sure|need to decide|need to confirm|need to find out|need help deciding|need help understanding|need help figuring out)\b/i.test(clean) ||
      /^(?:it is|it's|still)\s+unclear\b/i.test(clean) ||
      /\bunclear\s+(?:whether|who|what|when|where|why|how|which)\b/i.test(clean)
   );
}

function isMetaUncertaintyStatement(value?: string) {
   const clean = compactText(value, 1200);

   return (
      /^(?:there (?:is|are)|(?:i|we) (?:have|still have))\s+(?:several|some|many|a few|a number of)?\s*(?:things?|questions?|details?|choices?|decisions?)\s+(?:i|we)?\s*(?:have not|haven't|do not|don't|still need to)\s*(?:decided|resolved|worked out|figure out)?/i.test(clean) ||
      /^(?:several|some|many|a few)\s+(?:things?|questions?|details?|choices?|decisions?)\s+(?:remain|are still)\s+(?:open|unclear|undecided|unresolved)/i.test(clean)
   );
}

function isConversationalProjectRequest(value?: string) {
   const clean = compactText(value, 1600);

   return (
      /\b(?:can|could|would)\s+you\s+help\s+(?:me|us)\b/i.test(clean) ||
      /\bhelp\s+(?:me|us)\s+(?:turn|organize|plan|figure out|understand)\b/i.test(clean) ||
      /\b(?:tell|show)\s+(?:me|us)\s+what\s+(?:i|we)\s+should\s+do\s+first\b/i.test(clean) ||
      /\b(?:not sure|unsure)\s+where\s+to\s+start\b/i.test(clean) ||
      /\bwhere\s+should\s+(?:i|we)\s+start\b/i.test(clean) ||
      /\bturn\s+this\s+into\s+(?:a\s+)?clear\s+project\s+plan\b/i.test(clean)
   );
}

function hasMalformedProjectReference(value?: string) {
   const clean = compactText(value, 1600);

   return (
      /\b(?:the|a|an|into|of)\s+(?:i|we|me)\b/i.test(clean) ||
      /\bfor\s+(?:i|we|me)\b/i.test(clean) ||
      /\b(?:i|we)\s+also\s+want\s+to\s+make\s+sure\b/i.test(clean) ||
      /\b(?:i've|i have|we've|we have)\s+been\s+thinking\s+about\b/i.test(clean)
   );
}

function getBestMatchingSourceSentence(value: string, source: string) {
   const clean = compactText(value, 1600);
   let best = "";
   let bestScore = 0;

   for (const sentence of splitSentences(source)) {
      const overlap = getOverlap(clean, sentence);
      const numericMatch = [...clean.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].some((match) => sentence.includes(match[0]));
      const score = overlap + (numericMatch ? 0.12 : 0);

      if (score > bestScore) {
         best = sentence;
         bestScore = score;
      }
   }

   return { sentence: best, score: bestScore };
}

function preservesSourceCertainty(value: string, source: string) {
   const match = getBestMatchingSourceSentence(value, source);

   if (!match.sentence || match.score < 0.08) {
      return false;
   }

   const candidateNumbers = [...value.matchAll(/\b\d[\d,]*(?:\.\d+)?\b/g)].map((item) => item[0]);
   const tentativeNearNumber = candidateNumbers.some((number) => new RegExp(`\\b(?:may|might|could|possibly|around|approximately|about)\\b[^.]{0,45}${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]{0,45}\\b(?:may|might|could|possibly|around|approximately|about)\\b`, "i").test(match.sentence));
   const tentativePerson = /\b(?:may|might|could)\s+(?:be\s+)?(?:interested|available|willing|able)|\b(?:may|might|could)\s+help\b/i.test(match.sentence);
   const tentativeClaim = tentativeNearNumber || tentativePerson || /\b(?:may|might|could|possibly|probably|perhaps)\b[^.]{0,70}\b(?:available|required|needed|approved|completed|finished|selected|chosen)\b/i.test(match.sentence);

   if (tentativeClaim && !isTentative(value)) {
      return false;
   }

   if (/\b(?:will|must|is capped|is confirmed|is approved|has been selected|has been chosen)\b/i.test(value) && !isFirmDecision(match.sentence)) {
      return false;
   }

   return true;
}

function ensureReadableQuestion(value?: string) {
   let clean = stripListMarker(value);

   if (
      !clean ||
      isConversationalProjectRequest(clean) ||
      hasMalformedProjectReference(clean) ||
      /^(?:have not|haven't|not yet)\s+decided$/i.test(clean) ||
      /^(?:what|which)\s+(?:thing|decision|question)\s+should\s+be\s+(?:decided|handled|answered)\s+first\b/i.test(clean) ||
      /^what\s+should\s+be\s+decided\s+first\b/i.test(clean) ||
      /^what\s+needs\s+to\s+be\s+decided\s+about\s+(?:i|we|i['’]ve|we['’]ve)\b/i.test(clean) ||
      isMetaUncertaintyStatement(clean)
   ) {
      return "";
   }

   const consideringMatch = clean.match(/^(?:i|we)\s+(?:am|are)\s+considering\s+(.+)$/i);

   if (consideringMatch?.[1]) {
      const option = consideringMatch[1].replace(/\s+but\s+(?:i|we)?\s*(?:have not|haven't|had not|not yet)\s+decided.*$/i, "").trim();
      clean = option ? `Should the project use ${option}` : clean;
   }

   clean = clean
      .replace(/^(?:i|we)\s+(?:also\s+)?(?:have not|haven't)\s+decided\s+(?:whether\s+)?/i, "")
      .replace(/^(?:i|we)\s+(?:also\s+)?(?:do not|don't)\s+know\s+(?:whether\s+)?/i, "")
      .replace(/^(?:i|we)\s+(?:also\s+)?need\s+help\s+(?:deciding|understanding|figuring out)\s+/i, "")
      .replace(/^(?:i|we)\s+(?:also\s+)?need\s+to\s+(?:decide|confirm|determine|choose|find out|figure out)\s+/i, "")
      .replace(/^what\s+whether\b/i, "Whether")
      .replace(/^should\s+to\b/i, "Should")
      .replace(/^should\s+the\s+(.+?)\s+can\b/i, "Can the $1")
      .replace(/^how\s+(.+?)\s+should\b/i, "How should $1")
      .replace(/^whether\s+that\s+will\s+(.+)$/i, "Would that $1")
      .replace(/^whether\s+(.+?)\s+will\s+(.+)$/i, "Will $1 $2")
      .replace(/^whether\s+(.+?)\s+(?:may|can)\s+be\s+(.+)$/i, "Can $1 be $2")
      .replace(/^whether\s+(.+?)\s+has\b/i, "Does $1 have")
      .replace(/^whether\s+(.+?)\s+have\b/i, "Do $1 have")
      .replace(/^whether\s+(anyone|someone|everyone|no one)\s+([a-z]+s)\b/i, (_, subject: string, verb: string) => `Does ${subject} ${verb.replace(/s$/i, "")}`)
      .replace(/^whether\s+(.+?)\s+should\b/i, "Should $1")
      .replace(/^whether\s+(.+?)\s+needs?\s+(.+)$/i, "Does $1 need $2")
      .replace(/^how\s+to\s+test\s+(.+?)\s+without\s+(.+)$/i, "How should $1 be tested without $2")
      .replace(/^how\s+to\s+test\s+(.+)$/i, "How should $1 be tested")
      .trim();

   if (!clean || isMetaUncertaintyStatement(clean) || isConversationalProjectRequest(clean) || hasMalformedProjectReference(clean)) {
      return "";
   }

   clean = clean
      .replace(/^which ones\b/i, "Which features")
      .replace(/^the date$/i, "What date should be used")
      .replace(/^movie rights$/i, "What screening permission or license is required")
      .replace(/^power$/i, "What power is available at the site")
      .replace(/^sound limits$/i, "What sound limits apply")
      .replace(/^seating$/i, "What seating setup should be used")
      .replace(/^cleanup$/i, "Who is responsible for cleanup")
      .replace(/^the exits,?\s+after-hours contacts$/i, "Which exits and after-hours contacts should the plan include")
      .replace(/^what the (.+?) approves$/i, "What must the $1 approve")
      .replace(/^the storage setup(?: yet)?$/i, "Which storage setup should be used")
      .replace(/^a format or printer(?: yet)?$/i, "Which format and printer should be used")
      .replace(/^what to do if (.+)$/i, "What should happen if $1");

   if (!/^(?:who|what|when|where|why|how|which|whether|is|are|should|can|could|do|does|will|would)\b/i.test(clean)) {
      if (/\bor whether\b/i.test(clean)) {
         clean = `Which option should be used: ${clean.replace(/^.*?\bor whether\b/i, "")}`;
      } else {
         clean = `What needs to be decided about ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
      }
   }

   return `${clean.charAt(0).toUpperCase()}${clean.slice(1).replace(/[.?]+$/, "")}`;
}

function startsWithActionVerb(value?: string) {
   const first = normalizeKey(value).split(" ")[0] || "";
   return PROJECT_DRAFT_ACTION_VERBS.includes(first);
}

function isGroundedStatement(value: string, source: string, minimumOverlap = 0.2) {
   const clean = compactText(value, 1000);

   if (!clean || isInstructionLike(clean)) {
      return false;
   }

   const overlap = getOverlap(clean, source);

   return overlap >= minimumOverlap || [...getTokens(clean)].some((token) => getTokens(source).has(token));
}

// ========================================
// Goal and project-object interpretation
// ========================================

function scoreGoalCandidate(value: string) {
   const clean = compactText(value, 1200);
   let score = 0;
   const conversationalGoal = /^(?:i|we)(?:['’]ve| have|['’]m| am| are)\s+(?:been\s+)?thinking\s+about\s+(?:organizing|creating|building|planning|starting|setting up|putting together|making|writing|designing|developing|preparing|launching|restoring|improving|moving)\b/i.test(clean);

   if (!clean || isInstructionLike(clean) || isNegatedImplementation(clean) || (isConversationalProjectRequest(clean) && !conversationalGoal)) return -100;

   if (conversationalGoal) score += 8;
   if (/\b(?:goal|aim|objective|want to|would like to|need to|trying to|plan to|hoping to)\b/i.test(clean)) score += 5;
   if (/\b(?:want|need)\s+(?:an?|one|the)\s+(?:simple|small|clear|reliable|practical)?\s*[a-z]/i.test(clean)) score += 5;
   if (/\b(?:create|build|develop|prepare|organize|establish|launch|write|design|turn|convert|move|relocate|restore|improve|replace|redecorate|decorate|renovate|remodel|refresh|set up|put together|make)\b/i.test(clean)) score += 4;
   if (/\b(?:first version|working version|finished|usable|reliable|practical|complete)\b/i.test(clean)) score += 2;
   if (/\b(?:before|within|by the end|so that|in order to)\b/i.test(clean)) score += 1;
   if (/\b(?:figure out|what should i do first|where to start)\b/i.test(clean) && !conversationalGoal) score -= 7;
   if (isTentative(clean) && !conversationalGoal) score -= 5;
   if (/\b(?:make sure|ensure that|hold up over time|can be used successfully)\b/i.test(clean)) score -= 7;
   if (/^(?:i|we)\s+(?:have|currently have|already own|am considering)\b/i.test(clean)) score -= 4;
   if (/\b(?:near the|along the|opposite wall|could go|might use)\b/i.test(clean)) score -= 3;

   return score;
}

function normalizeGoalCandidate(value: string) {
   let clean = compactText(value, 900)
      .replace(/^(?:the\s+)?(?:goal|aim|objective)\s+(?:is|would be)\s+(?:to\s+)?/i, "")
      .replace(/^(?:i|we)(?:['’]ve| have)\s+been\s+thinking\s+about\s+/i, "")
      .replace(/^(?:i|we)(?:['’]m| am| are)\s+thinking\s+about\s+/i, "")
      .replace(/^(?:i|we)\s+(?:also\s+)?(?:want|would like|need|plan|hope|am trying)\s+to\s+/i, "")
      .replace(/^(?:i|we|a few [a-z-]+(?:\s+[a-z-]+){0,3}|some [a-z-]+(?:\s+[a-z-]+){0,3})\s+(?:also\s+)?(?:want|need)\s+((?:an?|one|the)\s+.+)$/i, "Create $1")
      .replace(/^(?:i|we)\s+have\s+.+?\s+that\s+(?:i|we)\s+want\s+to\s+/i, "")
      .replace(/^(?:i|we)\s+have\s+(.+?)\s+that\s+(?:i|we)\s+want\s+to\s+/i, "$1 to ")
      .replace(/,?\s+but\s+(?:i|we)(?:['’]m| am| are)\s+not\s+sure\s+where\s+to\s+start.*$/i, "")
      .replace(/,?\s+but\s+(?:i|we)\s+(?:have not|haven't|had not)\s+(?:chosen|decided|confirmed|selected|finalized).*/i, "")
      .replace(/[.!?]+$/, "")
      .trim();

   const embedded = compactText(value, 900).match(/\b(?:have|own|use)\s+(.+?)\s+that\s+(?:i|we)\s+want\s+to\s+(.+?)(?:[.!?]|$)/i);
   if (embedded?.[1] && embedded?.[2]) clean = `${embedded[2]} ${embedded[1]}`;

   const gerundActions: Array<[RegExp, string]> = [
      [/^organizing\b/i, "Organize"], [/^creating\b/i, "Create"], [/^building\b/i, "Build"], [/^planning\b/i, "Plan"],
      [/^starting\b/i, "Start"], [/^setting\s+up\b/i, "Set up"], [/^putting\s+together\b/i, "Create"], [/^making\b/i, "Make"],
      [/^writing\b/i, "Write"], [/^designing\b/i, "Design"], [/^developing\b/i, "Develop"], [/^preparing\b/i, "Prepare"],
      [/^launching\b/i, "Launch"], [/^restoring\b/i, "Restore"], [/^improving\b/i, "Improve"], [/^replacing\b/i, "Replace"],
      [/^producing\b/i, "Produce"], [/^moving\b/i, "Move"],
   ];

   for (const [pattern, replacement] of gerundActions) {
      if (pattern.test(clean)) { clean = clean.replace(pattern, replacement); break; }
   }

   clean = clean
      .replace(/^turn\s+(.+?)\s+into\s+/i, "Turn $1 into ")
      .replace(/^create\b/i, "Create").replace(/^build\b/i, "Build").replace(/^develop\b/i, "Develop")
      .replace(/^prepare\b/i, "Prepare").replace(/^organize\b/i, "Organize").replace(/^establish\b/i, "Establish")
      .replace(/^write\b/i, "Write").replace(/^design\b/i, "Design").replace(/^put together\b/i, "Create").replace(/^make\b/i, "Make")
      .trim();

   if (!clean || /^(?:make sure|ensure|figure out)\b/i.test(clean) || isConversationalProjectRequest(clean) || hasMalformedProjectReference(clean)) return "";
   return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
}

function inferGoal(title: string, description: string) {
   const candidates = splitSentences(description)
      .map((value, index) => ({ value, score: scoreGoalCandidate(value) + Math.max(0, 2 - index) }))
      .sort((left, right) => right.score - left.score);

   const best = candidates.find((candidate) => candidate.score >= 4)?.value || "";
   const goal = normalizeGoalCandidate(best);

   if (goal && !isNegatedImplementation(goal) && !isConversationalProjectRequest(goal) && !hasMalformedProjectReference(goal)) {
      return goal;
   }

   const cleanTitleValue = cleanTitle(title);

   return cleanTitleValue ? `Complete ${cleanTitleValue}` : "Complete the project with a clear, usable result";
}

function getProjectObject(goal: string, title: string) {
   const source = compactText(goal, 700);

   const sanitizeCandidate = (value?: string) => {
      const candidate = cleanTitle(value || "")
         .replace(/\bproject$/i, "")
         .replace(/\s+/g, " ")
         .trim();

      if (
         !candidate ||
         candidate.split(/\s+/).length > 12 ||
         isConversationalProjectRequest(candidate) ||
         hasMalformedProjectReference(candidate) ||
         /^(?:i|we|me|my|our|make sure|ensure)\b/i.test(candidate)
      ) {
         return "";
      }

      return candidate.charAt(0).toLowerCase() + candidate.slice(1);
   };

   const patterns = [
      /\b(?:create|build|develop|prepare|organize|establish|launch|write|design|restore|replace|improve|plan|complete|make)\s+(?:an?\s+|the\s+)?(.+?)(?:\s+(?:that|so|before|within|for|using|with)\b|$)/i,
      /\bturn\s+.+?\s+into\s+(?:an?\s+|the\s+)?(.+?)(?:\s+(?:that|so|before|within|for|using|with)\b|$)/i,
      /\bmove\s+to\s+(?:an?\s+|the\s+)?(.+?)(?:\s+(?:that|so|before|within|for|using|with)\b|$)/i,
   ];

   for (const pattern of patterns) {
      const match = source.match(pattern);
      const candidate = sanitizeCandidate(match?.[1]);
      if (candidate) return candidate;
   }

   const actionObject = source
      .replace(/^(?:create|build|develop|prepare|organize|establish|launch|write|design|restore|replace|improve|produce|set up|plan|complete|make)\s+(?:an?\s+|the\s+)?/i, "")
      .split(/\b(?:that|which|about|so that|before|within|using|with|can|will|should|must|needs to|allows|helps)\b/i)[0]
      ?.trim();

   const actionCandidate = sanitizeCandidate(actionObject);
   if (actionCandidate) return actionCandidate;

   const cleanTitleValue = cleanTitle(title);
   return cleanTitleValue ? cleanTitleValue.charAt(0).toLowerCase() + cleanTitleValue.slice(1) : "project";
}

function getReadableProjectReference(goal: string, title: string) {
   let object = getProjectObject(goal, title)
      .replace(/^(?:small|basic|practical|temporary|simple|reliable|complete)\s+/i, "")
      .replace(/\bprinted\s+(?=(?:book|cookbook|guide|booklet|report|manual)\b)/i, "")
      .replace(/\s+/g, " ")
      .trim();

   const coreNouns = ["mural", "artwork", "installation", "signage", "exhibit", "garden", "cookbook", "archive", "guide", "plan", "system", "workspace", "website", "application", "app", "report", "event", "pilot"];
   const core = coreNouns.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(object));

   if (core && object.split(/\s+/).length > 6) {
      object = core;
   }

   if (object.split(/\s+/).length > 9) {
      const cleanTitleValue = cleanTitle(title);
      if (cleanTitleValue) object = cleanTitleValue.charAt(0).toLowerCase() + cleanTitleValue.slice(1);
   }

   return object || "project";
}

function inferProjectType(goal: string, description: string): ProjectDraftType {
   const source = `${goal}\n${description}`;
   const positive = (pattern: RegExp) =>
      splitSentences(source).some((sentence) => {
         const match = sentence.match(pattern);
         if (!match || typeof match.index !== "number") return false;
         const before = sentence.slice(Math.max(0, match.index - 90), match.index);
         return !/\b(?:not|never|without|avoid|do not|don't|will not|won't|not planning to|not trying to)\b[\s\S]{0,80}$/i.test(before);
      });

   if (positive(/\b(?:software|application|app|website|web app|browser[- ]based|api|frontend|backend|codebase|database)\b/i)) return "software";
   if (positive(/\b(?:research brief|research paper|literature review|study|research question|evidence review|experiment)\b/i)) return "research";
   if (positive(/\b(?:plan|transition|move|relocation|event|program|workspace|system|process|campaign|pilot)\b/i)) return "planning";
   if (positive(/\b(?:article|essay|book|manuscript|script|story|newsletter|speech|report)\b/i)) return "writing";
   if (positive(/\b(?:checklist|inspection list|audit checklist|verification checklist)\b/i)) return "checklist";

   return "general";
}

// ========================================
// Local fact model
// ========================================

function inferSuccessCriteria(description: string) {
   const candidates = splitSentences(description).filter((statement) => /\b(?:success(?:ful)?\s+(?:would|will|means?)|success looks like|for .* to be successful|complete and useful|done when|finished when|should mean that)\b/i.test(statement));

   const values = candidates.flatMap((statement) => {
      const body = statement.replace(/^.*?\b(?:success\s+would\s+mean(?:\s+that)?|success\s+means?(?:\s+that)?|success(?:ful)?\s+(?:would|will)|success looks like|for .* to be successful|done when|finished when|should mean that)\b\s*:?\s*/i, "").trim();

      return body
         .split(/,\s+(?=(?:and\s+)?(?:the|a|an|residents?|users?|visitors?|people|staff|files?|records?|plan|system|project)\b)|;\s+/i)
         .map((item) => compactText(item, 700))
         .filter(Boolean);
   });

   return uniqueStatements(values, 6);
}

function buildFallbackSuccessCriteria(goal: string, title: string, description: string) {
   const object = getCoreProjectNoun(goal, title, description);
   const readableObject = object.charAt(0).toUpperCase() + object.slice(1);
   const criteria: string[] = [];

   if (/\b(?:community|neighborhood|audience|residents?|family|participants?|users?)\b/i.test(description) && /\b(?:reflect|represent|useful|readable|understand|identity|needs?)\b/i.test(description)) {
      criteria.push(`${readableObject} reflects the people, purpose, or setting it is meant to serve`);
   }

   if (/\b(?:maintenance|maintain|damage|repair|hold up|durable|longevity|replace)\b/i.test(description)) {
      criteria.push(`Maintenance and repair responsibilities are clear for the ${object}`);
   }

   if (/\b(?:approval|permission|permit|insurance|professional review)\b/i.test(description)) {
      criteria.push(`Required approvals are confirmed before the ${object} moves into production`);
   }

   if (/\b(?:test|proof|review|inspect|verify|pilot|walkthrough|feedback)\b/i.test(description)) {
      criteria.push(`The finished ${object} has been reviewed in its intended setting`);
   }

   criteria.push(`${readableObject} is complete and meets the confirmed requirements`);

   return uniqueStatements(criteria, 4);
}

function isFirmDecision(value: string) {
   const clean = compactText(value, 1200);

   if (
      !clean ||
      isTentative(clean) ||
      isQuestion(clean) ||
      /\b(?:suggested|proposed|recommended|need help deciding|need help understanding|need help figuring out|do not know|don't know|not sure)\b/i.test(clean)
   ) {
      return false;
   }

   if (/^(?:the\s+)?(?:building|room|space|site|property|garage|office|home)\s+(?:has|have|contains|includes|currently has)\b/i.test(clean)) {
      return false;
   }

   // Offers of help describe available capacity. They become decisions only
   // after the project explicitly assigns that person or role.
   if (
      /\b(?:has|have)\s+offered\s+to\b|\b(?:is|are)\s+willing\s+to\b|\b(?:can|could)\s+help\b/i.test(clean) ||
      /^(?:an?|the)\s+(?:relative|person|volunteer|reviewer|tester|advisor|neighbor|colleague)\b[\s\S]{0,160}\b(?:will help|will review|will test|will assist)\b/i.test(clean)
   ) {
      return false;
   }

   if (/\b(?:i|we)\s+(?:have\s+)?decided\b/i.test(clean)) {
      return true;
   }

   return (
      /^(?:the|this|that|it|no|an?|our|my|their|his|her|residents?|users?|visitors?|staff|volunteers?|participants?|project|plan|system|guide|document|first version|first phase|initial version|initial phase)\b[\s\S]{0,220}\b(?:will|must|will not|won't|does not need to|do not need to|should remain|needs to remain|is capped at|stay at or below|remain under|stay below|should include|should be|should work|must include|must not|cannot|can't)\b/i.test(clean) ||
      /\b(?:budget|spending|cost)\b[\s\S]{0,100}\b(?:will stay|must stay|is capped|remain|stay)\b/i.test(clean)
   );
}

function inferDecisions(description: string) {
   return uniqueStatements(
      splitClauses(description)
         .filter(isFirmDecision)
         .map((statement) =>
            statement
               .replace(/^(?:i|we)\s+(?:have\s+)?decided\s+(?:that\s+)?/i, "")
               .replace(/^the\s+initial\s+project\s+budget\s+will\s+/i, "The initial project budget will ")
               .trim(),
         ),
      12,
   );
}

function isDecisionSupportedBySource(value: string, description: string) {
   if (!isFirmDecision(value)) return false;

   const match = getBestMatchingSourceSentence(value, description);
   return Boolean(match.sentence && match.score >= 0.12 && isFirmDecision(match.sentence));
}

function splitUnresolvedQuestionClauses(value: string) {
   const clean = compactText(value, 1800);
   const hasInterrogativeClauses = /(?:^|,|;)\s*(?:who|what|when|where|why|how|which|whether|if)\b/i.test(clean);
   const parts = hasInterrogativeClauses
      ? clean.split(/,\s+(?=(?:(?:and|or)\s+)?(?:who|what|when|where|why|how|which|whether|if)\b)|\s+(?=(?:and|or)\s+(?:who|what|when|where|why|how|which|whether|if)\b)|;\s+/i)
      : clean.split(/,\s*|\s+and\s+(?=(?:what to do|the |movie |power\b|sound\b|seating\b|cleanup\b|weather\b|budget\b|date\b|owner\b|approval\b))/i);

   return parts.map((part) => part.replace(/^(?:and|or)\s+/i, "").trim()).filter(Boolean);
}

function inferQuestionAntecedent(value?: string) {
   const stopWords = new Set(["things", "questions", "details", "decisions", "options", "years", "people", "members", "others", "several"]);
   const candidates = compactText(value, 2400)
      .toLowerCase()
      .match(/\b[a-z][a-z-]{2,}(?:s|ies)\b/g);

   if (!candidates?.length) {
      return "";
   }

   for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index];
      if (!stopWords.has(candidate)) {
         return candidate;
      }
   }

   return "";
}

function replaceVagueQuestionPronouns(value: string, context: string) {
   const antecedent = inferQuestionAntecedent(context);

   if (!antecedent) {
      return value;
   }

   return value
      .replace(/\bthem\b/gi, `the ${antecedent}`)
      .replace(/\bthose\b/gi, `the ${antecedent}`)
      .replace(/\bthese\b/gi, `the ${antecedent}`);
}

function getUnresolvedQuestionBody(sentence: string, context = "") {
   const clean = compactText(sentence, 1800);

   if (isConversationalProjectRequest(clean) || isMetaUncertaintyStatement(clean)) return "";

   const consideringUncertainty = clean.match(/^(?:i|we)\s+(?:am|are)\s+considering\s+(.+?),\s+but\s+(?:i|we)\s+(?:am|are)\s+not\s+sure\s+whether\s+that\s+(.+)$/i);
   if (consideringUncertainty?.[1] && consideringUncertainty?.[2]) {
      const option = replaceVagueQuestionPronouns(consideringUncertainty[1], context);
      const outcome = consideringUncertainty[2].replace(/^will\s+/i, "");
      return `Would ${option} ${outcome}`;
   }

   const inspectionMatch = clean.match(/^(?:there\s+(?:is|are)|(?:i|we)\s+have)\s+(.+?),\s+but\s+(?:i|we)\s+(?:am|are)\s+not\s+sure\s+when\s+(?:it|they)\s+(.+)$/i);
   if (inspectionMatch?.[1] && inspectionMatch?.[2]) {
      const subject = inspectionMatch[1].replace(/^(?:an?|the|some)\s+/i, "").trim();
      const plural = /(?:s|equipment|records|supplies|documents|lights|extinguishers)$/i.test(subject);
      const remainder = inspectionMatch[2].replace(/^(?:was|were)\s+/i, "");
      return `When ${plural ? "were" : "was"} ${subject} ${remainder}`;
   }

   const marker =
      clean.match(/\b(?:but|and)\s+(?:i|we)\s+(?:have not|haven't)\s+(?:decided|chosen|selected|confirmed|finalized|picked)\s+([\s\S]+)$/i) ||
      clean.match(/\b(?:i|we)\s+(?:also\s+)?(?:have not|haven't)\s+(?:decided|chosen|selected|confirmed|finalized|picked)\s+([\s\S]+)$/i);
   if (marker?.[1]) return replaceVagueQuestionPronouns(marker[1], context);

   const confirmation = clean.match(/\b(?:i|we)\s+(?:also\s+)?(?:still\s+)?need\s+to\s+(?:confirm|find out|determine|figure out)\s+([\s\S]+)$/i);
   if (confirmation?.[1]) return replaceVagueQuestionPronouns(confirmation[1], context);

   const unknown = clean.match(/\b(?:i|we)\s+(?:also\s+)?(?:do not|don't)\s+know\s+([\s\S]+)$/i);
   if (unknown?.[1]) return replaceVagueQuestionPronouns(unknown[1], context);

   const unsure = clean.match(/\b(?:i|we)\s+(?:am|are)\s+not\s+sure\s+([\s\S]+)$/i);
   if (unsure?.[1]) return replaceVagueQuestionPronouns(unsure[1], context);

   const help = clean.match(/\b(?:i|we)\s+need\s+help\s+(?:deciding|understanding|figuring out)\s+([\s\S]+)$/i);
   if (help?.[1]) return replaceVagueQuestionPronouns(help[1], context);

   return replaceVagueQuestionPronouns(clean, context);
}

function inferOpenQuestions(description: string, goal = "") {
   const questions: string[] = [];
   const sentences = splitSentences(description);
   const contextWindow: string[] = [];

   for (const sentence of sentences) {
      if (isConversationalProjectRequest(sentence) || isMetaUncertaintyStatement(sentence)) {
         contextWindow.push(sentence);
         if (contextWindow.length > 3) contextWindow.shift();
         continue;
      }

      const explicitUnresolved =
         /\b(?:need to figure out|need to confirm|need to decide|have not decided|haven't decided|do not know|don't know|not sure|unclear|whether)\b/i.test(sentence) ||
         /^(?:who|what|when|where|why|how|which|whether|is|are|should|can|could|do|does|will|would)\b/i.test(sentence.trim());

      if (!isQuestion(sentence) && !explicitUnresolved) {
         contextWindow.push(sentence);
         if (contextWindow.length > 3) contextWindow.shift();
         continue;
      }

      const body = getUnresolvedQuestionBody(sentence, `${contextWindow.join(" ")} ${sentence.split(/\b(?:but|and)\b/i)[0] || ""}`);

      for (const clause of splitUnresolvedQuestionClauses(body)) {
         const question = ensureReadableQuestion(clause);
         if (question) questions.push(question);
      }

      contextWindow.push(sentence);
      if (contextWindow.length > 3) contextWindow.shift();
   }

   return dedupeProjectQuestions(uniqueStatements(questions, 12), 12, description, goal);
}

function toGerundVerb(value: string) {
   const verb = value.toLowerCase();
   const irregular: Record<string, string> = {
      be: "being",
      buy: "buying",
      create: "creating",
      lie: "lying",
      run: "running",
      set: "setting",
      sit: "sitting",
      skip: "skipping",
      stop: "stopping",
      use: "using",
      write: "writing",
   };

   if (irregular[verb]) return irregular[verb];
   if (/ie$/i.test(verb)) return `${verb.slice(0, -2)}ying`;
   if (/[^aeiou]e$/i.test(verb)) return `${verb.slice(0, -1)}ing`;
   if (/^[a-z]{3,5}$/i.test(verb) && /[^aeiou][aeiou][^aeiouwxy]$/i.test(verb)) return `${verb}${verb.slice(-1)}ing`;
   return `${verb}ing`;
}

function normalizeAvoidLanguage(value: string) {
   return value.replace(/^Avoid\s+([A-Za-z]+)\b/i, (_, verb: string) => `Avoid ${toGerundVerb(verb)}`);
}

function makeConstraintLanguage(value: string) {
   const source = compactText(value, 1200);

   if (
      /\b(?:some|several|different)\b[\s\S]{0,500}\b(?:while others|differ|differently|vary|variations?|versions?)\b/i.test(source) &&
      /\b(?:do not|don't)\s+want\s+to\s+(?:erase|flatten|lose|remove|standardize away)\b/i.test(source)
   ) {
      return "Preserve meaningful source differences while clarifying enough detail for the finished result to be usable";
   }

   const clean = source
      .replace(/^(?:i|we)\s+do\s+not\s+want\s+to\s+collect\b/i, "Avoid collecting")
      .replace(/^(?:i|we)\s+don't\s+want\s+to\s+collect\b/i, "Avoid collecting")
      .replace(/^(?:i|we)\s+do\s+not\s+want\s+to\s+create\b/i, "Avoid creating")
      .replace(/^(?:i|we)\s+don't\s+want\s+to\s+create\b/i, "Avoid creating")
      .replace(/^(?:i|we)\s+do\s+not\s+want\s+to\s+buy\b/i, "Avoid buying")
      .replace(/^(?:i|we)\s+don't\s+want\s+to\s+buy\b/i, "Avoid buying")
      .replace(/^(?:i|we)\s+do\s+not\s+want\s+to\s+stage\b/i, "Avoid staging")
      .replace(/^(?:i|we)\s+don't\s+want\s+to\s+stage\b/i, "Avoid staging")
      .replace(/^(?:i|we)\s+do\s+not\s+want\s+to\s+treat\b/i, "Avoid treating")
      .replace(/^(?:i|we)\s+don't\s+want\s+to\s+treat\b/i, "Avoid treating")
      .replace(/^(?:i|we)\s+do\s+not\s+want\s+to\s+/i, "Avoid ")
      .replace(/^(?:i|we)\s+don't\s+want\s+to\s+/i, "Avoid ")
      .replace(/^(?:i|we)\s+would\s+rather\s+/i, "Prefer to ")
      .replace(/\bor\s+create\b/gi, "or creating")
      .replace(/\band\s+create\b/gi, "and creating")
      .replace(/\bor\s+collect\b/gi, "or collecting")
      .replace(/\band\s+collect\b/gi, "and collecting")
      .replace(/\bor\s+buy\b/gi, "or buying")
      .replace(/\band\s+buy\b/gi, "and buying")
      .trim();

   return normalizeAvoidLanguage(clean);
}

function isConstraintCandidate(value: string) {
   const clean = compactText(value, 1400);

   if (!clean || isQuestion(clean) || isTentative(clean) || /\b(?:success would mean|success means|goal is|want to create|would like to create)\b/i.test(clean)) {
      return false;
   }

   return (
      /\b(?:must|must not|cannot|can't|will not|won't|do not want|don't want|should not|needs to|has to|would rather|prefer(?:s|red)? to|only|not publicly|private|limited to|requires? approval|before distribution|before release)\b/i.test(clean) || /^no\s+[a-z0-9]/i.test(clean) ||
      /\b(?:budget|spending|cost)\b[^.]{0,100}\b(?:under|below|at or below|no more than|capped at|limited to)\b/i.test(clean) ||
      /\b(?:within|before)\s+(?:\d+\s+)?(?:hours?|days?|weeks?|months?|years?|the end|distribution|release|launch|handoff)\b/i.test(clean)
   );
}

function isConstraintSupportedBySource(value: string, description: string) {
   const match = getBestMatchingSourceSentence(value, description);
   return Boolean(match.sentence && match.score >= 0.1 && isConstraintCandidate(match.sentence) && !isTentative(match.sentence));
}

function inferConstraints(description: string, decisions: string[]) {
   return uniqueStatements(
      splitSentences(description)
         .filter(isConstraintCandidate)
         .filter((statement) => !decisions.some((decision) => getOverlap(statement, decision) >= 0.82))
         .map(makeConstraintLanguage),
      10,
   );
}

function inferCurrentSituation(description: string, used: string[]) {
   const candidates = splitSentences(description).flatMap((sentence) =>
      sentence
         .split(/,\s+but\s+(?=(?:i|we)\s+(?:am|are|have|do))|\s+and\s+(?=(?:i|we)\s+(?:am|are)\s+not\s+sure)|,\s+and\s+(?=(?:i|we)\s+(?:would like|want|hope|plan|need)\b)/i)
         .map((part) => compactText(part, 1200))
         .filter(Boolean),
   );

   return uniqueStatements(
      candidates.filter((statement) => {
         const clean = compactText(statement, 1200);
         if (
            clean.length > 500 || isQuestion(clean) || isFirmDecision(clean) || isNegatedImplementation(clean) || isConstraintCandidate(clean) ||
            isConversationalProjectRequest(clean) || hasMalformedProjectReference(clean) || scoreGoalCandidate(clean) >= 4 ||
            /\b(?:goal is|want to|would like to|need help|success would mean|success means|should be|should include|must include|will include|needs to be|make sure|have not chosen|haven't chosen|have not decided|haven't decided|have not picked|haven't picked)\b/i.test(clean)
         ) return false;

         if (used.some((existing) => getOverlap(clean, existing) >= 0.72)) return false;
         return /\b(?:currently|right now|already|have|has|there is|there are|include|includes|contains|located|used for|offered|available|existing|today|recent|last|installed|experienced|controls?|lacks?|does not currently|do not currently|may have|might be|said they would|interested|willing|incomplete|spread across|leaving soon)\b/i.test(clean);
      }),
      10,
   );
}

function inferWorkingNotes(goal: string, description: string, openQuestions: string[], constraints: string[]) {
   const object = getReadableProjectReference(goal, "");
   const placeBasedCreative = isPlaceBasedCreativeProject(goal, description);
   const notes: string[] = [];

   if (/\b(?:documents?|photos?|photographs?|maps?|notes?|records?|sources?|interviews?|measurements?|specifications?|recipes?|files?|assets?)\b/i.test(description)) {
      notes.push(`Keep each source item linked to its origin, verification status, and any permission or approval needed before it enters the ${object}`);
   }

   if (/\b(?:privacy|sensitive|permission|rights|consent|access|retention|legal|insurance|permit|safety|professional)\b/i.test(description)) {
      notes.push(
         placeBasedCreative
            ? `Confirm site ownership, permission, insurance, and physical-condition requirements before approving the final design or buying materials`
            : `Confirm permission, insurance, safety, or access requirements before final production begins`,
      );
   }

   if (/\b(?:different versions?|variations?|conflicting versions?|same .+ differently|multiple approaches?)\b/i.test(description)) {
      notes.push(`Preserve competing versions until the ${object} records why they are combined, compared, selected, or kept separate`);
   }

   if (/\b(?:organized by|structure|layout|format|chapter|sequence|route|categories|naming|page size|binding|visual approach|design process|community input)\b/i.test(description)) {
      notes.push(
         placeBasedCreative
            ? `Use community input to create a clear design brief instead of leaving the design process open-ended`
            : `Compare design and structure choices against how people should understand, experience, or use the finished ${object}`,
      );
   }

   if (/\b(?:test|pilot|walk through|tabletop|real sessions?|real use|feedback|verify|proof|inspect|repairs?|site condition|incomplete instructions?|inconsistent|unclear instructions?)\b/i.test(description)) {
      notes.push(
         placeBasedCreative
            ? `Inspect the site before finalizing the budget, material quantities, or work schedule`
            : `Check the real setting, incomplete information, and practical risks before production or purchasing makes the ${object} harder to change`,
      );
   }

   if (/\b(?:first version|first phase|pilot|under \$|below \$|within \d+|weeks?|months?|deadline|budget|print quantity|number of copies)\b/i.test(description)) {
      notes.push(`Protect the essential result first; reduce optional polish, quantity, or scope before weakening the ${object}`);
   }

   if (/\b(?:may|might|could|around|approximately)\b[^.]{0,60}\$[\d,]+/i.test(description)) {
      notes.push(`Treat the available budget as tentative until the amount is confirmed and the site or production needs are known`);
   }

   const lendingOrSharedResource = /\b(?:lend(?:ing)?|borrow(?:ing)?|checkout|check-out|loan|shared shelf|library of things)\b/i.test(`${goal}\n${description}`);
   if (lendingOrSharedResource) {
      const item = getLendableItemNoun(description);
      notes.push(`Decide how borrowing, returns, overdue items, and loss or damage will be handled before accepting donated ${item}`);
   } else if (/\b(?:permission|approval|owner|owns|ownership)\b/i.test(description)) {
      notes.push(`Confirm who can approve the ${object} and what requirements apply before setup, purchasing, or production begins`);
   }

   if (constraints.length) {
      notes.push(`Carry the confirmed limits into every comparison so later choices do not quietly expand the ${object}`);
   }

   return uniqueStatements(notes.filter((note) => !hasMalformedProjectReference(note)), 7);
}

// ========================================
// Dependency-based local milestone fallback
// ========================================

type DependencyFacetId = "scope" | "requirements" | "evidence" | "ownership" | "decisions" | "design" | "resources" | "production" | "testing" | "handoff" | "maintenance";

const DEPENDENCY_FACET_ORDER: Record<DependencyFacetId, number> = {
   scope: 10,
   requirements: 20,
   evidence: 30,
   ownership: 35,
   decisions: 40,
   design: 50,
   resources: 60,
   production: 70,
   testing: 80,
   handoff: 90,
   maintenance: 95,
};

function inferDependencySignals(description: string) {
   const text = compactText(description, 20000);

   return {
      scope: /\b(?:first version|first phase|phase one|initial version|first usable|minimum|scope|must cover|must include|must support|does not need|not trying to|not planning to|private pilot|pilot version)\b/i.test(text),
      externalRequirements: /\b(?:approval|permission|rights|consent|privacy|access|retention|legal|insurance|permit|inspection|professional|policy|regulation|safety|accessibility|translation)\b/i.test(text),
      evidence: /\b(?:sources?|evidence|research|interviews?|measurements?|photos?|maps?|notes?|documents?|records?|inventory|audit|assessment|specifications?|existing material|current information|inspection records?|floor plan)\b/i.test(text),
      ownership: /\b(?:assign(?:ed)?\s+(?:an?\s+)?owner|project owner|system owner|ongoing owner|who should (?:own|manage|maintain|approve)|who will (?:own|manage|maintain|approve)|responsible for|decision authority|manage access|maintain the (?:plan|system|documents?|guide|records?)|review schedule)\b/i.test(text),
      decisions: /\b(?:considering|whether|options?|choose|decide|not decided|have not decided|haven't decided|unresolved|must be resolved|unclear|not sure|do not know|don't know|need help deciding)\b/i.test(text),
      design: /\b(?:design|structure|layout|route|sequence|categories|naming|workflow|process|map|format|architecture|outline|communication method|reporting path|access rules)\b/i.test(text),
      resources: /\b(?:budget|cost|spending|purchase|buy|supplies|equipment|tools|materials|staffing|capacity|time available|resources?|defer|under \$[\d,]+|below \$[\d,]+|\$[\d,]+)\b/i.test(text),
      production: /\b(?:build|create|produce|write|draft|install|prepare|organize|implement|set up|migrate|translate|assemble|publish|deliver)\b/i.test(text),
      testing: /\b(?:test\w*|pilot|walk through|walkthrough|exercise|real use|real session|feedback|verify|validate|rehearse|proof|trial|check that)\b/i.test(text),
      handoff: /\b(?:handoff|transition|departing|train|training|orientation|transfer|launch|release|share|distribut\w*|prepare the pilot)\b/i.test(text),
      maintenance: /\b(?:maintain(?:ing)? the (?:plan|system|guide|documents?|records?)|maintenance owner|review schedule|review twice|biannual|annual review|update when|ongoing review|replacement schedule|revisit after|archive the completed work)\b/i.test(text),
   };
}

function getRequirementLabels(description: string) {
   const labels: string[] = [];
   if (/\b(?:approval|property manager|landlord|board|authority)\b/i.test(description)) labels.push("approval");
   if (/\b(?:safety|fire|emergency|professional|inspection|electrical|power|ventilation|dust|cleanup|hazard)\b/i.test(description)) labels.push("safety");
   if (/\b(?:privacy|sensitive|confidential|medical|access)\b/i.test(description)) labels.push("privacy");
   if (/\b(?:legal|permit|insurance|policy|regulation|retention|permission|rights)\b/i.test(description)) labels.push("outside requirements");
   if (/\b(?:accessibility|mobility|language|translation|Spanish|English)\b/i.test(description)) labels.push("accessibility");
   return uniqueStatements(labels, 3);
}

function getDecisionLabels(description: string) {
   const labels: string[] = [];
   if (/\b(?:privacy|confidential|medical|sensitive|access)\b/i.test(description)) labels.push("privacy");
   if (/\b(?:communication|group text|phone|contact method|reporting path)\b/i.test(description)) labels.push("communication");
   if (/\b(?:supplies|equipment|purchase|buy|resources?|budget)\b/i.test(description)) labels.push("first-phase resources");
   if (/\b(?:route|layout|categories|structure|format|workflow|process)\b/i.test(description)) labels.push("operating design");
   if (/\b(?:owner|ownership|responsible|authority|approve|maintain)\b/i.test(description)) labels.push("ownership");
   return uniqueStatements(labels, 3);
}

function buildFacetMilestoneTitle(id: DependencyFacetId, object: string, description: string) {
   switch (id) {
      case "scope": {
         const firstVersionFocus = compactText(description, 5000).match(/\bfirst\s+(?:version|phase|volume|release)\s+(?:will|should|must)\s+(?:focus on|include|cover|support)\s+(.+?)(?:[.;]|\s+and\s+(?:will|should|must)\b)/i)?.[1];
         return firstVersionFocus ? `Choose what belongs in the first ${object}` : `Define what the first ${object} must cover`;
      }
      case "requirements": {
         const labels = getRequirementLabels(description);
         return labels.length ? `Confirm ${joinNaturalList(labels)} for the ${object}` : `Confirm the rules and outside requirements for the ${object}`;
      }
      case "evidence":
         return /\b(?:recipes?|documents?|records?|photos?|photographs?|maps?|notes?|sources?|interviews?|measurements?|files?|assets?)\b/i.test(description) ? `Inventory the source material for the ${object}` : `Gather the evidence the ${object} needs`;
      case "ownership":
         return /\b(?:approve|approval|maintain|review schedule|access)\b/i.test(description) ? "Assign approval, access, and ongoing ownership" : "Assign ownership and decision authority";
      case "decisions": {
         const labels = getDecisionLabels(description);
         return labels.length ? `Resolve the ${joinNaturalList(labels)} decisions` : `Resolve the choices blocking the ${object}`;
      }
      case "design": {
         const source = compactText(description, 12000);
         const artifact = ["cookbook", "booklet", "manual", "guide", "report", "manuscript", "exhibit", "publication", "archive", "document", "pdf"].find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(source));
         if (artifact) return `Choose the ${artifact}'s structure and presentation`;
         if (/\b(?:room|space|route|site|layout|floor plan|visitor path|workspace)\b/i.test(description)) return `Plan the ${object}'s layout and movement`;
         return `Design the ${object}'s structure and workflow`;
      }
      case "resources":
         if (/\b(?:printer|printing|print quantity|binding|proof cop(?:y|ies)|page size)\b/i.test(description)) return "Choose the production format, vendor, and first quantity";
         if (/\b(?:budget|purchase|buy|supplies|equipment|materials)\b/i.test(description)) return "Set the first-phase budget and purchasing plan";
         return "Choose the first-phase resources and defer the rest";
      case "production":
         return `Create the first complete ${object}`;
      case "testing":
         if (/\bproof\b/i.test(description)) return `Test the ${object} through a complete proof`;
         return `Test the ${object} in real use`;
      case "handoff":
         return /\b(?:print run|private run|release|share|distribut\w*|pilot)\b/i.test(description) ? `Revise the ${object} and prepare the first release` : `Revise the ${object} and prepare the handoff`;
      case "maintenance":
         return "Assign ongoing maintenance and review";
   }
}

function getRequiredDependencyFacets(description: string) {
   const signals = inferDependencySignals(description);
   const facets: DependencyFacetId[] = [];

   if (signals.scope) facets.push("scope");
   if (signals.externalRequirements) facets.push("requirements");
   if (signals.evidence) facets.push("evidence");
   if (signals.ownership) facets.push("ownership");
   if (signals.decisions) facets.push("decisions");
   if (signals.design) facets.push("design");
   if (signals.resources) facets.push("resources");
   facets.push("production");
   if (signals.testing) facets.push("testing");
   if ((signals.handoff || signals.testing) && !signals.maintenance) facets.push("handoff");
   if (signals.maintenance) facets.push("maintenance");

   return Array.from(new Set(facets));
}

function getMilestoneFacets(value: string) {
   const clean = compactText(value, 800).toLowerCase();
   const facets = new Set<DependencyFacetId>();

   if (/\b(?:define|set|choose|select|confirm)\b[^.]{0,120}\b(?:scope|first version|first phase|first(?:\s+[a-z-]+){0,3}\s+collection|first volume|first release|must cover|must include|emergencies|audience|purpose|story|selected recipes?|initial set)\b/i.test(clean)) facets.add("scope");
   if (/\b(?:confirm|clear|approve|review|verify|check|set)\b[^.]{0,160}\b(?:approval|permissions?|rights|privacy|legal|insurance|permit|professional|safety|accessibility|guidance|requirements?|property manager|landlord|board|authority|sensitive-content boundaries)\b/i.test(clean)) {
      facets.add("requirements");
   }
   if (/\b(?:gather|inventory|organize|verify|review|audit|map)\b[^.]{0,120}\b(?:information|evidence|records?|documents?|photos?|photographs?|maps?|sources?|assets?|equipment|gaps?|current state|recipes?|materials?|notes?|interviews?|measurements?)\b/i.test(clean)) facets.add("evidence");
   if (/\b(?:assign|owner|ownership|authority|maintain|maintenance owner|access control)\b/i.test(clean)) facets.add("ownership");
   if (/\b(?:resolve|decide|choose|set|finalize)\b[^.]{0,140}\b(?:privacy|communication|supplies|resources|option|approach|rules|method|ownership|scope|format|variations?|versions?|organization|structure|print quantity|binding)\b/i.test(clean)) facets.add("decisions");
   if (
      /\b(?:design|map|plan|structure|organize|set|choose)\b[^.]{0,160}\b(?:layout|route|flow|communication|reporting|categories|structure|format|process|guide|map|visual approach|book structure|chapter order|page size|binding)\b/i.test(clean) ||
      /\b(?:create|draft|prepare)\b[^.]{0,140}\b(?:map|guide|contact sheet|structure|layout|flow|format)\b/i.test(clean)
   )
      facets.add("design");
   if (/\b(?:budget|resources?|supplies|equipment|purchase|spending|defer|sourcing|printer|printing cost|print quantity|binding|proof cop(?:y|ies))\b/i.test(clean)) facets.add("resources");
   if (/^(?:create|build|write|draft|produce|install|prepare|migrate|translate|assemble|finalize)\b/i.test(clean) || /\b(?:manuscript|captions?|recipe notes?|family stories?|book files?|print-ready files?)\b/i.test(clean)) facets.add("production");
   if (/\b(?:test|verify|validate|walkthrough|walk through|exercise|trial|real conditions|feedback|review with|proof cop(?:y|ies)|evaluate a proof)\b/i.test(clean)) facets.add("testing");
   if (/\b(?:handoff|transition|train|orientation|launch|release|distribut\w*|prepare the pilot|prepare the private print run|private print run|final delivery|revise)\b/i.test(clean)) facets.add("handoff");
   if (/\b(?:maintenance|review schedule|biannual|annual review|ongoing review|update cycle|schedule for .*reviews?)\b/i.test(clean)) facets.add("maintenance");

   return facets;
}

function completeMilestoneCoverage(values: string[], title: string, goal: string, description: string) {
   const object = getReadableProjectReference(goal, title);
   const required = getRequiredDependencyFacets(description);
   const result = uniqueMilestones(values, 10);
   const covered = new Set<DependencyFacetId>();

   result.forEach((milestone) => getMilestoneFacets(milestone).forEach((facet) => covered.add(facet)));

   for (const facet of required) {
      if (covered.has(facet)) continue;

      const generatedTitle = buildFacetMilestoneTitle(facet, object, description);
      const targetOrder = DEPENDENCY_FACET_ORDER[facet];
      const insertAt = result.findIndex((milestone) => {
         const milestoneFacets = getMilestoneFacets(milestone);
         if (!milestoneFacets.size) return false;
         return Math.min(...Array.from(milestoneFacets).map((item) => DEPENDENCY_FACET_ORDER[item])) > targetOrder;
      });

      const next = insertAt >= 0 ? [...result.slice(0, insertAt), generatedTitle, ...result.slice(insertAt)] : [...result, generatedTitle];
      result.splice(0, result.length, ...uniqueMilestones(next, 10));
      getMilestoneFacets(generatedTitle).forEach((coveredFacet) => covered.add(coveredFacet));
      covered.add(facet);
   }

   const requiredCoverage = required.filter((facet) => result.some((milestone) => getMilestoneFacets(milestone).has(facet))).length;
   const minimumCoverage = Math.max(4, Math.ceil(required.length * 0.72));

   return result.length >= 6 && requiredCoverage >= Math.min(required.length, minimumCoverage) ? result : [];
}

function getCoreProjectNoun(goal: string, title: string, description: string) {
   const source = `${goal}\n${title}\n${description}`;
   const candidates = ["mural", "artwork", "installation", "signage", "exhibit", "garden", "cookbook", "archive", "guide", "plan", "system", "workspace", "website", "application", "app", "report", "event", "pilot"];
   return candidates.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(source)) || getReadableProjectReference(goal, title);
}

function isPlaceBasedCreativeProject(goal: string, description: string) {
   const source = `${goal}\n${description}`;
   const creative = /\b(?:mural|public art|artwork|installation|signage|sculpture|painted design|community art|garden)\b/i.test(source);
   const place = /\b(?:wall|site|building|center|property|space|facade|courtyard|grounds?)\b/i.test(source);
   return creative && place;
}

function buildPlaceBasedCreativeMilestones(title: string, goal: string, description: string) {
   const object = getCoreProjectNoun(goal, title, description);
   const site = /\bwall\b/i.test(description) ? "wall" : /\bsite\b/i.test(description) ? "site" : /\bspace\b/i.test(description) ? "space" : "location";
   const workPlan = /\bmural\b/i.test(description) ? "painting plan" : "installation plan";
   const milestones: string[] = [`Confirm who owns the ${site} and who can approve the ${object}`];

   if (/\b(?:repairs?|condition|inspect|inspection|prepare|surface|damage)\b/i.test(description)) {
      milestones.push(`Inspect the ${site} and document repair or preparation needs`);
   }

   if (/\b(?:insurance|safety|access|permit|permission|requirements?)\b/i.test(description)) {
      milestones.push(`Confirm insurance, safety, and site-access requirements`);
   }

   if (/\b(?:community|neighbors?|residents?|students?|teenagers?|participants?|input|identity)\b/i.test(description)) {
      milestones.push(`Decide how community input will shape the ${object} design`);
   }

   if (/\b(?:artist|designer|design lead|lead the painting|lead the work)\b/i.test(description)) {
      milestones.push(`Confirm the artist or design lead and approve the final design`);
   } else {
      milestones.push(`Select and approve the final ${object} design`);
   }

   if (/\b(?:budget|materials?|supplies|equipment|cost|purchase|buy)\b/i.test(description)) {
      milestones.push(`Finalize the budget, materials, and ${workPlan}`);
   }

   milestones.push(`Prepare the ${site} and complete the ${object}`);
   milestones.push(`Inspect the finished ${object} and resolve remaining issues`);

   if (/\b(?:maintain|maintenance|damage|repair|hold up|durable|longevity)\b/i.test(description)) {
      milestones.push(`Assign ${object} maintenance and damage-repair responsibilities`);
   }

   const seen = new Set<string>();
   return milestones.filter((milestone) => {
      const key = normalizeKey(milestone);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
   }).slice(0, 10);
}

function getLendableItemNoun(description: string) {
   const source = compactText(description, 8000);
   const candidates = ["tools", "equipment", "books", "supplies", "items", "resources"];
   return candidates.find((candidate) => new RegExp(`\\b${candidate}\\b`, "i").test(source)) || "items";
}

function getGoverningProjectProfile(goal: string, title: string, description = "") {
   const source = `${goal}\n${title}\n${description}`;
   if (/\b(?:lend(?:ing)?|borrow(?:ing)?|checkout|check-out|loan|shared shelf|library of things)\b/i.test(source)) return "lending";
   if (/\b(?:software|application|app|website|web app|browser|planner|dashboard)\b/i.test(source)) return "software";
   if (/\b(?:records?|record system|files?|document migration|data migration)\b/i.test(source) && /\b(?:move|migration|system|storage|organize|centralize|transition|handoff)\b/i.test(source)) return "records";
   if (/\b(?:cookbook|book|publication|manuscript|recipe archive|family recipes|printed guide|booklet)\b/i.test(source)) return "publication";
   if (/\b(?:emergency plan|emergency-readiness|readiness plan|evacuation plan)\b/i.test(source)) return "emergency";
   if (/\b(?:event|movie night|workshop|festival|screening|meetup|gathering)\b/i.test(source)) return "event";
   return "general";
}

function buildProfileMilestones(profile: string, goal: string, title: string, description: string) {
   const object = getCoreProjectNoun(goal, title, description);

   if (profile === "lending") {
      const items = getLendableItemNoun(description);
      const host = getHostOrganization(description);
      const approvalTarget = host ? `the ${host}` : "the host organization";
      return [
         `Confirm whether ${approvalTarget} will approve the lending shelf and what requirements apply`,
         `Define which ${items} the first version will accept and exclude`,
         `Set safety, condition, storage, and inspection rules for the ${items}`,
         `Decide how borrowing, returns, overdue items, loss, and damage will be handled`,
         `Confirm who will manage the lending shelf and how much ongoing work is realistic`,
         `Choose a simple method for tracking borrowed ${items}`,
         `Collect and inspect the first set of ${items}`,
         `Set up the shelf and test the borrowing process with a small group`,
         `Review the test and adjust the rules before expanding`,
      ];
   }

   if (profile === "software") {
      return [
         `Define the first user outcome and first-version scope for the ${object}`,
         `Choose the smallest feature set that delivers the core result`,
         `Confirm the data, storage, and technical approach`,
         `Build the first complete user path`,
         `Test the complete path and record failures`,
         `Fix the blocking issues and document the next version`,
      ];
   }

   if (profile === "records") {
      return [
         `Inventory the records and every current storage location`,
         `Define access, naming, retention, and ownership rules`,
         `Choose the shared storage setup`,
         `Prepare the folder and metadata structure`,
         `Migrate a representative batch and verify access and completeness`,
         `Move the remaining records and resolve exceptions`,
         `Document the handoff and ongoing owner`,
      ];
   }

   if (profile === "publication") {
      return [
         `Inventory the source material and identify missing information`,
         `Choose what belongs in the first collection`,
         `Confirm permissions, attribution, and sensitive-content boundaries`,
         `Resolve conflicting versions and content standards`,
         `Draft and test the selected content`,
         `Choose the structure and visual approach`,
         `Build and review the complete manuscript`,
         `Produce and evaluate a proof`,
         `Revise the finished work and prepare the first private release`,
      ];
   }

   if (profile === "emergency") {
      return [
         `Define the emergencies and first-hours guidance the plan must cover`,
         `Confirm building responsibilities, approvals, and professional guidance`,
         `Inventory exits, contacts, equipment, and current gaps`,
         `Resolve communication, privacy, and assistance rules`,
         `Draft the building guide, contact sheet, and map`,
         `Verify the instructions inside the building`,
         `Test the plan with a calm tabletop walkthrough`,
         `Revise the plan and assign ongoing review responsibility`,
      ];
   }

   if (profile === "event") {
      return [
         `Confirm approval, site rules, and the event boundary`,
         `Choose the date, location, and weather backup`,
         `Confirm licensing, power, sound, and safety requirements`,
         `Finalize the budget, equipment, seating, and supplies`,
         `Assign setup, communication, and cleanup responsibilities`,
         `Run the event and handle exceptions`,
         `Review the result and record what should change next time`,
      ];
   }

   return [];
}

function buildLocalMilestones(title: string, goal: string, description: string) {
   if (isPlaceBasedCreativeProject(goal, description)) return buildPlaceBasedCreativeMilestones(title, goal, description);

   const profile = getGoverningProjectProfile(goal, title, description);
   const profileMilestones = buildProfileMilestones(profile, goal, title, description);
   if (profileMilestones.length) return profileMilestones;

   const object = getReadableProjectReference(goal, title);
   const required = getRequiredDependencyFacets(description);
   const milestones = required.map((facet) => buildFacetMilestoneTitle(facet, object, description));
   const result = uniqueMilestones(milestones, 10);
   if (result.length >= 6) return result;

   return [
      `Define the finished ${object} and the result it must deliver`,
      `Confirm the facts, limits, and outside requirements`,
      `Resolve the decisions that block the ${object}`,
      `Design how the ${object} will work`,
      `Create the first complete ${object}`,
      `Review the ${object} in its intended setting`,
      `Revise the ${object} and close the remaining gaps`,
   ];
}

function getHostOrganization(description: string) {
   const match = compactText(description, 5000).match(/\b(?:behind|at|through|with|for)\s+(?:our|the)\s+([a-z][a-z -]{1,60}?(?:center|school|library|association|organization|building|office|museum|church))\b/i);
   return match?.[1]?.trim() || "";
}

function buildLocalStartingPoint(goal: string, description: string, milestones: string[], openQuestions: string[]) {
   const object = getCoreProjectNoun(goal, "", description);
   const signals = inferDependencySignals(description);
   const profile = getGoverningProjectProfile(goal, "", description);

   if (isPlaceBasedCreativeProject(goal, description) && /\b(?:owner|owns|ownership|permission|approval)\b/i.test(description)) {
      const site = /\bwall\b/i.test(description) ? "wall" : /\bsite\b/i.test(description) ? "site" : "location";
      const host = getHostOrganization(description);
      const contact = host ? `Contact the ${host}` : "Contact the site owner or host organization";
      return `${contact} to confirm who owns the ${site}, who can approve the ${object}, and whether an inspection or insurance review is required.`;
   }

   if (profile === "lending") {
      const host = getHostOrganization(description);
      const contact = host ? `Ask the ${host}` : "Ask the host organization";
      return `${contact} whether the lending shelf can be approved and what it requires for storage, safety, liability, and ongoing oversight.`;
   }
   if (profile === "software") return `Write one sentence describing the first user result, then list only the screens, actions, and data needed to complete that path.`;
   if (profile === "records") return `Create an inventory showing each record group, its current location, who can access it, and whether anything is missing or duplicated.`;
   if (profile === "publication") return `Create an inventory of the source material, including origin, completeness, permission status, testing needs, and fit for the first collection.`;
   if (profile === "emergency") return `Create a building-readiness inventory of exits, emergency contacts, safety equipment, communication gaps, and items that require property-manager confirmation.`;
   if (profile === "event") return `Contact the site manager to confirm approval, available dates, site rules, and any licensing, power, sound, or insurance requirements.`;

   if (signals.evidence) return `Create an inventory of the existing sources, materials, and assets for the ${object}, including origin, completeness, permission status, and fit for the first version.`;
   if (signals.externalRequirements) return `List the approvals, safety checks, professional guidance, and outside requirements that must be confirmed before production begins.`;
   if (signals.decisions || signals.scope) return `Write a short decision list for the ${object} showing the first-version boundary, firm limits, unresolved choices, and the information needed to resolve each one.`;

   const first = milestones[0] || `Define the first ${object}`;
   return `Write down the intended result, what is already known, and the first unanswered question needed to begin “${first}.”`;
}

function buildLocalGuide(input: BuildProjectDraftGuideInput): ProjectDraftGuide {
   const title = cleanTitle(input.title);
   const description = cleanText(input.description);
   const goal = inferGoal(title, description);
   const successCriteria = inferSuccessCriteria(description);
   const confirmedDecisions = inferDecisions(description);
   const openQuestions = inferOpenQuestions(description, goal);
   const constraints = inferConstraints(description, confirmedDecisions);
   const currentSituation = inferCurrentSituation(description, [goal, ...successCriteria, ...confirmedDecisions, ...openQuestions, ...constraints]);
   const workingNotes = inferWorkingNotes(goal, description, openQuestions, constraints);
   const milestones = buildLocalMilestones(title, goal, description);
   const recommendedStartingPoint = buildLocalStartingPoint(goal, description, milestones, openQuestions);

   return {
      projectType: inferProjectType(goal, description),
      goal,
      successCriteria: successCriteria.length ? successCriteria : buildFallbackSuccessCriteria(goal, title, description),
      currentSituation,
      confirmedDecisions,
      openQuestions,
      constraints,
      workingNotes,
      milestones,
      recommendedStartingPoint,
      source: "local",
   };
}

// ========================================
// Model response parsing and validation
// ========================================

function normalizeLabeledSections(value: string) {
   const labels = "GOAL|PROJECT GOAL|SUCCESS|SUCCESS LOOKS LIKE|CURRENT FACTS|CURRENT SITUATION|CONFIRMED DECISIONS|OPEN QUESTIONS|CONSTRAINTS|ALLEVIN['’]S GUIDE|WORKING NOTES|MILESTONES|INITIAL MILESTONES|START|RECOMMENDED STARTING POINT";

   return cleanText(value)
      .replace(new RegExp(`\\s+(?=(?:${labels})\\s*:)`, "gi"), "\n")
      .replace(/\s+(?=(?:[1-9]|10)[.)]\s+)/g, "\n")
      .replace(/\s+(?=[-*•+]\s+)/g, "\n");
}

function extractLabeledSection(value: string, labels: string[]) {
   const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
   const boundary = "GOAL|PROJECT GOAL|SUCCESS|SUCCESS LOOKS LIKE|CURRENT FACTS|CURRENT SITUATION|CONFIRMED DECISIONS|OPEN QUESTIONS|CONSTRAINTS|ALLEVIN['’]S GUIDE|WORKING NOTES|MILESTONES|INITIAL MILESTONES|START|RECOMMENDED STARTING POINT";
   const normalized = normalizeLabeledSections(value);
   const match = normalized.match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*:\\s*\\n?([\\s\\S]*?)(?=\\n\\s*(?:${boundary})\\s*:|$)`, "i"));

   return cleanText(match?.[1] || "");
}

function splitStructuredItems(value: string, splitSentenceBoundaries = true) {
   return normalizeLabeledSections(value)
      .split("\n")
      .flatMap((line) => line.split(/(?=(?:[1-9]|10)[.)]\s+)/))
      .flatMap((line) => line.split(/;\s+(?=[A-Z0-9])/))
      .flatMap((line) => {
         const numberedItem = /^(?:[1-9]|10)[.)]\s+/.test(line.trim());
         return splitSentenceBoundaries && !numberedItem ? line.split(/(?<=[.!?])\s+(?=[A-Z][a-z])/) : [line];
      })
      .map((item) => item.trim())
      .filter(Boolean);
}

function parseList(value: string, limit = 10) {
   return uniqueStatements(splitStructuredItems(value, true).map(stripListMarker).filter(Boolean), limit);
}

function parseMilestoneList(value: string, limit = 10) {
   return uniqueMilestones(splitStructuredItems(value, false).map(stripListMarker).filter(Boolean), limit);
}

function parseModelSections(focus: string, usefulContext: string, nextStep: string): ModelProjectDraftSections {
   const rawGoal = extractLabeledSection(focus, ["GOAL", "PROJECT GOAL"]) || normalizeLabeledSections(focus).split("\n")[0] || "";
   const goal = cleanTitle(rawGoal.replace(/\s+(?:SUCCESS|SUCCESS LOOKS LIKE)\s*:[\s\S]*$/i, ""));
   const successBody = extractLabeledSection(focus, ["SUCCESS", "SUCCESS LOOKS LIKE"]) || extractLabeledSection(usefulContext, ["SUCCESS", "SUCCESS LOOKS LIKE"]);

   const currentSituation = parseList(extractLabeledSection(usefulContext, ["CURRENT FACTS", "CURRENT SITUATION"]), 8);
   const confirmedDecisions = parseList(extractLabeledSection(usefulContext, ["CONFIRMED DECISIONS"]), 10);
   const openQuestions = parseList(extractLabeledSection(usefulContext, ["OPEN QUESTIONS"]), 10)
      .map(ensureReadableQuestion)
      .filter(Boolean);
   const constraints = parseList(extractLabeledSection(usefulContext, ["CONSTRAINTS"]), 10);
   const workingNotes = parseList(extractLabeledSection(usefulContext, ["ALLEVIN'S GUIDE", "ALLEVIN’S GUIDE", "WORKING NOTES"]), 8);

   const milestonesBody = extractLabeledSection(nextStep, ["MILESTONES", "INITIAL MILESTONES"]);
   const milestones = parseMilestoneList(milestonesBody, 10);
   const recommendedStartingPoint = stripListMarker(extractLabeledSection(nextStep, ["START", "RECOMMENDED STARTING POINT"]) || (milestonesBody ? "" : nextStep));

   return {
      goal,
      successCriteria: parseList(successBody, 6),
      currentSituation,
      confirmedDecisions,
      openQuestions,
      constraints,
      workingNotes,
      milestones,
      recommendedStartingPoint,
   };
}

function validateModelGoal(value: string, description: string) {
   return Boolean(value && !isTentative(value) && !isNegatedImplementation(value) && !isInstructionLike(value) && isGroundedStatement(value, description, 0.18));
}

function isGenericMilestoneLanguage(value: string) {
   const clean = compactText(value, 800);
   return /\b(?:outside requirements|operating design decisions|project['’]s structure and workflow|first-phase resources|real conditions|what it must prove|finished result|existing information, assets, and gaps|resolve the choices blocking|choose the first-phase resources|design the .* structure and workflow)\b/i.test(clean);
}

function isUnsupportedExpansionMilestone(value: string, description: string) {
   const clean = compactText(value, 900);
   const source = compactText(description, 20000);
   const expansion = /\b(?:launch event|promot(?:e|ion|ional)|market(?:ing)?|advertis(?:e|ing)|publicity|social media campaign|fundraising event|open house)\b/i.test(clean);
   if (!expansion) return false;

   return !/\b(?:launch event|promotion|promote|marketing|advertise|publicity|social media campaign|fundraising event|open house)\b/i.test(source);
}

function hasLendingMilestoneCoverage(values: string[]) {
   const text = values.join("\n");
   const checks = [
      /\b(?:approve|approval|host organization|community center|site rules|requirements apply)\b/i,
      /\b(?:accept|exclude|first set|first version|item scope|which tools|which items)\b/i,
      /\b(?:safety|condition|storage|inspection)\b/i,
      /\b(?:borrowing|returns?|overdue|loss|damage)\b/i,
      /\b(?:manage|manager|owner|ongoing work|oversight)\b/i,
      /\b(?:track|tracking|checkout record|borrowed)\b/i,
      /\b(?:test|pilot|small group|trial)\b/i,
   ];
   return checks.filter((pattern) => pattern.test(text)).length >= 6;
}

function validateModelMilestones(values: string[], title: string, description: string, goal: string) {
   const source = `${goal}\n${description}`;
   const result: string[] = [];

   for (const value of values) {
      const clean = cleanTitle(value);

      if (
         !clean ||
         !startsWithActionVerb(clean) ||
         isInstructionLike(clean) ||
         isConversationalProjectRequest(clean) ||
         hasMalformedProjectReference(clean) ||
         isGenericMilestoneLanguage(clean) ||
         isUnsupportedExpansionMilestone(clean, description) ||
         /(?:^|\s)(?:[2-9]|10)[.)]\s+/.test(clean) ||
         /(?:\.{3}|…)$/.test(clean)
      ) {
         continue;
      }

      if (/\b(?:smallest complete user flow|workflow, capacity, and ownership|tools, equipment, and materials|realistic user scenarios|earliest dependency|minimum acceptable quality)\b/i.test(clean)) {
         continue;
      }

      const grounded = isGroundedStatement(clean, source, 0.08) || getOverlap(clean, goal) >= 0.18;
      if (!grounded) continue;

      if (!result.some((existing) => isDuplicateMilestone(existing, clean))) result.push(clean);
   }

   const profile = getGoverningProjectProfile(goal, title, description);
   if (profile === "lending") {
      const concrete = result.filter((milestone) => !isGenericMilestoneLanguage(milestone) && !isUnsupportedExpansionMilestone(milestone, description));
      return concrete.length >= 7 && hasLendingMilestoneCoverage(concrete) ? uniqueMilestones(concrete, 10) : buildProfileMilestones("lending", goal, title, description);
   }

   if (isPlaceBasedCreativeProject(goal, description)) {
      const projectSpecific = result.filter((milestone) => !isGenericMilestoneLanguage(milestone));
      return projectSpecific.length >= 7 ? uniqueMilestones(projectSpecific, 10) : buildPlaceBasedCreativeMilestones(title, goal, description);
   }

   return completeMilestoneCoverage(result, title, goal, description);
}

function validateStartingPoint(value: string, description: string, milestones: string[]) {
   const clean = compactText(value, PROJECT_DRAFT_LIMITS.startingPoint);

   if (
      !clean ||
      isInstructionLike(clean) ||
      isConversationalProjectRequest(clean) ||
      hasMalformedProjectReference(clean) ||
      /^(?:recommend|identify|choose one concrete|provide|return)\b/i.test(clean) ||
      /\b(?:the next milestone needs|actual source files|user instruction|what it must prove|irreversible commitments|dependency ledger|complete "|requirements brief for the i|baseline for the i)\b/i.test(clean)
   ) {
      return "";
   }

   const source = `${description}\n${milestones.join("\n")}`;
   return isGroundedStatement(clean, source, 0.05) || startsWithActionVerb(clean) || /^Start\b/i.test(clean) ? clean : "";
}

function validateModelList(values: string[], description: string, limit: number, questionMode = false) {
   const source = cleanText(description);

   return uniqueStatements(
      values
         .map((value) => (questionMode ? ensureReadableQuestion(value) : stripListMarker(value)))
         .filter(Boolean)
         .filter((value) => !isConversationalProjectRequest(value) && !hasMalformedProjectReference(value))
         .filter((value) => isGroundedStatement(value, source, questionMode ? 0.04 : 0.08)),
      limit,
   );
}

function hasProjectSpecificLanguage(value: string, description: string, goal: string) {
   const clean = compactText(value, 1200);
   if (
      isConversationalProjectRequest(clean) ||
      hasMalformedProjectReference(clean) ||
      /\b(?:irreversible work|unresolved items cannot move into final production|decision gate)\b/i.test(clean) ||
      /^(?:use the existing materials as evidence|treat privacy, safety, permissions|keep unresolved options separate|protect the first version|resolve the questions that change scope|carry the confirmed limits|record permission, privacy, safety, or access status beside)\b/i.test(clean)
   ) {
      return false;
   }

   const valueTokens = getTokens(clean);
   const sourceTokens = new Set([...getTokens(description), ...getTokens(goal)]);
   const genericTokens = new Set(["project", "first", "version", "scope", "evidence", "decision", "decisions", "requirements", "work", "result", "materials", "options", "testing", "complete"]);
   let sharedSpecific = 0;

   valueTokens.forEach((token) => {
      if (sourceTokens.has(token) && !genericTokens.has(token)) sharedSpecific += 1;
   });

   return sharedSpecific >= 1;
}

function isUnsupportedGuideExpansion(value: string, description: string) {
   const clean = compactText(value, 1000);
   const source = compactText(description, 20000);
   const addsCommittee = /\b(?:committee|permanent role|formal volunteer team|advisory group)\b/i.test(clean) && !/\b(?:committee|permanent role|formal volunteer team|advisory group)\b/i.test(source);
   const addsPromotion = /\b(?:promot(?:e|ion)|marketing|publicity|launch event|outreach campaign)\b/i.test(clean) && !/\b(?:promot(?:e|ion)|marketing|publicity|launch event|outreach campaign)\b/i.test(source);
   return addsCommittee || addsPromotion;
}

function improveWorkingNotes(modelValues: string[], localValues: string[], description: string, goal: string) {
   const model = validateModelList(modelValues, `${description}\n${goal}`, 8)
      .filter((value) => hasProjectSpecificLanguage(value, description, goal))
      .filter((value) => !isUnsupportedGuideExpansion(value, description));
   const result = [...model];

   for (const localValue of localValues) {
      if (result.length >= 7) break;
      const clean = stripListMarker(localValue);
      if (!clean) continue;
      const duplicate = result.some((existing) => normalizeKey(existing) === normalizeKey(clean) || getOverlap(existing, clean) >= 0.72);
      if (!duplicate) result.push(clean);
   }

   return result.slice(0, 7);
}

function getProjectQuestionFamily(value?: string) {
   const clean = normalizeKey(value);

   if (/\b(?:version|versions|variation|variations|variant|variants)\b/i.test(clean) && /\b(?:choose|chosen|together|separate|primary|official|present|presented|handle|handled|explain|explained|document|documented|compare)\b/i.test(clean)) return "version-handling";
   if (/\b(?:organize|organized|organization|structure|group|grouping|order)\b/i.test(clean) && /\b(?:meal|branch|decade|occasion|tradition|category|chapter|section)\b/i.test(clean)) return "organization-method";
   if (/\b(?:material|materials|supplies|paint|equipment)\b/i.test(clean)) return "materials";
   if (/\b(?:permission|permissions|approval|approve|owner|owns|ownership)\b/i.test(clean)) return "approval-ownership";
   if (/\b(?:insurance)\b/i.test(clean)) return "insurance";
   if (/\b(?:wall|site|surface|building|space)\b/i.test(clean) && /\b(?:repair\w*|condition|prepare|preparation|inspect\w*)\b/i.test(clean)) return "site-condition";
   if (/\b(?:maintain\w*|maintenance|damag\w*)\b/i.test(clean)) return "maintenance-repair";
   if (/\b(?:design|artist|lead the painting|design lead)\b/i.test(clean)) return "design-lead";

   return "";
}

function resolveProjectQuestionReference(value: string, goal: string, description: string) {
   let clean = compactText(value, 900).replace(/[?]+$/, "").trim();
   if (!clean) return "";

   const projectObject = getProjectObject(goal, "") || getCoreProjectNoun(goal, "", description);
   const lending = /\b(?:lend(?:ing)?|borrow(?:ing)?|checkout|check-out|loan|shared shelf|library of things)\b/i.test(`${goal}\n${description}`);
   const items = lending ? getLendableItemNoun(description) : "items";

   clean = clean
      .replace(/^Who would manage it$/i, `Who will manage the ${projectObject}`)
      .replace(/^Who will manage it$/i, `Who will manage the ${projectObject}`)
      .replace(/^How should it work$/i, `How should the ${projectObject} work`)
      .replace(/^What should happen if it is lost or damaged$/i, lending ? `What should happen if ${items} are lost or damaged` : `What should happen if the ${projectObject} is lost or damaged`)
      .replace(/^What should happen if something is lost or damaged$/i, lending ? `What should happen if ${items} are lost or damaged` : `What should happen if something connected to the ${projectObject} is lost or damaged`)
      .replace(/\bthem\b/gi, lending ? items : projectObject)
      .replace(/\bit\b/gi, `the ${projectObject}`)
      .replace(/\bthis\b/gi, `the ${projectObject}`)
      .replace(/\s+/g, " ")
      .trim();

   return clean;
}

function getMaintenanceQuestion(goal: string, description: string) {
   const source = `${goal}\n${description}`;
   const lending = /\b(?:lend(?:ing)?|borrow(?:ing)?|checkout|check-out|loan|shared shelf|library of things)\b/i.test(source);
   if (lending) {
      const items = getLendableItemNoun(description);
      return `Who will inspect and maintain the ${items}, and how will lost or damaged ${items} be handled`;
   }

   const object = getCoreProjectNoun(goal, "", description);
   if (/\b(?:damage|damaged|repair)\b/i.test(description)) {
      return `Who will maintain the ${object}, and what should happen if it is damaged`;
   }

   return `Who will maintain the ${object} over time`;
}

function dedupeProjectQuestions(values: string[], limit: number, description = "", goal = "") {
   const result: string[] = [];

   for (const value of values) {
      const initial = ensureReadableQuestion(value);
      const clean = resolveProjectQuestionReference(initial, goal, description);

      if (!clean || isMetaUncertaintyStatement(clean) || /^what should be decided first\b/i.test(clean)) {
         continue;
      }

      const family = getProjectQuestionFamily(clean) || (/^Should one be chosen$/i.test(clean) && result.some((existing) => getProjectQuestionFamily(existing) === "version-handling") ? "version-handling" : "");
      const readable =
         family === "version-handling"
            ? "How should conflicting versions be presented: together, as one primary version, or as documented variations"
            : family === "maintenance-repair"
              ? getMaintenanceQuestion(goal, description)
              : clean;
      const duplicate = result.some((existing) => {
         const existingFamily = getProjectQuestionFamily(existing);
         return normalizeKey(existing) === normalizeKey(readable) || getOverlap(existing, readable) >= 0.58 || Boolean(family && existingFamily && family === existingFamily);
      });

      if (!duplicate) {
         result.push(readable);
      }

      if (result.length >= limit) {
         break;
      }
   }

   return result;
}

function scoreProjectStartingPoint(value: string, description: string) {
   const clean = compactText(value, PROJECT_DRAFT_LIMITS.startingPoint);
   const signals = inferDependencySignals(description);
   let score = 0;

   if (!clean || isConversationalProjectRequest(clean) || hasMalformedProjectReference(clean)) return -100;

   if (/^(?:start by|contact|create|build|draft|request|gather|inventory|map|document|confirm|review)\b/i.test(clean)) score += 2;
   if (/\b(?:contact|confirm who owns|who can approve|inspection|insurance review)\b/i.test(clean) && signals.externalRequirements) score += 5;
   if (/\b(?:lend(?:ing)?|borrow(?:ing)?|checkout|check-out|shared shelf)\b/i.test(description)) {
      if (/\b(?:approve|approval)\b/i.test(clean)) score += 2;
      if (/\b(?:storage|safety|liability|ongoing oversight)\b/i.test(clean)) score += 3;
      if (/\bdiscuss the proposal\b/i.test(clean) && !/\b(?:storage|safety|liability|oversight|requirements?)\b/i.test(clean)) score -= 2;
   }
   if (/\b(?:inventory|catalog|register|matrix|table|source map|asset list)\b/i.test(clean) && signals.evidence) score += 4;
   if (/\b(?:inspection records?|source records?|existing records?|current documents?|measurements?)\b/i.test(clean) && signals.evidence) score += 3;
   if (/\b(?:permission|approval|rights|privacy|professional confirmation|inspection)\b/i.test(clean) && signals.externalRequirements) score += 2;
   if (/\b(?:scope|selection criteria|first-version boundary|what belongs|must cover)\b/i.test(clean) && signals.scope) score += 2;
   if (/\b(?:owner|ownership|responsible|decision authority)\b/i.test(clean) && signals.ownership) score += 2;
   if (/\b(?:worksheet|inventory|table|map|list|matrix|record)\b/i.test(clean)) score += 1;

   const wordCount = clean.split(/\s+/).length;
   if (wordCount > 45) score -= 3;
   if (/\b(?:what it must prove|irreversible commitments|dependency|complete ")\b/i.test(clean)) score -= 5;

   const specificTokens = [...getTokens(clean)].filter((token) => getTokens(description).has(token));
   score += Math.min(2, Math.floor(specificTokens.length / 2));

   const permissionOnly = /\b(?:permission|rights|approval)\b/i.test(clean) && !/\b(?:inventory|catalog|table|matrix|scope|criteria|records?|map|inspection|insurance|owner)\b/i.test(clean);
   if (permissionOnly && signals.evidence && signals.scope) score -= 2;

   return score;
}

function chooseProjectStartingPoint(modelValue: string, localValue: string, description: string, milestones: string[]) {
   const model = validateStartingPoint(modelValue, description, milestones);
   const local = validateStartingPoint(localValue, description, milestones) || localValue;

   if (!model) return local;
   if (!local) return model;

   const modelScore = scoreProjectStartingPoint(model, description);
   const localScore = scoreProjectStartingPoint(local, description);

   return modelScore >= localScore ? model : local;
}

function mergeGroundedLists(modelValues: string[], localValues: string[], description: string, limit: number, minimum: number, options: { questionMode?: boolean; decisionMode?: boolean; currentFactMode?: boolean; constraintMode?: boolean; goal?: string } = {}) {
   const validatedModel = validateModelList(modelValues, description, limit, options.questionMode === true)
      .map((value) => (options.constraintMode ? makeConstraintLanguage(value) : value))
      .filter((value) => {
         if (options.decisionMode && !isDecisionSupportedBySource(value, description)) return false;
         if (
            options.decisionMode &&
            /\b(?:relative|person|volunteer|reviewer|tester|advisor|neighbor|colleague)\b[\s\S]{0,160}\b(?:will help|will review|will test|will assist)\b/i.test(value) &&
            /\b(?:offered|willing)\b/i.test(description)
         )
            return false;
         if (options.currentFactMode && (isFirmDecision(value) || isQuestion(value) || /\b(?:should|must|will|want to|would like to|success)\b/i.test(value))) return false;
         if (options.currentFactMode && !preservesSourceCertainty(value, description)) return false;
         if (options.constraintMode && (!isConstraintCandidate(value) || !isConstraintSupportedBySource(value, description)) && !/^Preserve meaningful source differences\b/i.test(value)) return false;
         return true;
      });

   const model = options.questionMode ? dedupeProjectQuestions(validatedModel, limit, description, options.goal || "") : validatedModel;
   const result = [...model];

   for (const localValue of localValues) {
      if (result.length >= limit) break;
      if (result.length >= minimum && !options.questionMode) break;

      const clean = options.questionMode ? ensureReadableQuestion(localValue) : stripListMarker(localValue);
      if (!clean || isConversationalProjectRequest(clean) || hasMalformedProjectReference(clean)) continue;
      if (options.decisionMode && !isFirmDecision(clean)) continue;
      if (options.currentFactMode && (isFirmDecision(clean) || isQuestion(clean) || /\b(?:should|must|will|want to|would like to|success)\b/i.test(clean))) continue;
      if (options.constraintMode && !isConstraintCandidate(clean)) continue;

      const duplicateThreshold = options.questionMode ? 0.42 : options.currentFactMode ? 0.65 : 0.78;
      const questionFamily = options.questionMode ? getProjectQuestionFamily(clean) : "";
      if (options.questionMode && result.length >= minimum && questionFamily && result.some((existing) => getProjectQuestionFamily(existing) === questionFamily)) continue;
      const duplicate = result.some((existing) => {
         const existingFamily = options.questionMode ? getProjectQuestionFamily(existing) : "";
         return normalizeKey(existing) === normalizeKey(clean) || getOverlap(existing, clean) >= duplicateThreshold || Boolean(questionFamily && existingFamily && questionFamily === existingFamily);
      });
      if (!duplicate) result.push(clean);
   }

   return options.questionMode ? dedupeProjectQuestions(result, limit, description, options.goal || "") : result.slice(0, limit);
}

function mergeModelWithLocal(local: ProjectDraftGuide, model: ModelProjectDraftSections, title: string, description: string): ProjectDraftGuide {
   const goal = validateModelGoal(model.goal, description) ? model.goal : local.goal;
   const milestones = validateModelMilestones(model.milestones, title, description, goal);
   const finalMilestones = milestones.length ? milestones : local.milestones;
   const recommendedStartingPoint = chooseProjectStartingPoint(model.recommendedStartingPoint, local.recommendedStartingPoint, description, finalMilestones);

   const successCriteria = mergeGroundedLists(model.successCriteria, local.successCriteria, description, 6, 2);
   const currentSituation = mergeGroundedLists(model.currentSituation, local.currentSituation, description, 8, 5, { currentFactMode: true });
   const confirmedDecisions = mergeGroundedLists(model.confirmedDecisions, local.confirmedDecisions, description, 10, 4, { decisionMode: true });
   const openQuestions = mergeGroundedLists(model.openQuestions, local.openQuestions, description, 10, 5, { questionMode: true, goal });
   const constraints = mergeGroundedLists(model.constraints, local.constraints, description, 10, 4, { constraintMode: true });
   const workingNotes = improveWorkingNotes(model.workingNotes, local.workingNotes, description, goal);

   const modelContribution =
      Number(goal !== local.goal) +
      model.successCriteria.length +
      model.currentSituation.length +
      model.confirmedDecisions.length +
      model.openQuestions.length +
      model.constraints.length +
      model.workingNotes.length +
      model.milestones.length +
      Number(Boolean(model.recommendedStartingPoint));

   return {
      projectType: inferProjectType(goal, description),
      goal,
      successCriteria: successCriteria.length ? successCriteria : local.successCriteria,
      currentSituation: currentSituation.length ? currentSituation : local.currentSituation,
      confirmedDecisions: confirmedDecisions.length ? confirmedDecisions : local.confirmedDecisions,
      openQuestions: openQuestions.length ? openQuestions : local.openQuestions,
      constraints: constraints.length ? constraints : local.constraints,
      workingNotes: workingNotes.length ? workingNotes : local.workingNotes,
      milestones: finalMilestones,
      recommendedStartingPoint: recommendedStartingPoint || local.recommendedStartingPoint,
      source: modelContribution >= 18 ? "model" : modelContribution > 0 ? "mixed" : "local",
   };
}

// ========================================
// MK XI — User-friendly project shaping
// The reasoning layer can stay deep, but fresh project setup should not expose
// internal planning vocabulary or domain contamination to the user.
// ========================================

function hasProjectWords(value: string, words: RegExp) {
   return words.test(`${value || ""}`.toLowerCase());
}

function looksLikeHomeSpaceProject(title: string, description: string) {
   return hasProjectWords(`${title} ${description}`, /\b(?:room|living room|bedroom|kitchen|home|house|apartment|redecorate|decorate|decor|furniture|lighting|renovate|remodel)\b/i);
}

function looksLikePhysicalPrototypeProject(title: string, description: string) {
   const text = `${title} ${description}`;
   const physicalBuild = /\b(?:prototype|device|wearable|hardware|mechanical|electronic|robot|exosuit|exoskeleton|sensor|motor|component|circuit|fabricate|3d print)\b/i.test(text);
   const buildIntent = /\b(?:build|prototype|assemble|make|design|test)\b/i.test(text);
   return physicalBuild && buildIntent;
}

function looksLikeControlledEnvironmentPrototype(title: string, description: string) {
   const text = `${title} ${description}`;
   return (
      looksLikePhysicalPrototypeProject(title, description) &&
      /\b(?:temperature|humidity|thermal|environmental|climate|heat|heating|cool|cooling)\b/i.test(text) &&
      /\b(?:chamber|enclosure|sensor|control|controller|logging|measurement|prototype)\b/i.test(text)
   );
}

function looksLikeCommunitySpaceProject(title: string, description: string) {
   return hasProjectWords(`${title} ${description}`, /\b(?:community center|community garden|garden|shared space|neighborhood|raised beds?|volunteer responsibilities|watering plan)\b/i);
}

function looksLikeExplicitEventProject(title: string, description: string) {
   return hasProjectWords(`${title} ${description}`, /\b(?:party|wedding|festival|fundraiser|ceremony|conference|meetup|event|reception|retirement party|birthday party)\b/i);
}

function looksLikeGenericPlannerMilestones(values: string[]) {
   const combined = values.join(" ").toLowerCase();
   return (
      /result it must deliver|facts, limits, and outside requirements|decisions that block|design how .* will work|first complete|intended setting|close the remaining gaps/.test(combined) ||
      /approval, site rules|weather backup|licensing, power, sound|seating, and supplies|run the event and handle exceptions/.test(combined)
   );
}

function cleanFriendlySentence(value: string) {
   return stripListMarker(value)
      .replace(/^(?:i|we)\s+(?:want|would like|need|am trying|are trying)\s+to\s+/i, "")
      .replace(/^make sure\s+/i, "")
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/, "")
      .trim();
}

function buildFriendlySuccessCriteria(description: string, existing: string[], goal: string) {
   const existingIsGeneric = !existing.length || existing.every((item) => /complete and meets the confirmed requirements|observable result|finished result|has been reviewed in its intended setting|is finished in a way that matches the goal/i.test(item));

   if (looksLikeControlledEnvironmentPrototype("", description)) {
      const criteria = [
         /\b(?:stable|maintain|hold|target temperature|temperature range)\b/i.test(description)
            ? "The first chamber can reach and hold the target temperature consistently"
            : "The first chamber can control the conditions the first version is meant to test",
         /\b(?:accurate|accuracy|validate|reference|calibrat)\b/i.test(description)
            ? "The temperature and humidity readings can be checked against a trusted reference"
            : "The sensor readings are reliable enough to judge each test",
         /\b(?:safe|safety|emergency|shutoff|shut-off|stop|fire)\b/i.test(description)
            ? "The chamber can shut down safely when a limit is exceeded"
            : "The chamber has clear operating limits and a safe shutdown path",
         /\b(?:condensation|exposed heating|dangerous voltage|fire risk)\b/i.test(description)
            ? "The first version avoids the condensation, heating, and electrical hazards you called out"
            : "The first version stays inside the safety boundaries you set",
      ];
      return uniqueStatements(criteria, 4);
   }

   if (looksLikePhysicalPrototypeProject("", description) && !looksLikeExplicitEventProject("", description)) {
      const criteria = [
         /\b(?:arm movement|carrying|load|assist|assistance)\b/i.test(description) ? "The first prototype performs the intended movement or load-assistance task" : "The first prototype performs the intended core function",
         /\b(?:safe|safety|emergency|shutoff|shut-off|stop)\b/i.test(description) ? "The safety limits and emergency stop are clear and testable" : "The first prototype can be tested safely",
         /\b(?:off-the-shelf|incremental|one subsystem|components)\b/i.test(description) ? "The design can be built and tested in small, practical stages" : "The design can be built and tested in stages",
         /\b(?:not include|without|no weapons?)\b/i.test(description) ? "The prototype stays inside the stated boundaries" : "The finished prototype stays inside the project boundaries",
      ];
      return uniqueStatements(criteria, 4);
   }

   if (looksLikeHomeSpaceProject("", description)) {
      const criteria = [
         /\b(?:warm|calm|cozy|refined|less clutter|cluttered)\b/i.test(description) ? "The space has the intended feel and is easier to live with" : "The space feels intentional and works better for everyday use",
         /\b(?:keep|existing|couch|sofa|console|table|bed)\b/i.test(description) ? "The pieces that are staying fit naturally into the finished room" : "The existing space and new choices work together",
         /\b(?:\$|budget|spend|cost)\b/i.test(description) ? "The changes stay within the budget you set" : "The changes stay within the limits you set",
         /\b(?:movie|guest|work|read|family|entertain|activity|activities)\b/i.test(description) ? "The room still works for the activities that matter there" : "The room works for its intended everyday use",
      ];
      return uniqueStatements(criteria, 4);
   }

   if (looksLikeCommunitySpaceProject("", description)) {
      const criteria = [
         /\b(?:raised bed|garden|layout)\b/i.test(description) ? "The space has a practical first layout that can actually be maintained" : "The shared space has a practical first version",
         /\b(?:water|watering)\b/i.test(description) ? "The watering routine is clear" : "Routine upkeep is clear",
         /\b(?:volunteer|responsibilit|owner)\b/i.test(description) ? "People know who is responsible for the recurring work" : "Ownership of recurring work is clear",
         /\b(?:plant|season)\b/i.test(description) ? "There is a simple way to decide what changes from season to season" : "The group has a simple way to make recurring decisions",
      ];
      return uniqueStatements(criteria, 4);
   }

   if (/\b(?:research|study|sources?|evidence|findings|literature|interviews?)\b/i.test(description)) {
      const sourceCount = description.match(/\b(?:at least|minimum of)\s+(\d+)\s+(?:credible\s+)?sources?\b/i)?.[1];
      const criteria = [
         sourceCount ? `The brief uses at least ${sourceCount} credible sources` : "The brief uses enough credible evidence to support its conclusions",
         /\b(?:compare|comparison|findings)\b/i.test(description) ? "The main findings are compared clearly" : "The evidence is organized into clear findings",
         /\b(?:recommendation|recommendations)\b/i.test(description) ? "The recommendations are tied to the evidence" : "The conclusions follow from the evidence",
         /\b(?:supported by|support(?:ed)? by the evidence|check the conclusions)\b/i.test(description) ? "The final conclusions are supported by the sources" : "The final brief clearly separates evidence from interpretation",
      ];
      return uniqueStatements(criteria, 4);
   }

   if (/\b(?:website|web app|app|software|frontend|backend|next\.js|react|vercel)\b/i.test(description)) {
      const criteria = [
         /\b(?:clearly explains?|understand|content|message)\b/i.test(description) ? "People can quickly understand what the first version is for" : "The first version supports its main user task",
         /\b(?:mobile|tablet|phone|iphone|responsive|devices?)\b/i.test(description) ? "The experience works well on the devices that matter" : "The main experience works reliably from start to finish",
         /\b(?:accessib|wcag|keyboard|contrast)\b/i.test(description) ? "The first version meets the accessibility requirements you set" : "The first version is usable and clear",
         /\b(?:share|public|launch|deploy|deployment|vercel)\b/i.test(description) ? "The first version is ready to share" : "The first version is ready for a real review",
      ];
      return uniqueStatements(criteria, 4);
   }

   if (!existingIsGeneric) return existing.slice(0, 4);

   const sourceSentences = cleanText(description)
      .split(/(?<=[.!?])\s+|\n+/)
      .map(cleanFriendlySentence)
      .filter(Boolean);

   const useful = sourceSentences.filter((sentence) =>
      /\b(?:so it|should|needs? to|make sure|keep|spend|budget|works? for|first version|not include|without|ready|accessible|safe|easy|clear|warm|clutter|guest|public)\b/i.test(sentence),
   );

   const result = uniqueStatements(useful, 4);
   if (result.length) return result;
   return [goal ? `${goal.replace(/[.!?]+$/, "")} is finished in a way that matches the goal` : "The finished result matches the goal"];
}

function buildFriendlyMilestones(title: string, description: string, guide: ProjectDraftGuide) {
   if (looksLikeControlledEnvironmentPrototype(title, description)) {
      return [
         "define the target conditions, chamber size, and first-version scope",
         "set the safety limits and shutdown rules",
         "choose the enclosure, insulation, and heating or cooling approach",
         "design the sensing, control, and data-logging setup",
         "build and test the temperature-control subsystem",
         "assemble the first complete chamber",
         "check the sensor readings and temperature stability",
         "decide what humidity control or dashboard work belongs in the next version",
      ];
   }

   if (looksLikePhysicalPrototypeProject(title, description) && !looksLikeExplicitEventProject(title, description)) {
      return [
         "define what the first version should do and what it must not do",
         "set the safety limits and emergency-stop requirements",
         "choose the basic design and components",
         "build and test one subsystem at a time",
         "assemble the first complete prototype",
         "test it in controlled conditions",
         "refine the design from the test results",
      ];
   }

   if (looksLikeHomeSpaceProject(title, description)) {
      return [
         "decide what stays and what needs to change",
         "choose the look and priorities for the space",
         "measure the space and set the budget",
         "choose the furniture, lighting, and decor",
         "put the room together",
         "live with it and make the final adjustments",
      ];
   }

   if (looksLikeCommunitySpaceProject(title, description)) {
      return [
         "confirm who can approve the space and what limits apply",
         "decide what the first version of the space needs",
         "choose the layout and shared responsibilities",
         "prepare the space and gather what is needed",
         "build the first complete version",
         "try the routine in practice and adjust what is not working",
      ];
   }

   if (looksLikeExplicitEventProject(title, description)) {
      return [
         "confirm the date, place, guest count, and budget",
         "decide the food, seating, music, and program",
         "confirm the supplies, vendors, and backup needs",
         "assign setup, event-day, and cleanup responsibilities",
         "finalize the event plan and contingencies",
         "run the event",
         "close out the remaining follow-up",
      ];
   }

   if (guide.projectType === "software" || hasProjectWords(`${title} ${description}`, /\b(?:website|web app|app|software|frontend|backend|vercel|next\.js|react)\b/i)) {
      return [
         "define the first version and what people need to be able to do",
         "decide the content and page structure",
         "set up the core design and technical foundation",
         "build the main experience",
         "test it on the devices and browsers that matter",
         "fix accessibility and reliability issues",
         "prepare the first version to share",
      ];
   }

   if (guide.projectType === "research" || hasProjectWords(`${title} ${description}`, /\b(?:research|sources?|evidence|study|findings|literature|interviews?)\b/i)) {
      return [
         "define the research question and the evidence needed",
         "gather and organize the strongest sources",
         "compare the evidence and pull out the main findings",
         "draft the brief or report",
         "check the conclusions and recommendations against the evidence",
         "revise and finish the final version",
      ];
   }

   if (guide.projectType === "writing" || hasProjectWords(`${title} ${description}`, /\b(?:write|essay|article|report|proposal|story|brief|document)\b/i)) {
      return [
         "define the audience and what the finished piece needs to accomplish",
         "organize the main points",
         "draft the first complete version",
         "review the structure and clarity",
         "revise the content",
         "finish and prepare the final version",
      ];
   }

   if (looksLikeGenericPlannerMilestones(guide.milestones)) {
      const object = cleanTitle(title) || "project";
      return [
         `define what ${object} should accomplish`,
         "confirm the important limits and decisions",
         "choose the approach",
         "create the first complete version",
         "review it in the real setting",
         "make the final adjustments",
      ];
   }

   return guide.milestones;
}

function buildFriendlyStartingPoint(title: string, description: string, milestones: string[], existing: string) {
   if (looksLikeControlledEnvironmentPrototype(title, description)) {
      return "Write down the target temperature range, usable chamber size, what version one will measure or control, and the safety limits you will not compromise.";
   }

   if (looksLikePhysicalPrototypeProject(title, description) && !looksLikeExplicitEventProject(title, description)) {
      return "Write down what the first prototype should do, what it should not do, and the safety limits you will not compromise.";
   }

   if (looksLikeHomeSpaceProject(title, description)) {
      return "List what is staying in the room, measure the space, and write down the two or three things you most want to change.";
   }

   if (looksLikeCommunitySpaceProject(title, description)) {
      return "Confirm who can approve the space and any limits that affect what can be built there.";
   }

   if (looksLikeExplicitEventProject(title, description)) {
      return "Confirm the date, place, guest count, and budget before locking in food, music, or other event details.";
   }

   if (/\b(?:website|web app|app|software|frontend|backend|vercel|next\.js|react)\b/i.test(`${title} ${description}`)) {
      return "Write down what the first version needs to let someone see or do, then keep everything else out of the first build for now.";
   }

   if (/\b(?:research|sources?|evidence|study|findings|literature|interviews?)\b/i.test(`${title} ${description}`)) {
      return "Write the research question in one sentence, then list the evidence you need before drawing conclusions.";
   }

   if (existing && !/what it must prove|requirements brief|dependency|irreversible commitments|first-version boundary|firm limits|unresolved choices/i.test(existing)) {
      return existing;
   }

   const first = milestones[0] || "clarify the finished result";
   return `Start by ${first.replace(/^(?:decide|define|confirm|choose|create|build|review|prepare|test)\s+/i, (match) => match.toLowerCase())}.`;
}

function buildFriendlyOpenQuestions(title: string, description: string, existing: string[]) {
   if (looksLikeControlledEnvironmentPrototype(title, description)) {
      const questions: string[] = [];
      if (/\b(?:heating|cooling|thermoelectric|temperature control)\b/i.test(description)) questions.push("Which heating or cooling approach best fits the first chamber?");
      if (/\b(?:enclosure material|insulation|insulated enclosure)\b/i.test(description)) questions.push("What enclosure and insulation make the most sense for safety and temperature control?");
      if (/\b(?:accurate|accuracy|validate|calibrat|reference)\b/i.test(description)) questions.push("How will the chamber readings be checked for accuracy?");
      if (/\b(?:humidity control|dashboard|display|graph)\b/i.test(description)) questions.push("Which humidity or dashboard features belong in version one, if any?");
      return uniqueStatements(questions, 4);
   }

   return existing
      .map(ensureReadableQuestion)
      .filter((item) => item && !/what needs to be decided about (?:but|eventually|a graph|i don'?t know|i am not sure)/i.test(item))
      .slice(0, 4);
}

function makeGuideUserFriendly(guide: ProjectDraftGuide, title: string, description: string): ProjectDraftGuide {
   const milestones = buildFriendlyMilestones(title, description, guide)
      .map((item) => stripListMarker(item).replace(/[.!?]+$/, "").trim())
      .filter(Boolean)
      .slice(0, 8);

   return {
      ...guide,
      successCriteria: buildFriendlySuccessCriteria(description, guide.successCriteria, guide.goal),
      openQuestions: buildFriendlyOpenQuestions(title, description, guide.openQuestions),
      milestones,
      recommendedStartingPoint: buildFriendlyStartingPoint(title, description, milestones, guide.recommendedStartingPoint),
   };
}

// ========================================
// Public shared authority
// ========================================

export function buildLocalProjectDraftGuide(input: BuildProjectDraftGuideInput) {
   const safeTitle = cleanTitle(input.title) || "New Project";
   const safeDescription = cleanText(input.description);
   return makeGuideUserFriendly(buildLocalGuide({ title: safeTitle, description: safeDescription }), safeTitle, safeDescription);
}

export async function buildProjectDraftGuide(input: BuildProjectDraftGuideInput): Promise<ProjectDraftGuide> {
   const safeInput = {
      title: cleanTitle(input.title) || "New Project",
      description: cleanText(input.description),
   };

   const localGuide = makeGuideUserFriendly(buildLocalGuide(safeInput), safeInput.title, safeInput.description);

   try {
      const response = await requestAllevinLLM({
         mode: "project-guidance",
         source: "projects",
         title: safeInput.title,
         focus: safeInput.description,
         usefulContext: "Interpret this project as a whole. The governing goal and intended result outrank incidental tools, places, events, programs, supplies, or stakeholders mentioned inside the ramble.",
         nextStep: localGuide.recommendedStartingPoint,
         rawContent: safeInput.description,
         projectStage: "mk-ix-project-intake",
         currentLocation: "ALLEVIN Projects",
         priority: "medium",
         maxWords: 1100,
         userInstruction: `
You are ALLEVIN MK XI's project-intake reasoning layer.

Read the full project description like a thoughtful senior project lead. Determine the project the user is actually trying to complete before interpreting supporting details. Incidental mentions of events, programs, rooms, tools, supplies, software, participants, or records must not redefine the whole project.

Return valid JSON using the existing fields exactly this way:

focus:
GOAL: one direct sentence naming the actual finished project
SUCCESS:
- two to four observable outcomes

usefulContext:
CURRENT FACTS:
- grounded facts only
CONFIRMED DECISIONS:
- firm commitments only
OPEN QUESTIONS:
- natural complete questions
CONSTRAINTS:
- hard limits, exclusions, safety, privacy, timing, budget, or approval boundaries
ALLEVIN'S GUIDE:
- senior-level guidance tied to the actual project

nextStep:
MILESTONES:
1. four to eight dependency-ordered milestones
START:
one concrete first action that creates a decision, artifact, or evidence the next milestone can use

Rules:
- Silently build a dependency ledger before writing milestones: first-version scope, outside requirements, available evidence, ownership, unresolved decisions, operating design, resources, production, verification/testing, handoff, and maintenance.
- Every ledger item clearly supported by the ramble must appear in the milestone sequence. Do not skip a blocking decision merely because drafting can begin.
- Prefer four to seven milestones. Use eight only when the project genuinely has enough distinct dependencies to need it.
- Build milestones from what must be understood, confirmed, decided, designed, produced, tested, handed off, or maintained.
- Never invent a launch event, promotional campaign, marketing task, fundraising event, public announcement, recruitment step, committee, or permanent role unless the user explicitly asked for it or the operating need clearly requires it.
- Never use the phrase “decision gate” in user-facing guidance. State the actual decision and what work should wait for it.
- Maintenance and damage questions must name the actual project object. For lending or borrowing projects, name the items being lent and address inspection, returns, loss, and damage directly.
- Use verb + recognizable project object.
- Preserve hybrid projects instead of forcing one category template.
- Tentative language is not a confirmed decision, hard constraint, deadline, or budget cap. Preserve “may,” “might,” “around,” “considering,” and “would like” as tentative.
- Another person's suggestion, interest, or offer to help is a current fact—not the user's confirmed decision.
- Conversational requests such as “Can you help me,” “I’m not sure where to start,” and “tell me what I should do first” are not project questions and must never appear in the guide.
- Negative statements such as "I am not building an app" are constraints, never the goal.
- Retain enough context internally to lead the work, but keep the eventual user-facing project calm: prioritize the goal, a few success conditions, the milestones, one starting move, and only the decisions that truly need user input.
- ALLEVIN’s Guide should explain how to use the project's own evidence, limits, options, and tests—not simply repeat the ramble. Every guide note must name at least one recognizable object from the project.
- Open Questions must be complete and self-contained. Do not output meta-questions such as "What needs to be decided about there are several things I have not decided," and do not leave vague pronouns such as "that," "it," or "them" without a clear noun.
- Put every list item and every numbered milestone on its own line. Never combine two milestones into one line.
- Keep the GOAL field to one sentence only. Recover the real project action from conversational phrasing, but never use first-person filler such as “I also want to make sure” as the project object. Never append SUCCESS or any other section label to the goal.
- Success criteria must fit the actual deliverable. Do not say a physical or creative artifact “can be used successfully” unless usability is genuinely the goal.
- Prefer concrete project language over generic facet labels such as "existing information, assets, and gaps," "operating design," "first-phase resources," or "real conditions" when the project provides more specific nouns.
- Prefer everyday project language. Do not expose internal planning vocabulary unless the user already uses it or it is necessary to understand the work.
- START must be one direct, human sentence that names the real action. Do not expose internal phrases such as “what it must prove,” “requirements brief,” “dependency,” or “irreversible commitments.”
- Do not invent facts or completed work.
- Keep the full response concise enough to fit the available fields.
         `.trim(),
      });

      if (!response.ok || response.usedFallback) {
         return localGuide;
      }

      const model = parseModelSections(response.focus || response.summary || "", response.usefulContext || "", response.nextStep || "");

      return makeGuideUserFriendly(mergeModelWithLocal(localGuide, model, safeInput.title, safeInput.description), safeInput.title, safeInput.description);
   } catch {
      return localGuide;
   }
}

function renderItems(items: string[], fallback: string, limit = 4) {
   const cleanItems = items
      .map((item) => stripListMarker(item).replace(/[.!?]+$/, "").trim())
      .filter(Boolean)
      .slice(0, limit);

   return cleanItems.length ? cleanItems.map((item) => `- ${item}`).join("\n") : fallback;
}

function renderQuestionItems(items: string[], fallback: string, limit = 3) {
   const cleanItems = items
      .map(ensureReadableQuestion)
      .filter(Boolean)
      .slice(0, limit)
      .map((item) => `- ${item.replace(/[.!?]+$/, "")}?`);

   return cleanItems.length ? cleanItems.join("\n") : fallback;
}

function cleanMilestoneForDisplay(value: string) {
   const clean = stripListMarker(value)
      .replace(/^(?:milestone|phase|step)\s*\d*\s*[:.-]?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();

   if (!clean) return "";
   return clean.charAt(0).toLowerCase() + clean.slice(1).replace(/[.!?]+$/, "");
}

export function renderProjectDraftGuide(guide: ProjectDraftGuide) {
   const milestones = guide.milestones
      .map(cleanMilestoneForDisplay)
      .filter(Boolean)
      .slice(0, 8);

   const decisions = guide.openQuestions
      .map(ensureReadableQuestion)
      .filter(Boolean)
      .slice(0, 3);

   const keepInMind = guide.constraints
      .map((item) => stripListMarker(item).replace(/[.!?]+$/, "").trim())
      .filter(Boolean)
      .slice(0, 3);

   const optionalSections = [
      decisions.length ? `Things to Decide:\n${renderQuestionItems(decisions, "", 3)}` : "",
      keepInMind.length ? `Keep in Mind:\n${renderItems(keepInMind, "", 3)}` : "",
   ].filter(Boolean);

   return cleanText(`What You're Building:
${guide.goal}

What Good Looks Like:
${renderItems(guide.successCriteria, "- The finished result does what you set out to accomplish", 4)}

Milestones:
${milestones.map((milestone, index) => `${index + 1}. ${milestone}`).join("\n")}

Start Here:
${guide.recommendedStartingPoint}${optionalSections.length ? `\n\n${optionalSections.join("\n\n")}` : ""}`);
}
