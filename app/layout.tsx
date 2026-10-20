import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { APPEARANCE_SCRIPT } from "@/lib/chat/appearance";
import { AppearanceSync } from "@/lib/chat/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Obsidian Chat",
  description: "Real-time group chat",
  // Installed on iOS: full screen, with the app's own name under the icon.
  appleWebApp: { capable: true, title: "Obsidian", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  // The default (dark) theme's background; AppearanceSync follows the chosen theme.
  themeColor: "#0b1222",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The appearance script sets data attributes on <html> before React hydrates.
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme, text size and density before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_SCRIPT }} />
      </head>
      {/* The backdrop is body's own (globals.css), under everything. */}
      <body className="min-h-full font-sans text-foreground">
        <AppearanceSync />
        {children}
      </body>
    </html>
  );
}
