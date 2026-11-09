import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginCard } from "./login-card";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-violet-500/15 via-transparent to-fuchsia-500/15 p-4">
      <Suspense>
        <LoginCard />
      </Suspense>
    </div>
  );
}
