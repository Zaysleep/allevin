export type BriefingSectionId = "today" | "weather" | "markets" | "sports" | "next";

export interface AllevinBriefingSection {
   id: BriefingSectionId;
   title: string;
   items: string[];
}

export interface AllevinMorningBriefing {
   headline: string;
   summary: string;
   sections: AllevinBriefingSection[];
   closing: string;
   observedAt: number;
}

const SECTION_IDS: BriefingSectionId[] = ["today", "weather", "markets", "sports", "next"];

function clean(value: unknown, limit: number) {
   return String(value ?? "")
      .replace(/[*#_`<>\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
}

export function sanitizeMorningBriefing(value: unknown, observedAt = Date.now()): AllevinMorningBriefing | null {
   if (!value || typeof value !== "object") return null;
   const raw = value as Partial<AllevinMorningBriefing>;
   const headline = clean(raw.headline, 90);
   const summary = clean(raw.summary, 240);
   const closing = clean(raw.closing, 180);
   const sections = Array.isArray(raw.sections)
      ? raw.sections.flatMap((section) => {
         if (!section || typeof section !== "object") return [];
         const candidate = section as Partial<AllevinBriefingSection>;
         if (!SECTION_IDS.includes(candidate.id as BriefingSectionId)) return [];
         const items = Array.isArray(candidate.items)
            ? candidate.items.map((item) => clean(item, 220)).filter(Boolean).slice(0, 6)
            : [];
         if (!items.length) return [];
         return [{
            id: candidate.id as BriefingSectionId,
            title: clean(candidate.title, 40) || String(candidate.id),
            items,
         }];
      }).slice(0, 5)
      : [];
   if (!headline || !summary || !sections.length) return null;
   return {
      headline,
      summary,
      sections,
      closing,
      observedAt: Number.isFinite(Number(raw.observedAt)) ? Number(raw.observedAt) : observedAt,
   };
}

export function briefingAsPlainText(briefing: AllevinMorningBriefing) {
   const sections = briefing.sections
      .map((section) => `${section.title.toUpperCase()}\n${section.items.map((item) => `• ${item}`).join("\n")}`)
      .join("\n\n");
   return [briefing.headline, briefing.summary, sections, briefing.closing].filter(Boolean).join("\n\n");
}
