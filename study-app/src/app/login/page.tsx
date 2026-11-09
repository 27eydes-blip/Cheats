import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/app-shell";
import { LoginCard } from "./login-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="bg-hero relative flex min-h-dvh flex-col items-center justify-center px-4 pb-10 pt-20">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense>
        <LoginCard />
      </Suspense>
    </div>
  );
}
