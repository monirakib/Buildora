import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * The public surface, for search engines.
 *
 * Deliberately only the pages that work signed out — the landing page, the
 * three professional directories, the marketplace, the permit tools and the
 * open briefs. Individual profiles are not listed: they change constantly and
 * a crawler reaches them from the directory pages anyway.
 */
const PUBLIC_ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" }[] = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/architects", priority: 0.9, changeFrequency: "daily" },
  { path: "/engineers", priority: 0.9, changeFrequency: "daily" },
  { path: "/contractors", priority: 0.9, changeFrequency: "daily" },
  { path: "/marketplace", priority: 0.8, changeFrequency: "daily" },
  { path: "/permits", priority: 0.8, changeFrequency: "weekly" },
  { path: "/briefs", priority: 0.7, changeFrequency: "daily" },
  { path: "/auth", priority: 0.5, changeFrequency: "weekly" },
  { path: "/auth/professional", priority: 0.5, changeFrequency: "weekly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const lastModified = new Date();
  return PUBLIC_ROUTES.map(({ path, priority, changeFrequency }) => ({
    url: `${base}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
