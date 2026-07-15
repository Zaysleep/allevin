import type { Metadata, Viewport } from "next";
import "./globals.css";

// ========================================
// Application Metadata
// ========================================

export const metadata: Metadata = {
   title: "Allevin",
   description: "Allevin is a senior-level project assistant focused on reducing cognitive overload.",
};

export const viewport: Viewport = {
   width: "device-width",
   initialScale: 1,
   maximumScale: 1,
};

// ========================================
// Root Layout
// Persistent application wrapper
// ========================================

export default function RootLayout({
   children,
}: Readonly<{
   children: React.ReactNode;
}>) {
   return (
      <html lang="en">
         <head>
            {/* ========================================
            Satoshi Font Import
            ======================================== */}
            <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" rel="stylesheet" />
         </head>

         <body
            className="
               min-h-screen
               w-full
               overflow-x-hidden
               bg-[var(--color-bg)]
               text-[var(--color-text-primary)]
               antialiased
            "
         >
            {children}
         </body>
      </html>
   );
}
