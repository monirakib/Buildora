import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/**
 * What a crawler may look at.
 *
 * Each page already sets its own `robots` in metadata, but that only helps once
 * a crawler has fetched the page. This stops it earlier and covers the paths
 * that must never be crawled at all — above all `/p/`, where the only thing
 * protecting a shared project is that the token is unguessable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/p/", // Unguessable share links. Indexing one would defeat the point.
        "/account",
        "/admin",
        "/dashboard",
        "/inquiries",
        "/meetings",
        "/messages",
        "/profile",
        "/projects",
        "/supervisor",
        "/verify",
        "/verify-email",
        "/marketplace/orders",
        "/marketplace/sell",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
