"use client";

import { useCallback, useEffect, useState } from "react";

import {
   archiveLifeItem,
   bringLifeItemToToday,
   completeLifeItem,
   createLifeItem,
   ensureLifeStateReady,
   LIFE_STATE_UPDATED_EVENT,
   markLifeItemWaiting,
   moveLifeItemToTomorrow,
   readLifeState,
   reopenLifeItem,
   updateLifeItem,
} from "@/lib/lifeStore";
import type { LifeState } from "@/lib/lifeTypes";

export function useLifeState() {
   const [state, setState] = useState<LifeState>(() => readLifeState());
   const [hydrated, setHydrated] = useState(false);

   const refresh = useCallback(() => setState(readLifeState()), []);

   useEffect(() => {
      setState(ensureLifeStateReady());
      setHydrated(true);
      const onUpdate = () => refresh();
      window.addEventListener(LIFE_STATE_UPDATED_EVENT, onUpdate);
      window.addEventListener("storage", onUpdate);
      return () => {
         window.removeEventListener(LIFE_STATE_UPDATED_EVENT, onUpdate);
         window.removeEventListener("storage", onUpdate);
      };
   }, [refresh]);

   return {
      state,
      hydrated,
      refresh,
      create: createLifeItem,
      complete: completeLifeItem,
      reopen: reopenLifeItem,
      archive: archiveLifeItem,
      tomorrow: moveLifeItemToTomorrow,
      today: bringLifeItemToToday,
      waiting: markLifeItemWaiting,
      update: updateLifeItem,
   };
}
