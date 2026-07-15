import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

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
      <body className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased transition-colors duration-500 dark:bg-[#060a15] dark:text-slate-100">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
