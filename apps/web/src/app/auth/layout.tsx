import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in · Buildora",
  description: "Log in or create your Buildora account to start your construction project.",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
