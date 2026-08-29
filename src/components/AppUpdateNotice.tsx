"use client";

import { useEffect, useState } from "react";

import { ALLEVIN_BUILD } from "@/lib/allevinBuild";

export default function AppUpdateNotice() {
   const [updateReady, setUpdateReady] = useState(false);

   useEffect(() => {
      let cancelled = false;
      const check = async () => {
         try {
            const response = await fetch(`/api/allevin/llm?status=1&client=${encodeURIComponent(ALLEVIN_BUILD.languageProtocol)}`, {
               cache: "no-store",
               headers: { "Cache-Control": "no-cache" },
            });
            if (!response.ok) return;
            const status = await response.json() as { build?: string; protocol?: string };
            if (!cancelled && (status.build !== ALLEVIN_BUILD.version || status.protocol !== ALLEVIN_BUILD.languageProtocol)) {
               setUpdateReady(true);
            }
         } catch {
            // Update awareness stays quiet when the network is unavailable.
         }
      };
      void check();
      const onVisible = () => {
         if (document.visibilityState === "visible") void check();
      };
      document.addEventListener("visibilitychange", onVisible);
      return () => {
         cancelled = true;
         document.removeEventListener("visibilitychange", onVisible);
      };
   }, []);

   if (!updateReady) return null;
   return (
      <div className="app-update-notice" role="status">
         <span>An ALLEVIN update is ready.</span>
         <button type="button" onClick={() => window.location.reload()}>Refresh</button>
      </div>
   );
}
