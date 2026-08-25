import { NextResponse } from "next/server";

interface UpNextPayload {
   subject: string;
   category: string;
   minutes: number;
   timingLabel: string;
   recommendationTitle: string;
   recommendationDetail: string;
   focus?: string;
   voiceStyle: "direct" | "balanced" | "calm";
}

function clean(value: unknown, limit: number) {
   return String(value ?? "")
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit);
}

function sanitize(raw: unknown): UpNextPayload | null {
   if (!raw || typeof raw !== "object") return null;
   const value = raw as Record<string, unknown>;
   const subject = clean(value.subject, 160);
   const recommendationTitle = clean(value.recommendationTitle, 220);
   const recommendationDetail = clean(value.recommendationDetail, 500);
   if (!subject || !recommendationTitle || !recommendationDetail) return null;

   return {
      subject,
      category: clean(value.category, 80) || "general",
      minutes: Number.isFinite(Number(value.minutes)) ? Math.max(5, Math.min(720, Math.round(Number(value.minutes)))) : 30,
      timingLabel: clean(value.timingLabel, 120),
      recommendationTitle,
      recommendationDetail,
      focus: clean(value.focus, 120) || undefined,
      voiceStyle: value.voiceStyle === "balanced" || value.voiceStyle === "calm" ? value.voiceStyle : "direct",
   };
}

function parseJson(content: string) {
   try {
      return JSON.parse(content);
   } catch {
      const object = content.match(/\{[\s\S]*\}/)?.[0];
      return object ? JSON.parse(object) : {};
   }
}

export async function POST(request: Request) {
   let payload: UpNextPayload | null = null;
   try {
      payload = sanitize(await request.json());
   } catch {
      payload = null;
   }

   if (!payload) {
      return NextResponse.json({ title: "", detail: "" }, { status: 400 });
   }

   const apiKey = process.env.OPENAI_API_KEY;
   const model = process.env.ALLEVIN_LLM_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
   if (!apiKey) return NextResponse.json({ title: "", detail: "" });

   const voice =
      payload.voiceStyle === "direct"
         ? "Sharp, dry, street-smart, caring underneath it. A little rebellious edge is welcome; one light jab at most. Never imitate or quote a fictional character."
         : payload.voiceStyle === "calm"
           ? "Steady, low-pressure, concise, and practical."
           : "Natural, concise, practical, with a little personality.";

   try {
      const provider = await fetch("https://api.openai.com/v1/chat/completions", {
         method: "POST",
         headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
         },
         body: JSON.stringify({
            model,
            temperature: 0.45,
            max_tokens: 220,
            response_format: { type: "json_object" },
            messages: [
               {
                  role: "system",
                  content: `You write the two-line guidance card shown beside one concrete Up Next item in ALLEVIN.

Return ONLY JSON:
{"title":"short headline","detail":"one or two short sentences"}

Rules:
- The SUBJECT is authoritative. Every line must clearly belong to that exact next activity, not to a generic transition or productivity concept.
- The ASSIGNED RECOMMENDATION is authoritative. Preserve its underlying lane/focus; you may rephrase it, never replace it with a different recommendation.
- The title should usually be 3–8 words and should name the subject or make the subject unmistakable.
- The detail should be directly useful for the subject and available time. Prefer one clear action or framing.
- Never invent equipment, location, dietary restrictions, medical claims, urgency, or user-specific facts that were not supplied.
- Avoid generic filler such as “protect the next transition”, “prepare for the next commitment”, “stay on track”, “you've got this”, or dashboard/state-machine language.
- Do not mention that you are an AI, a recommendation engine, or that an assignment is stored.
- Voice: ${voice}
- Keep the whole card compact. This sits in a phone-sized Up Next surface.`,
               },
               {
                  role: "user",
                  content: `SUBJECT: ${payload.subject}
CATEGORY: ${payload.category}
AVAILABLE TIME: about ${payload.minutes} minutes
TIMING: ${payload.timingLabel || "up next"}
ASSIGNED RECOMMENDATION TITLE: ${payload.recommendationTitle}
ASSIGNED RECOMMENDATION DETAIL: ${payload.recommendationDetail}
ASSIGNED FOCUS: ${payload.focus || "none"}`,
               },
            ],
         }),
      });

      if (!provider.ok) {
         await provider.text();
         return NextResponse.json({ title: "", detail: "" });
      }

      const data = await provider.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) return NextResponse.json({ title: "", detail: "" });

      const parsed = parseJson(content) as Record<string, unknown>;
      return NextResponse.json({
         title: clean(parsed.title, 120),
         detail: clean(parsed.detail, 420),
      });
   } catch {
      return NextResponse.json({ title: "", detail: "" });
   }
}
