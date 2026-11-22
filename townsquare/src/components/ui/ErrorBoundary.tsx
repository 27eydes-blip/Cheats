"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/** Send a client-side error to the server log (Railway logs), so a crash on the live site can be diagnosed. */
export function reportClientError(where: string, error: unknown, extra?: string) {
  try {
    const e = error as { message?: string; stack?: string; name?: string };
    const body = JSON.stringify({ where, name: e?.name ?? "Error", message: String(e?.message ?? error).slice(0, 500), stack: String(e?.stack ?? "").slice(0, 2000), extra: extra?.slice(0, 1000), url: location.pathname + location.search, ua: navigator.userAgent.slice(0, 200) });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-error", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    /* never let error reporting throw */
  }
}

/**
 * Contains a crash to one part of the page (for example search) instead of
 * taking down the whole app. Shows `fallback`, reports the error, and can be
 * reset by changing `resetKey`.
 */
export class ErrorBoundary extends Component<{ where: string; fallback: (reset: () => void) => ReactNode; resetKey?: unknown; children: ReactNode }, { failed: boolean; key: unknown }> {
  state = { failed: false, key: this.props.resetKey };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  static getDerivedStateFromProps(p: { resetKey?: unknown }, s: { failed: boolean; key: unknown }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null;
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.where}]`, error);
    reportClientError(this.props.where, error, info.componentStack ?? undefined);
  }
  render() {
    return this.state.failed ? this.props.fallback(() => this.setState({ failed: false })) : this.props.children;
  }
}
