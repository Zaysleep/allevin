// ========================================
// ALLEVIN MK X Material Grounding
// Purpose:
// Select only the project materials that meaningfully answer the current
// question, preserve the boundary between source facts and ALLEVIN's
// interpretation, and surface conflicts without pretending they are settled.
// ========================================

import type { AllevinAIDockMaterialFactContext, AllevinAIDockMaterialGroundingPacket, AllevinAIDockMaterialInputContext, AllevinAIDockMaterialSelectionContext } from "@/lib/allevinLLMTypes";

export interface BuildAIDockMaterialGroundingInput {
   prompt: string;
   projectTitle?: string;
   currentTopic?: string;
   activeMilestoneTitle?: string;
   activeMilestoneGoal?: string;
   recommendation?: string;
   materials: AllevinAIDockMaterialInputContext[];
   selectedMaterialIds?: string[];
   selectedMaterialTitles?: string[];
   limit?: number;
}

const GROUNDING_STOP_WORDS = new Set([
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
   "document",
   "documents",
   "from",
   "have",
   "into",
   "material",
   "materials",
   "more",
   "project",
   "reference",
   "references",
   "should",
   "that",
   "their",
   "there",
   "these",
   "they",
   "this",
   "those",
   "through",
   "using",
   "what",
   "when",
   "where",
   "which",
   "with",
   "would",
]);

const MONTH_WORDS = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]);

function cleanText(value?: string, limit = 12000) {
   const clean = (value || "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, "")
      .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, "")
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/data\s*:\s*text\/html/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\u2028|\u2029/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

   return clean.length > limit ? clean.slice(0, limit).trim() : clean;
}

function normalizeKey(value?: string) {
   return cleanText(value, 4000)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
}

function tokens(value?: string) {
   return normalizeKey(value)
      .split(" ")
      .filter((token) => token.length >= 3 && !GROUNDING_STOP_WORDS.has(token));
}

function uniqueStrings(values: Array<string | undefined>, limit = 12) {
   const seen = new Set<string>();
   const result: string[] = [];

   for (const value of values) {
      const clean = cleanText(value, 1800);
      const key = normalizeKey(clean);
      if (!clean || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(clean);
      if (result.length >= limit) break;
   }

   return result;
}

function tokenOverlap(left?: string, right?: string) {
   const leftTokens = new Set(tokens(left));
   const rightTokens = new Set(tokens(right));
   if (!leftTokens.size || !rightTokens.size) return { count: 0, ratio: 0, shared: [] as string[] };

   const shared = [...leftTokens].filter((token) => rightTokens.has(token));
   return {
      count: shared.length,
      ratio: shared.length / Math.min(leftTokens.size, rightTokens.size),
      shared,
   };
}

function splitSentences(value?: string) {
   const clean = cleanText(value, 16000);
   if (!clean) return [] as string[];

   return uniqueStrings(
      clean
         .split(/\n+|(?<=[.!?])\s+/)
         .map((item) => item.replace(/^[-*•\d.)\s]+/, "").trim())
         .filter((item) => item.length >= 18),
      40,
   );
}

function looksLikeMaterialMetadataSentence(value?: string) {
   const clean = cleanText(value, 1200);
   return (
      /^(?:working|internal|external|supporting|reference|strategy|planning|research|product|brand)?\s*(?:strategy|reference|planning|research|product|brand)?\s*(?:document|brief|reference|note|file)\s+(?:for|about|covering|that covers|focused on)\b/i.test(
         clean,
      ) ||
      /^(?:this|the)\s+(?:document|brief|reference|note|file)\s+(?:covers|contains|includes|summarizes|describes)\b/i.test(clean) ||
      /^use\s+(?:this|the)\s+(?:document|brief|reference|note|file)\s+to\b/i.test(clean) ||
      /^(?:document|brief|reference|note|file)\s+(?:purpose|overview|summary)\s*:/i.test(clean)
   );
}

function getMaterialDirectText(material: AllevinAIDockMaterialInputContext) {
   // Full readable source text outranks summaries and metadata. Summaries are
   // useful only when the original document text is unavailable.
   const documentText = cleanText(material.documentText, 16000);
   if (documentText) return documentText;

   return cleanText([material.notes, material.summary].filter(Boolean).join(" "), 16000);
}

function getMaterialInterpretationText(material: AllevinAIDockMaterialInputContext) {
   return cleanText([material.interpretationSummary, material.interpretationUsefulContext].filter(Boolean).join(" "), 5000);
}

function getMaterialSearchText(material: AllevinAIDockMaterialInputContext) {
   return cleanText(
      [material.title, material.type, material.source, material.summary, material.notes, material.documentText, material.interpretationSummary, material.interpretationUsefulContext, material.interpretationNextStep].filter(Boolean).join(" "),
      24000,
   );
}

function materialQuestion(prompt?: string) {
   return /\b(?:material|materials|document|documents|reference|references|source|sources|notes?|feedback|research|file|files|uploaded|attachment|attachments|screenshot|screenshots)\b/i.test(cleanText(prompt, 3000));
}

function scoreMaterial(input: BuildAIDockMaterialGroundingInput, material: AllevinAIDockMaterialInputContext) {
   const selectedIds = new Set((input.selectedMaterialIds || []).map((value) => cleanText(value, 180)));
   const selectedTitles = new Set((input.selectedMaterialTitles || []).map((value) => normalizeKey(value)));
   const materialTitleKey = normalizeKey(material.title);
   const promptKey = normalizeKey(input.prompt);
   const explicitSelection = selectedIds.has(cleanText(material.id, 180)) || selectedTitles.has(materialTitleKey);
   const titleMention = Boolean(materialTitleKey && promptKey.includes(materialTitleKey));
   const searchText = getMaterialSearchText(material);
   const queryContext = [input.prompt, input.currentTopic].filter(Boolean).join(" ");
   const milestoneContext = [input.activeMilestoneTitle, input.activeMilestoneGoal].filter(Boolean).join(" ");
   const recommendationContext = input.recommendation || "";

   const queryOverlap = tokenOverlap(queryContext, searchText);
   const milestoneOverlap = tokenOverlap(milestoneContext, searchText);
   const recommendationOverlap = tokenOverlap(recommendationContext, searchText);

   let score = 0;
   const reasons: string[] = [];

   if (explicitSelection) {
      score += 90;
      reasons.push("selected by the user");
   }

   if (titleMention) {
      score += 100;
      reasons.push("named in the question");
   }

   if (queryOverlap.count) {
      score += Math.min(36, queryOverlap.count * 7 + Math.round(queryOverlap.ratio * 18));
      reasons.push("matches the current question");
   }

   if (milestoneOverlap.count) {
      score += Math.min(24, milestoneOverlap.count * 5 + Math.round(milestoneOverlap.ratio * 10));
      reasons.push("supports the active milestone");
   }

   if (recommendationOverlap.count) {
      score += Math.min(18, recommendationOverlap.count * 4 + Math.round(recommendationOverlap.ratio * 8));
      reasons.push("supports the current recommendation");
   }

   if (getMaterialInterpretationText(material)) {
      score += 4;
   }

   if (material.updatedAt && Number.isFinite(material.updatedAt)) {
      const ageDays = Math.max(0, (Date.now() - material.updatedAt) / 86_400_000);
      if (ageDays <= 30) score += 3;
      else if (ageDays <= 120) score += 1;
   }

   return {
      score,
      reasons: uniqueStrings(reasons, 5),
      explicitSelection,
      titleMention,
      queryOverlap,
      milestoneOverlap,
      recommendationOverlap,
   };
}

function chooseFactSentence(material: AllevinAIDockMaterialInputContext, context: string) {
   const rawDirectSentences = splitSentences(getMaterialDirectText(material));
   const substantiveDirectSentences = rawDirectSentences.filter((sentence) => !looksLikeMaterialMetadataSentence(sentence));
   const directSentences = substantiveDirectSentences.length ? substantiveDirectSentences : rawDirectSentences;
   const interpretedSentences = splitSentences(getMaterialInterpretationText(material)).filter((sentence) => !looksLikeMaterialMetadataSentence(sentence));

   const rank = (sentence: string) => {
      const overlap = tokenOverlap(context, sentence);
      const specificity = tokens(sentence).filter((token) => token.length >= 6).length;
      const metadataPenalty = looksLikeMaterialMetadataSentence(sentence) ? 30 : 0;
      const decisionCriterionBonus =
         /\b(?:specific enough|broad enough|guide(?:s|d|ing)?\s+(?:future\s+)?(?:product\s+)?decisions?|test each|reject any|criteria|criterion|filter for future|must fit|should fit|only fits one|without becoming vague)\b/i.test(sentence) ? 24 : 0;
      const sourceRequirementBonus = /\b(?:must|should|needs? to|required|requirement|confirmed direction|current milestone use)\b/i.test(sentence) ? 6 : 0;
      return overlap.count * 10 + overlap.ratio * 12 + Math.min(sentence.length / 180, 2) + Math.min(specificity, 8) + decisionCriterionBonus + sourceRequirementBonus - metadataPenalty;
   };

   const rankedDirect = [...directSentences].sort((left, right) => rank(right) - rank(left));
   const bestDirect = rankedDirect[0];
   if (bestDirect) {
      const supportingDirect = rankedDirect.find((sentence, index) => index > 0 && tokenOverlap(bestDirect, sentence).ratio < 0.72);
      const statement = uniqueStrings([bestDirect, supportingDirect || ""], 2).join(" ");
      return {
         statement: cleanText(statement, 1200),
         kind: "material-fact" as const,
         confidence: 90,
      };
   }

   const bestInterpretation = [...interpretedSentences].sort((left, right) => rank(right) - rank(left))[0];
   if (bestInterpretation) {
      return {
         statement: cleanText(bestInterpretation, 1000),
         kind: "interpretation" as const,
         confidence: 70,
      };
   }

   return null;
}

function getPolarity(value?: string) {
   return /\b(?:no|not|never|cannot|can't|must not|should not|does not|doesn't|did not|didn't|isn't|aren't|won't|prohibited|not allowed|no longer)\b/i.test(cleanText(value, 1600)) ? "negative" : "positive";
}

function getNumericOrDateTokens(value?: string) {
   const values = normalizeKey(value).split(" ");
   return values.filter((token) => /^\d+(?:\.\d+)?$/.test(token) || /^\d{4}$/.test(token) || MONTH_WORDS.has(token));
}

function buildContradictions(facts: AllevinAIDockMaterialFactContext[]) {
   const contradictions: AllevinAIDockMaterialGroundingPacket["contradictions"] = [];

   for (let leftIndex = 0; leftIndex < facts.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < facts.length; rightIndex += 1) {
         const left = facts[leftIndex];
         const right = facts[rightIndex];
         if (left.sourceId === right.sourceId) continue;

         const overlap = tokenOverlap(left.statement, right.statement);
         if (overlap.count < 2 || overlap.ratio < 0.28) continue;

         const polarityConflict = getPolarity(left.statement) !== getPolarity(right.statement);
         const leftNumbers = getNumericOrDateTokens(left.statement);
         const rightNumbers = getNumericOrDateTokens(right.statement);
         const numericConflict = leftNumbers.length > 0 && rightNumbers.length > 0 && (leftNumbers.some((token) => !rightNumbers.includes(token)) || rightNumbers.some((token) => !leftNumbers.includes(token)));

         if (!polarityConflict && !numericConflict) continue;

         contradictions.push({
            topic: overlap.shared.slice(0, 4).join(" ") || "the same project detail",
            firstSourceTitle: left.sourceTitle,
            firstStatement: left.statement,
            secondSourceTitle: right.sourceTitle,
            secondStatement: right.statement,
            guidance: "Confirm which source is current before treating this detail as settled.",
         });

         if (contradictions.length >= 4) return contradictions;
      }
   }

   return contradictions;
}

function getSelectionThreshold(input: BuildAIDockMaterialGroundingInput) {
   return materialQuestion(input.prompt) ? 8 : 14;
}

export function buildAIDockMaterialGrounding(input: BuildAIDockMaterialGroundingInput): AllevinAIDockMaterialGroundingPacket {
   const configuredLimit = Math.max(1, Math.min(4, input.limit || 3));
   const singularImpactRequest = looksLikeMaterialImpactPrompt(input.prompt) && !/\b(?:materials|documents|references|files|notes|sources|both|compare)\b/i.test(cleanText(input.prompt, 3000));
   const limit = singularImpactRequest ? 1 : configuredLimit;
   const context = [input.prompt, input.currentTopic, input.activeMilestoneTitle, input.activeMilestoneGoal, input.recommendation].filter(Boolean).join(" ");
   const threshold = getSelectionThreshold(input);

   const ranked = (input.materials || []).map((material) => ({ material, ...scoreMaterial(input, material) })).sort((left, right) => right.score - left.score || Number(right.material.updatedAt || 0) - Number(left.material.updatedAt || 0));

   let relevant = ranked
      .filter((item) => {
         const selectedAndRelevant = item.explicitSelection && (materialQuestion(input.prompt) || item.queryOverlap.count > 0 || item.milestoneOverlap.count > 0 || item.recommendationOverlap.count > 0);

         return item.titleMention || selectedAndRelevant || (!item.explicitSelection && item.score >= threshold);
      })
      .slice(0, limit);

   if (!relevant.length && materialQuestion(input.prompt) && ranked.length) {
      relevant = ranked.slice(0, Math.min(2, limit));
   }

   const selections: AllevinAIDockMaterialSelectionContext[] = [];
   const facts: AllevinAIDockMaterialFactContext[] = [];
   const uncertainty: string[] = [];

   for (const item of relevant) {
      const fact = chooseFactSentence(item.material, context);
      const interpretation = cleanText(getMaterialInterpretationText(item.material), 900);
      const nextStep = cleanText(item.material.interpretationNextStep, 700);

      selections.push({
         id: cleanText(item.material.id, 180),
         title: cleanText(item.material.title || "Untitled material", 180),
         type: cleanText(item.material.type || "Reference", 80),
         relevanceScore: Math.max(0, Math.round(item.score)),
         relevanceReasons: item.reasons,
         fact: fact?.statement || "",
         interpretation,
         nextStep,
      });

      if (fact) {
         facts.push({
            sourceId: cleanText(item.material.id, 180),
            sourceTitle: cleanText(item.material.title || "Untitled material", 180),
            kind: fact.kind,
            statement: fact.statement,
            confidence: fact.confidence,
         });
      } else {
         uncertainty.push(`${cleanText(item.material.title || "This material", 180)} has metadata but no readable source text or saved interpretation for this question.`);
      }

      if (!getMaterialDirectText(item.material) && interpretation) {
         uncertainty.push(`${cleanText(item.material.title || "This material", 180)} is represented by a saved ALLEVIN interpretation rather than quoted source text.`);
      }
   }

   const contradictions = buildContradictions(facts);
   if (contradictions.length) {
      uncertainty.push("At least two relevant materials may disagree. Confirm which source is current before making the affected decision.");
   }

   const usedTitles = selections.map((item) => item.title).filter(Boolean);
   const hasRelevantMaterials = usedTitles.length > 0;

   return {
      version: "MK X",
      projectTitle: cleanText(input.projectTitle, 180),
      query: cleanText(input.prompt, 3000),
      activeMilestoneTitle: cleanText(input.activeMilestoneTitle, 220),
      hasRelevantMaterials,
      selectedMaterials: selections,
      facts,
      contradictions,
      uncertainty: uniqueStrings(uncertainty, 8),
      usedTitles,
      usedLine: hasRelevantMaterials ? `Used: ${usedTitles.join(" · ")}` : "",
      confidence: hasRelevantMaterials ? Math.max(45, Math.min(96, Math.round(relevant.reduce((sum, item) => sum + item.score, 0) / relevant.length))) : 0,
   };
}

function responseAlreadyUsesGrounding(value: string, grounding: AllevinAIDockMaterialGroundingPacket) {
   const responseKey = normalizeKey(value);

   if (
      (grounding.usedTitles || []).some((title) => {
         const titleKey = normalizeKey(title);
         return titleKey.length >= 4 && responseKey.includes(titleKey);
      })
   ) {
      return true;
   }

   return (grounding.facts || []).some((fact) => {
      const overlap = tokenOverlap(value, fact.statement);
      return overlap.count >= 3 || overlap.ratio >= 0.45;
   });
}

function buildMaterialGroundingReadback(grounding: AllevinAIDockMaterialGroundingPacket, mode: "balanced" | "focused" | "creative") {
   const conflict = grounding.contradictions?.[0];

   if (conflict) {
      const first = cleanText(conflict.firstStatement, mode === "focused" ? 280 : 520);
      const second = cleanText(conflict.secondStatement, mode === "focused" ? 280 : 520);

      if (mode === "focused") {
         return `${conflict.firstSourceTitle} and ${conflict.secondSourceTitle} disagree on this point. Confirm which source is current before deciding.`;
      }

      return `${conflict.firstSourceTitle} says ${first} ${conflict.secondSourceTitle} says ${second} ${conflict.guidance}`;
   }

   const facts = (grounding.facts || []).slice(0, mode === "focused" ? 1 : 2);
   if (!facts.length) return "";

   return facts
      .map((fact) => {
         const statement = cleanText(fact.statement, mode === "focused" ? 360 : 620);
         return fact.kind === "interpretation" ? `ALLEVIN’s read of ${fact.sourceTitle}: ${statement}` : `Based on ${fact.sourceTitle}: ${statement}`;
      })
      .join(mode === "focused" ? " " : "\n\n");
}

export interface BuildAIDockMaterialQuestionResponseInput {
   prompt: string;
   grounding: AllevinAIDockMaterialGroundingPacket;
   activeMilestoneTitle?: string;
   recommendation?: string;
   mode?: "balanced" | "focused" | "creative";
}

function getFirstGroundingSentence(value?: string, limit = 520) {
   const clean = cleanText(value, 1800);
   if (!clean) return "";
   const first = clean.match(/^(.+?[.!?])(?:\s|$)/)?.[1] || clean;
   return cleanText(first, limit);
}

function getSelectionEvidence(selection?: AllevinAIDockMaterialSelectionContext, limit = 620) {
   if (!selection) return "";
   return getFirstGroundingSentence(selection.fact || selection.interpretation || selection.nextStep, limit);
}

type MaterialSemanticThemeId =
   | "identity-language"
   | "parts-relationship"
   | "decision-standard"
   | "scope-coverage"
   | "distinct-roles"
   | "audience-outcome"
   | "evidence"
   | "structure"
   | "implementation"
   | "accessibility"
   | "safety-compliance"
   | "time-capacity"
   | "ownership-maintenance";

interface MaterialSemanticTheme {
   id: MaterialSemanticThemeId;
   pattern: RegExp;
}

const MATERIAL_SEMANTIC_THEMES: MaterialSemanticTheme[] = [
   { id: "identity-language", pattern: /\b(?:brand|identity|promise|positioning|message|language|tone|mission|vision|narrative)\b/i },
   { id: "parts-relationship", pattern: /\b(?:product family|ecosystem|parent brand|parent company|relationship|relationships|relate|belongs? together|unified|cohesive|connected|shared identity|umbrella|portfolio|major parts?)\b/i },
   { id: "decision-standard", pattern: /\b(?:guide|guides|guiding|decision|decisions|standard|standards|criteria|criterion|evaluate|evaluation|specific enough|broad enough|test against|measure|measured)\b/i },
   { id: "scope-coverage", pattern: /\b(?:across|every|all major|full scope|entire scope|multiple products?|multiple areas?|project work|sports|local discovery|product family|whole system)\b/i },
   { id: "distinct-roles", pattern: /\b(?:distinct|different role|individual identity|own identity|unique role|separate identity|without flattening|without making every|retain(?:s|ing)? .* identity)\b/i },
   { id: "audience-outcome", pattern: /\b(?:audience|user|users|customer|customers|participant|participants|human need|user outcome|people should|someone should understand|someone should do)\b/i },
   { id: "evidence", pattern: /\b(?:evidence|source|sources|research|verified|verification|fact|facts|supported by|documented)\b/i },
   { id: "structure", pattern: /\b(?:structure|hierarchy|information architecture|layout|website|page|navigation|organization|organize|editorial)\b/i },
   { id: "implementation", pattern: /\b(?:workflow|process|implementation|operating model|production|handoff|execution|launch checkpoint|build order|sequence)\b/i },
   { id: "accessibility", pattern: /\b(?:accessibility|wcag|keyboard navigation|keyboard access|screen reader|color contrast|focus state|visible focus|inclusive design|accessible interface|accessible controls?)\b/i },
   { id: "safety-compliance", pattern: /\b(?:safety|permission|approval|insurance|legal|policy|compliance|privacy|security|permit|rights)\b/i },
   { id: "time-capacity", pattern: /\b(?:deadline|target date|timeline|schedule|capacity|time available|duration|hours?|weeks?|months?)\b/i },
   { id: "ownership-maintenance", pattern: /\b(?:owner|ownership|responsibility|responsibilities|maintain|maintenance|ongoing management|damage repair|stewardship)\b/i },
];

function getSelectionMeaning(selection?: AllevinAIDockMaterialSelectionContext) {
   return cleanText([selection?.fact, selection?.interpretation, selection?.nextStep].filter(Boolean).join(" "), 5000);
}

function getSelectionThemes(selection?: AllevinAIDockMaterialSelectionContext) {
   const meaning = getSelectionMeaning(selection);
   return new Set(MATERIAL_SEMANTIC_THEMES.filter((theme) => theme.pattern.test(meaning)).map((theme) => theme.id));
}

function getCommonThemeIds(selections: AllevinAIDockMaterialSelectionContext[]) {
   if (!selections.length) return [] as MaterialSemanticThemeId[];
   const themeSets = selections.map((selection) => getSelectionThemes(selection));
   const [first, ...rest] = themeSets;
   return [...first].filter((theme) => rest.every((set) => set.has(theme)));
}

function getUnionThemeIds(selections: AllevinAIDockMaterialSelectionContext[]) {
   const result = new Set<MaterialSemanticThemeId>();
   selections.forEach((selection) => getSelectionThemes(selection).forEach((theme) => result.add(theme)));
   return [...result];
}

function getReadableMilestoneSubject(value?: string) {
   const clean = cleanText(value, 500)
      .replace(/[.!?]+$/, "")
      .replace(/^(?:finalize|define|clarify|decide|complete|establish|create|draft|write|build|prepare|confirm|select|choose)\s+/i, "")
      .trim();
   return clean || "the current milestone";
}

function buildSemanticAgreement(selections: AllevinAIDockMaterialSelectionContext[], milestone: string) {
   const common = new Set(getCommonThemeIds(selections));
   const union = new Set(getUnionThemeIds(selections));
   const subject = getReadableMilestoneSubject(milestone);

   if (common.has("identity-language") && union.has("parts-relationship")) {
      return `Both materials agree that ${subject} needs one clear identity that connects the project’s major parts.`;
   }

   if (common.has("parts-relationship")) {
      return "Both materials agree that the project’s major parts need a clear relationship rather than reading as unrelated pieces.";
   }

   if (common.has("decision-standard") && common.has("scope-coverage")) {
      return `Both materials agree that ${subject} must be specific enough to guide decisions and broad enough to fit the full scope.`;
   }

   if (common.has("decision-standard")) {
      return `Both materials agree that ${subject} needs to become a usable standard for the decisions that follow.`;
   }

   if (common.has("audience-outcome")) {
      return `Both materials agree that ${subject} should be judged by the outcome it creates for the people the project serves.`;
   }

   if (common.has("accessibility")) {
      return `Both materials agree that accessibility is part of the quality standard for ${subject}, not a later add-on.`;
   }

   if (common.has("safety-compliance")) {
      return `Both materials agree that confirmed safety, permission, or compliance requirements must shape ${subject}.`;
   }

   if (common.has("evidence")) {
      return `Both materials agree that ${subject} should be based on verified evidence rather than an unsupported assumption.`;
   }

   if (common.has("structure")) {
      return `Both materials agree that ${subject} needs a clear structure before later work is finalized.`;
   }

   if (common.has("implementation")) {
      return `Both materials agree that ${subject} needs an operating approach that can be carried into the work that follows.`;
   }

   if (union.has("identity-language") && union.has("decision-standard")) {
      return `Both materials contribute to the same conclusion: ${subject} needs to be clear enough to guide the work that follows.`;
   }

   if (union.has("parts-relationship") && union.has("scope-coverage")) {
      return `Both materials point toward one shared requirement: ${subject} must make sense across the project’s major parts.`;
   }

   return `Both materials support the same milestone from complementary angles: one clarifies what ${subject} must communicate, and the other clarifies the standard it must meet.`;
}

function getContributionRoleFromThemes(themes: Set<MaterialSemanticThemeId>) {
   if (themes.has("decision-standard") && themes.has("scope-coverage")) return "defines the standard the result must meet";
   if (themes.has("parts-relationship")) return "focuses on how the project’s major parts should relate";
   if (themes.has("distinct-roles")) return "protects the distinct role of each major part";
   if (themes.has("audience-outcome")) return "clarifies the human outcome the result must create";
   if (themes.has("evidence")) return "sets the evidence the decision must rely on";
   if (themes.has("accessibility")) return "defines the accessibility standard the result must satisfy";
   if (themes.has("ownership-maintenance")) return "clarifies who owns and maintains the result";
   if (themes.has("time-capacity")) return "sets the timing or capacity boundary";
   if (themes.has("structure")) return "focuses on how the result should be organized or presented";
   if (themes.has("implementation")) return "turns the direction into an operating approach";
   if (themes.has("safety-compliance")) return "defines the safety, permission, or compliance boundary";
   if (themes.has("scope-coverage")) return "defines how broadly the result must remain true";
   if (themes.has("decision-standard")) return "defines the decision standard the result must meet";
   if (themes.has("identity-language")) return "clarifies what the final language must communicate";
   return "adds a separate requirement to the same milestone";
}

function getSelectionContributionRole(selection: AllevinAIDockMaterialSelectionContext, sharedThemes: Set<MaterialSemanticThemeId>) {
   const themes = getSelectionThemes(selection);
   const uniqueThemes = new Set([...themes].filter((theme) => !sharedThemes.has(theme)));
   return getContributionRoleFromThemes(uniqueThemes.size ? uniqueThemes : themes);
}

function buildSemanticDifference(selections: AllevinAIDockMaterialSelectionContext[], mode: "balanced" | "focused" | "creative") {
   const sharedThemes = new Set(getCommonThemeIds(selections));
   return selections
      .map((selection) => {
         const evidence = getSelectionEvidence(selection, mode === "focused" ? 300 : 520) || "no concrete readable claim was available";
         return `${selection.title} ${getSelectionContributionRole(selection, sharedThemes)}: ${evidence}`;
      })
      .join(mode === "focused" ? " " : "\n\n");
}

function getComparisonDecisionCriteria(selections: AllevinAIDockMaterialSelectionContext[]) {
   const themes = new Set(getUnionThemeIds(selections));
   const criteria: string[] = [];

   if (themes.has("parts-relationship")) criteria.push("fails to explain how the major parts belong together");
   if (themes.has("distinct-roles")) criteria.push("erases the distinct role of a major part");
   if (themes.has("decision-standard")) criteria.push("is too vague to guide the decisions that follow");
   if (themes.has("scope-coverage")) criteria.push("only fits one part of the confirmed scope");
   if (themes.has("audience-outcome")) criteria.push("does not create the intended outcome for the people the project serves");
   if (themes.has("evidence")) criteria.push("cannot be supported by the available evidence");
   if (themes.has("accessibility")) criteria.push("does not meet the stated accessibility standard");
   if (themes.has("safety-compliance")) criteria.push("ignores a confirmed safety, permission, or compliance requirement");
   if (themes.has("structure")) criteria.push("does not support the required structure or hierarchy");
   if (themes.has("time-capacity")) criteria.push("cannot fit the confirmed timeline or capacity");
   if (themes.has("ownership-maintenance")) criteria.push("leaves ownership or ongoing maintenance unresolved");

   return uniqueStrings(criteria, 3);
}

function deriveMilestoneAction(milestone: string, recommendation?: string) {
   const savedRecommendation = cleanText(recommendation, 900)
      .replace(/[.!?]+$/, "")
      .trim();
   if (savedRecommendation) return savedRecommendation;

   const cleanMilestone = cleanText(milestone, 500)
      .replace(/[.!?]+$/, "")
      .trim();
   const object = cleanMilestone.replace(/^(?:finalize|define|clarify|decide|complete|establish|create|draft|write|build|prepare|confirm|select|choose)\s+/i, "").trim();

   if (/^(?:finalize|define|clarify|establish)\b/i.test(cleanMilestone)) {
      return `Draft two or three concrete versions of ${object || "the milestone result"}`;
   }

   if (/^(?:decide|choose|select|confirm)\b/i.test(cleanMilestone)) {
      return `Compare the supported options and record one decision for ${object || "the milestone"}`;
   }

   return `Create one concrete result that completes ${cleanMilestone || "the current milestone"}`;
}

function buildComparisonMilestoneAction(selections: AllevinAIDockMaterialSelectionContext[], milestone: string, recommendation?: string) {
   const action = deriveMilestoneAction(milestone, recommendation);
   const criteria = getComparisonDecisionCriteria(selections);
   const actionSentence = `${action.charAt(0).toUpperCase()}${action.slice(1)}.`;

   if (!criteria.length) {
      return `${actionSentence} Check the result against both source-specific requirements before treating the milestone as complete.`;
   }

   const lastCriterion = criteria[criteria.length - 1];
   const criterionText = criteria.length === 1 ? lastCriterion : `${criteria.slice(0, -1).join(", ")}, or ${lastCriterion}`;
   const noun = /^(?:draft|write|create|prepare|define|finalize)\b/i.test(action) ? "version" : "option";

   return `${actionSentence} Reject any ${noun} that ${criterionText}.`;
}

function looksLikeMaterialComparisonPrompt(prompt?: string) {
   const clean = cleanText(prompt, 3000);
   return /\b(?:compare|comparison|agree|agreement|differ|difference|different|both materials|between the materials|where do they differ)\b/i.test(clean);
}

function looksLikeMaterialImpactPrompt(prompt?: string) {
   const clean = cleanText(prompt, 3000);
   return (
      /\b(?:what did|how did|what has|how has)\b[\s\S]{0,90}\b(?:material|document|reference|file|note)\b[\s\S]{0,90}\b(?:change|changed|affect|affected|shape|shaped|add|added)\b/i.test(clean) ||
      /\b(?:change|changed|affect|affected|shape|shaped)\b[\s\S]{0,90}\b(?:current milestone|milestone)\b/i.test(clean)
   );
}

function looksLikeMostRelevantMaterialPrompt(prompt?: string) {
   return /\b(?:matters most|most relevant|most useful|strongest reference|which material|which document|which source)\b/i.test(cleanText(prompt, 3000));
}

function normalizeGroundingAction(value?: string) {
   const clean = cleanText(value, 900)
      .replace(/[.!?]+$/, "")
      .trim();
   if (!clean) return "";

   // Project-intake leftovers are not valid material implications. They can
   // otherwise crowd a document comparison with generic open questions.
   if (/\b(?:start with this unfinished part|primary audience|target date|outside deadline|what should someone understand|recommended starting point)\b/i.test(clean)) {
      return "";
   }

   return clean.charAt(0).toLowerCase() + clean.slice(1);
}

function lowerCaseSentenceLead(value?: string) {
   const clean = cleanText(value, 900).trim();
   if (!clean) return "";
   return clean.charAt(0).toLowerCase() + clean.slice(1);
}

/**
 * Build the factual answer that the conversational LLM may polish.
 * For material questions, this answer—not the generic milestone readback—is
 * the authoritative response. The server still validates every source claim
 * against the same grounding packet.
 */
export function buildAIDockMaterialQuestionGroundedResponse(input: BuildAIDockMaterialQuestionResponseInput) {
   const { grounding } = input;
   const mode = input.mode || "balanced";
   const selections = grounding.selectedMaterials || [];
   const milestone = cleanText(input.activeMilestoneTitle, 260) || "the current milestone";
   const recommendation = normalizeGroundingAction(input.recommendation);

   if (!grounding.hasRelevantMaterials || !selections.length) {
      return "I do not have a relevant project material for this question yet.";
   }

   if (looksLikeMaterialComparisonPrompt(input.prompt)) {
      if (selections.length < 2) {
         return `${selections[0].title} is relevant, but I need a second readable material before I can compare agreement and differences responsibly.`;
      }

      const compared = selections.slice(0, Math.min(3, selections.length));
      const conflict = grounding.contradictions?.[0];
      const agreement = buildSemanticAgreement(compared, milestone);
      const difference = conflict
         ? `${conflict.firstSourceTitle} and ${conflict.secondSourceTitle} disagree on ${conflict.topic || "a project detail"}. ${conflict.firstSourceTitle} says ${cleanText(conflict.firstStatement, 420)} ${conflict.secondSourceTitle} says ${cleanText(conflict.secondStatement, 420)} ${conflict.guidance}`
         : buildSemanticDifference(compared, mode);
      const milestoneUse = buildComparisonMilestoneAction(compared, milestone, recommendation);

      if (mode === "focused") {
         return `${agreement} ${difference} ${milestoneUse}`;
      }

      return `${agreement}

Where they differ: ${difference}

What the current milestone should use: ${milestoneUse}`;
   }

   if (looksLikeMaterialImpactPrompt(input.prompt)) {
      const primary = selections[0];
      const fact = getSelectionEvidence(primary, mode === "focused" ? 360 : 620);
      const implication = getFirstGroundingSentence(primary.nextStep || primary.interpretation, mode === "focused" ? 360 : 620);
      const next = lowerCaseSentenceLead(implication) || (recommendation ? `use it to ${recommendation}.` : "use it to make the milestone more specific before moving forward.");

      if (mode === "focused") {
         return `${primary.title} adds this evidence: ${fact || "the material is relevant to the milestone"} ${next}`;
      }

      return `${primary.title} does not replace ${milestone}; it makes the work more specific. The material adds this evidence: ${fact || "the source is relevant, but its readable text is limited."}\n\nFor the milestone, ${next}`;
   }

   if (looksLikeMostRelevantMaterialPrompt(input.prompt)) {
      const primary = selections[0];
      const evidence = getSelectionEvidence(primary, mode === "focused" ? 360 : 620);
      const implication = getFirstGroundingSentence(primary.nextStep || primary.interpretation, mode === "focused" ? 340 : 560);
      return `${primary.title} matters most for this question because ${evidence || "it has the closest connection to the active milestone"}${implication ? ` ${implication}` : ""}`;
   }

   const readback = buildMaterialGroundingReadback(grounding, mode);
   const milestoneUse = recommendation ? `For ${milestone}, use that evidence to ${recommendation}.` : "";
   return [readback, milestoneUse].filter(Boolean).join("\n\n");
}

export function appendAIDockMaterialGroundingLine(value?: string, grounding?: AllevinAIDockMaterialGroundingPacket, mode: "balanced" | "focused" | "creative" = "balanced") {
   const clean = cleanText(value, 7000);
   const usedLine = cleanText(grounding?.usedLine, 500);

   if (!clean || !usedLine || !grounding?.hasRelevantMaterials) {
      return clean;
   }

   const parts = [clean];
   const hasConflict = Boolean(grounding.contradictions?.length);
   const conflictAlreadyExplained =
      hasConflict &&
      /\b(?:conflict|contradict|disagree|difference|confirm|verify|which source is current)\b/i.test(clean) &&
      (grounding.contradictions || []).some((conflict) => {
         const firstTitle = normalizeKey(conflict.firstSourceTitle);
         const secondTitle = normalizeKey(conflict.secondSourceTitle);
         const responseKey = normalizeKey(clean);
         return Boolean(firstTitle && secondTitle && responseKey.includes(firstTitle) && responseKey.includes(secondTitle));
      });

   if ((hasConflict && !conflictAlreadyExplained) || (!hasConflict && !responseAlreadyUsesGrounding(clean, grounding))) {
      const readback = buildMaterialGroundingReadback(grounding, mode);
      if (readback) parts.push(readback);
   }

   if (!normalizeKey(parts.join("\n\n")).includes(normalizeKey(usedLine))) {
      parts.push(usedLine);
   }

   return parts.join("\n\n");
}
