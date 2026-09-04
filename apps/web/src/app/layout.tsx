import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { CursorGlow } from "@/components/CursorGlow";
import { SessionSync } from "@/components/SessionSync";
import { PageTransition } from "@/components/PageTransition";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { CallProvider } from "@/components/call/CallProvider";
import { SkipToContent } from "@/components/SkipToContent";
import { AmbientBackground } from "@/components/AmbientBackground";
import { InteractionEffects } from "@/components/InteractionEffects";
import { SplashScreen } from "@/components/SplashScreen";
import { Toaster } from "@/components/ui/Toaster";
import { CartDrawer } from "@/components/market/CartDrawer";
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
/**
 * Runs before first paint. Two jobs: apply the persisted theme so night mode
 * never flashes light, and mark the document for the welcome screen when this
 * browser session has not seen it yet (see components/SplashScreen).
 */
const themeScript = `try{if(localStorage.getItem("buildora-theme")==="night")document.documentElement.classList.add("dark")}catch(e){}try{if(!sessionStorage.getItem("buildora-welcomed"))document.documentElement.classList.add("splash")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-[#f5f2ec] font-sans text-stone-900 antialiased transition-colors duration-500 dark:bg-[#060a15] dark:text-slate-100">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <SplashScreen />
        <SkipToContent />
        <AmbientBackground />
        <CursorGlow />
        <SessionSync />
        <AssistantWidget />
        <CallProvider />
        <InteractionEffects />
        <Toaster />
        <CartDrawer />
        <PageTransition>{children}</PageTransition>
      </body>
    </html>
  );
}
