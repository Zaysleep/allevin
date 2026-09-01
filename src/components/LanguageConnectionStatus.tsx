"use client";

import { useEffect, useState } from "react";

import { ALLEVIN_BUILD } from "@/lib/allevinBuild";
import { readLatestLanguageDiagnostic } from "@/lib/allevinLLMClient";

type LanguageStatus = {
   build?: string;
   protocol?: string;
   configured?: boolean;
   providerReady?: boolean;
   providerReason?: string;
};

type ConnectionState = "checking" | "ready" | "update" | "configuration" | "provider" | "recent-failure" | "unavailable";

/**
 * This is deliberately tucked into Settings. It gives a production tester a
 * truthful answer without exposing a key, model name, provider payload, or
 * technical dashboard to an ordinary user.
 */
export default function LanguageConnectionStatus() {
   const [state, setState] = useState<ConnectionState>("checking");

   async function check() {
      setState("checking");
      try {
         const response = await fetch(`/api/allevin/llm?status=1&client=${encodeURIComponent(ALLEVIN_BUILD.languageProtocol)}`, {
            method: "GET",
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" },
         });
         if (!response.ok) {
            setState("unavailable");
            return;
         }
         const status = await response.json() as LanguageStatus;
         if (status.protocol !== ALLEVIN_BUILD.languageProtocol || status.build !== ALLEVIN_BUILD.version) {
            setState("update");
         } else if (!status.configured) {
            setState("configuration");
         } else if (!status.providerReady) {
            setState("provider");
         } else {
            const latest = readLatestLanguageDiagnostic();
            const recentFailure = latest && Date.now() - latest.at < 15 * 60 * 1000 && (latest.source === "provider" || latest.source === "network");
            setState(recentFailure ? "recent-failure" : "ready");
         }
      } catch {
         setState("unavailable");
      }
   }

   useEffect(() => {
      const timer = window.setTimeout(() => void check(), 0);
      return () => window.clearTimeout(timer);
   }, []);

   const message = state === "ready"
      ? "Personal language is connected."
      : state === "update"
         ? "This app and the deployed assistant are on different versions."
         : state === "configuration"
            ? "The deployed assistant is missing its language connection."
            : state === "provider"
               ? "Personal language is configured, but the provider or selected model could not be reached."
               : state === "recent-failure"
                  ? "Personal language is connected, but the last provider request did not complete."
            : state === "unavailable"
               ? "The deployed assistant could not be reached."
               : "Checking personal language…";

   return (
      <section className="settings-language-status" aria-live="polite">
         <div>
            <strong>Personal language</strong>
            <span>{message}</span>
            <small>{ALLEVIN_BUILD.mark}</small>
         </div>
         {state !== "ready" && state !== "checking" ? (
            <button type="button" onClick={state === "update" ? () => window.location.reload() : () => void check()}>
               {state === "update" ? "Refresh" : "Check again"}
            </button>
         ) : null}
      </section>
   );
}
