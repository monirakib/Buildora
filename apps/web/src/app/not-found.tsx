import Link from "next/link";
import type { Metadata } from "next";
import { StatusScreen, actionClass } from "@/components/app/StatusScreen";

export const metadata: Metadata = {
  title: "Page not found",
  /* A 404 in a search index is noise, and Next serves this for any unmatched
     path — including ones a crawler invented. */
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <StatusScreen
      code="404"
      title="This page isn't here."
      message="The link may be out of date, or the project, profile or listing behind it may have been removed."
    >
      <Link href="/dashboard" className={actionClass}>
        Go to your dashboard
      </Link>
    </StatusScreen>
  );
}
