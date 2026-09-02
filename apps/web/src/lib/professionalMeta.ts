import type { Metadata } from "next";
import { UserRole, type PublicProfessional } from "@buildora/shared";
import { API_BASE_URL } from "./api";

/**
 * Metadata for the three public professional profiles.
 *
 * These are the pages worth having in a search index — someone looking for "an
 * architect in Dhanmondi" should be able to land on one. Until now every one of
 * them shared the site's default title, so a directory of a hundred profiles
 * looked like a hundred copies of the same page to a crawler.
 *
 * Falls back to the generic title whenever the fetch fails, so a cold API never
 * turns into a failed page render.
 */

const ROLE_NOUN: Partial<Record<UserRole, string>> = {
  [UserRole.ARCHITECT]: "Architect",
  [UserRole.STRUCTURAL_ENGINEER]: "Structural engineer",
  [UserRole.CONTRACTOR]: "Contractor",
};

async function fetchProfessional(id: string): Promise<PublicProfessional | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/professionals/${id}`, {
      // Profiles change rarely; five minutes keeps crawls off the API without
      // making an edited portfolio feel stuck.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { professional?: PublicProfessional } };
    return body.data?.professional ?? null;
  } catch {
    return null;
  }
}

export async function professionalMetadata(id: string, fallbackNoun: string): Promise<Metadata> {
  const pro = await fetchProfessional(id);
  if (!pro) return { title: `${fallbackNoun} profile` };

  const noun = ROLE_NOUN[pro.role] ?? fallbackNoun;
  const where = [pro.practiceDistrict, pro.practiceDivision].filter(Boolean).join(", ");
  const title = `${pro.name} — ${noun}${where ? ` in ${where}` : ""}`;

  // Whatever they wrote themselves reads better than anything assembled here,
  // so their own intro and bio win; the composed line is the last resort.
  const composed = [
    pro.professionalTitle,
    pro.company,
    pro.yearsExperience ? `${pro.yearsExperience} years' experience` : null,
    pro.specialties,
  ]
    .filter(Boolean)
    .join(" · ");

  const description =
    pro.portfolioIntro ??
    pro.bio ??
    (composed || `${pro.name} is a verified ${noun.toLowerCase()} on Buildora.`);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "profile",
      /* Their avatar makes a far better card than the site default — but only
         when they actually have one, since a missing image renders as a broken
         preview rather than falling back. */
      ...(pro.avatarUrl ? { images: [{ url: pro.avatarUrl }] } : {}),
    },
  };
}
