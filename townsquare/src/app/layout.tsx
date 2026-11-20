import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { APP_NAME, TAGLINE } from "@/config";
import { getBanner } from "@/lib/moderation";
import { liveEvents, listStories } from "@/lib/news";
import { all } from "@/lib/db";
import { unreadCount } from "@/lib/notifications";
import { getViewer } from "@/lib/session";
import { mediaUrl } from "@/lib/users";
import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { RegisterSW } from "@/components/RegisterSW";
import { ChannelDial } from "@/components/shell/ChannelDial";
import { Dock } from "@/components/shell/Dock";
import { LiveWire, type WireItem } from "@/components/shell/LiveWire";
import { Masthead } from "@/components/shell/Masthead";
import { NavProgress } from "@/components/shell/NavProgress";
import { InstallPrompt, PhoneGestures } from "@/components/shell/PhoneGestures";
import { inter, mono, newsreader } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: "The national front page where every story has a split. Take a side, read the takes, settle the debate.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
    startupImage: [
      { url: "/splash/splash-1290x2796.png", media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/splash-1179x2556.png", media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/splash-1170x2532.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/splash-1284x2778.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" },
      { url: "/splash/splash-2048x2732.png", media: "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" },
    ],
  },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#070c18" },
  ],
};

/** Applies the saved theme before first paint (no flash). Default: follow the device. */
const themeScript = `(function(){try{var t=document.cookie.match(/(?:^|; )theme=(\\w+)/);t=t?t[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [viewer, jar] = await Promise.all([getViewer(), cookies()]);
  const theme = jar.get("theme")?.value;
  const textSize = jar.get("textsize")?.value;
  const unread = viewer ? unreadCount(viewer.id) : 0;
  const liveCount = liveEvents().filter((e) => e.isLive).length;
  const banner = getBanner();
  // Live Wire: the admin's breaking item first, then the latest key updates from live stories.
  const live = listStories(8).filter((x) => x.status === "live");
  const updates = live.length
    ? all<{ body: string; story_key: string; created_at: number }>(
        `SELECT body, story_key, created_at FROM story_updates WHERE story_key IN (${live.map(() => "?").join(",")}) ORDER BY created_at DESC LIMIT 6`,
        live.map((x) => x.key),
      )
    : [];
  const wire: WireItem[] = [
    ...(banner ? [{ text: banner.text, href: banner.url, at: banner.setAt, label: banner.level === "info" ? "Update" : banner.level === "alert" ? "Alert" : "Breaking" }] : []),
    ...updates.map((u) => ({ text: u.body, href: `/news/story/${u.story_key}`, at: u.created_at, label: live.find((x) => x.key === u.story_key)?.section ?? "Live" })),
  ];
  const clientViewer = viewer
    ? { id: viewer.id, handle: viewer.handle, displayName: viewer.display_name, avatarUrl: mediaUrl(viewer.avatar_media_id), isAdmin: viewer.role === "admin", suspended: viewer.status === "suspended" }
    : null;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${mono.variable} ${theme === "dark" ? "dark" : ""}`}
      style={textSize === "large" ? { fontSize: "112.5%" } : undefined}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[4px] focus:bg-navy focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Providers viewer={clientViewer}>
          <Suspense fallback={null}><NavProgress /></Suspense>
          <Masthead unread={unread} />
          <div className="sticky top-0 z-30 shadow-[0_1px_0_var(--rule)]">
            <Suspense fallback={<div className="h-[var(--dial-h)] border-b border-rule bg-paper" />}>
              <ChannelDial liveCount={liveCount} />
            </Suspense>
            <LiveWire items={wire} />
          </div>
          <main id="main" className="pb-tabbar relative min-h-[70dvh]" style={{ ["--avatar-gap" as string]: "var(--paper)" }}>
            {viewer?.status === "suspended" && (
              <p className="border-b border-rule bg-danger-soft px-4 py-2.5 text-center text-[14px] font-medium text-disagree">
                Your account is suspended{viewer.suspended_until ? ` until ${new Date(viewer.suspended_until).toLocaleDateString()}` : ""}. You can read, but not take part.
              </p>
            )}
            {children}
          </main>
          <Dock liveCount={liveCount} />
          <RegisterSW />
          <PhoneGestures />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
