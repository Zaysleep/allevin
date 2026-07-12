"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ClientHydrationGateProps {
   children: ReactNode;
}

export default function ClientHydrationGate({ children }: ClientHydrationGateProps) {
   const [hasHydrated, setHasHydrated] = useState(false);

   useEffect(() => {
      setHasHydrated(true);
   }, []);

   if (!hasHydrated) {
      return (
         <main
            className="min-h-screen w-full overflow-x-hidden bg-transparent"
            aria-hidden="true"
         />
      );
   }

   return <>{children}</>;
}
