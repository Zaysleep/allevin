import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
   title: "ALLEVIN",
   description: "A high-level personal assistant from Kin Software LLC.",
   manifest: "/manifest.webmanifest",
   appleWebApp: {
      capable: true,
      title: "ALLEVIN",
      statusBarStyle: "black-translucent",
   },
   formatDetection: {
      telephone: false,
   },
   icons: {
      icon: "/icon.png?v=mkxii6",
      shortcut: "/icon.png?v=mkxii6",
      apple: "/allevin-icon-192.png?v=mkxii6",
   },
};

export const viewport: Viewport = {
   width: "device-width",
   initialScale: 1,
   maximumScale: 1,
   viewportFit: "cover",
   themeColor: "#192132",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
   return (
      <html lang="en">
         <body>{children}</body>
      </html>
   );
}
