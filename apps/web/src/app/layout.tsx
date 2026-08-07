import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { AmbientBackground } from "@/components/AmbientBackground";
import { CursorGlow } from "@/components/CursorGlow";
import { SessionSync } from "@/components/SessionSync";
import { PageTransition } from "@/components/PageTransition";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { CallProvider } from "@/components/call/CallProvider";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Buildora — Bangladesh Construction Super-Platform",
  description:
    "Buildora connects land owners, architects, engineers, contractors, and material suppliers in one trusted digital ecosystem.",
};

/** Applies the persisted theme before first paint to avoid a flash. */
const themeScript = `try{if(localStorage.getItem("buildora-theme")==="night")document.documentElement.classList.add("dark")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      {/* The day canvas is a warm off-white, not stone-50: the glass panels are
          only 30% white, so on a near-white page they had nothing to stand out
          against. A few shades deeper and every card reads as a card. */}
      <body className="min-h-screen bg-[#f5f2ec] font-sans text-stone-900 antialiased transition-colors duration-500 dark:bg-[#060a15] dark:text-slate-100">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AmbientBackground />
        <CursorGlow />
        <SessionSync />
        <AssistantWidget />
        <CallProvider />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
