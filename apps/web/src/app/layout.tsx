import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { AmbientBackground } from "@/components/AmbientBackground";
import { CursorGlow } from "@/components/CursorGlow";
import { SessionSync } from "@/components/SessionSync";
import { PageTransition } from "@/components/PageTransition";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { CallProvider } from "@/components/call/CallProvider";
import { SkipToContent } from "@/components/SkipToContent";
import { APP_NAME, APP_TAGLINE } from "@buildora/shared";
import { siteUrl } from "@/lib/site";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  /* Without metadataBase every relative OG/icon URL is emitted as a path, and
     the crawlers that read them need absolute ones. */
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${APP_NAME}. ${APP_TAGLINE}`,
    /* Page layouts set a short title; this frames it. */
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Buildora connects land owners, architects, engineers, contractors, and material suppliers in one trusted digital ecosystem.",
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME}. ${APP_TAGLINE}`,
    description:
      "Post a brief, hire a verified architect, fund escrow, track your RAJUK permit, and run your build to handover.",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  /* Nothing here is worth indexing beyond the marketing surface, but the pages
     that matter are public, so leave crawling on and let each page opt out. */
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  /* Two entries, not one: the browser chrome should follow the theme the user
     picked rather than always painting the dark bar. */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f2ec" },
    { media: "(prefers-color-scheme: dark)", color: "#060a15" },
  ],
  colorScheme: "light dark",
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
        <SkipToContent />
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
