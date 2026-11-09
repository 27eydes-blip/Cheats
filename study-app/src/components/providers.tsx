"use client";
import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";
import { AuthProvider } from "./auth-provider";
import { ThemeProvider } from "./theme-provider";
import { ToastProvider } from "./ui/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    // Every framer-motion animation honours the OS "reduce motion" setting.
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
