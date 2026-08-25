"use client";

import { useEffect, useMemo, useState } from "react";

function timezoneLabel(now: Date) {
   try {
      const parts = new Intl.DateTimeFormat([], { timeZoneName: "short" }).formatToParts(now);
      return parts.find((part) => part.type === "timeZoneName")?.value || Intl.DateTimeFormat().resolvedOptions().timeZone;
   } catch {
      return "Local";
   }
}

export default function LiveClock() {
   const [now, setNow] = useState<Date | null>(null);

   useEffect(() => {
      const update = () => setNow(new Date());
      update();
      const timer = window.setInterval(update, 1_000);
      return () => window.clearInterval(timer);
   }, []);

   const label = useMemo(() => (now ? timezoneLabel(now) : ""), [now]);

   if (!now) return <div className="live-clock live-clock-loading" aria-hidden="true">--:--</div>;

   return (
      <div className="live-clock" aria-label={`Local time ${now.toLocaleTimeString()}`}>
         <span className="live-clock-date">{now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
         <div className="live-clock-time-group">
            <strong>{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</strong>
            <i>{label}</i>
         </div>
      </div>
   );
}
