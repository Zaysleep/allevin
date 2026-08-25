"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { enableAllevinNotifications, registerAllevinServiceWorker, runRhythmReminderCheck } from "@/lib/allevinNotifications";
import {
   buildTodayRhythm,
   DAILY_RHYTHM_UPDATED_EVENT,
   readDailyRhythm,
   saveDailyRhythm,
   setRhythmCompletion,
   type DailyRhythmState,
   type RhythmAnchorId,
} from "@/lib/dailyRhythm";

export function useDailyRhythm() {
   const [state, setState] = useState<DailyRhythmState>(() => readDailyRhythm());
   const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
   const [clockTick, setClockTick] = useState(() => Date.now());

   const refresh = useCallback(() => setState(readDailyRhythm()), []);

   useEffect(() => {
      refresh();
      if ("Notification" in window) setNotificationPermission(Notification.permission);
      else setNotificationPermission("unsupported");
      void registerAllevinServiceWorker();

      const onUpdate = () => refresh();
      const catchUpAfterResume = () => {
         if (document.visibilityState !== "visible") return;

         // Mobile browsers suspend timers aggressively. Re-run the reminder
         // orchestrator as soon as the installed PWA becomes active again.
         setClockTick(Date.now());
         refresh();
         void runRhythmReminderCheck();
      };

      window.addEventListener(DAILY_RHYTHM_UPDATED_EVENT, onUpdate);
      window.addEventListener("storage", onUpdate);
      window.addEventListener("focus", catchUpAfterResume);
      document.addEventListener("visibilitychange", catchUpAfterResume);

      const timer = window.setInterval(() => {
         setClockTick(Date.now());
         void runRhythmReminderCheck();
      }, 30_000);
      void runRhythmReminderCheck();

      return () => {
         window.removeEventListener(DAILY_RHYTHM_UPDATED_EVENT, onUpdate);
         window.removeEventListener("storage", onUpdate);
         window.removeEventListener("focus", catchUpAfterResume);
         document.removeEventListener("visibilitychange", catchUpAfterResume);
         window.clearInterval(timer);
      };
   }, [refresh]);

   const todayEntries = useMemo(() => buildTodayRhythm(state), [state, clockTick]);

   async function enableReminders() {
      const permission = await enableAllevinNotifications();
      if (permission === "granted") {
         saveDailyRhythm({ ...readDailyRhythm(), remindersEnabled: true });
      }
      setNotificationPermission(permission);
      refresh();
      return permission;
   }

   function setRemindersEnabled(enabled: boolean) {
      saveDailyRhythm({ ...readDailyRhythm(), remindersEnabled: enabled });
   }

   function completeEntry(id: RhythmAnchorId, done: boolean) {
      setRhythmCompletion(readDailyRhythm(), id, done);
   }

   return {
      state,
      todayEntries,
      notificationPermission,
      enableReminders,
      setRemindersEnabled,
      completeEntry,
   };
}
