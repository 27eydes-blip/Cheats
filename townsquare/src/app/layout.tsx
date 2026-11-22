import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { APP_NAME, TAGLINE } from "@/config";
import { liveEvents } from "@/lib/news";
import { wireItems } from "@/lib/wire";
import { get } from "@/lib/db";
import { unreadCount } from "@/lib/notifications";
import { getViewer } from "@/lib/session";
import { mediaUrl } from "@/lib/users";
import { Suspense } from "react";
import { Providers } from "@/components/providers";
import { RegisterSW } from "@/components/RegisterSW";
import { TzCookie } from "@/components/sports/TzCookie";
import { ChannelDial } from "@/components/shell/ChannelDial";
import { TabBar } from "@/components/shell/TabBar";
import { Rail } from "@/components/shell/Rail";
import { unreadMessages } from "@/lib/messages";
import { getFeedTabs } from "@/lib/feedtabs";
import { LiveWire, type WireItem } from "@/components/shell/LiveWire";
import { getQuotes, marketMode } from "@/lib/markets/provider";
import { Masthead } from "@/components/shell/Masthead";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { Celebrate } from "@/components/Celebrate";
import { NavProgress } from "@/components/shell/NavProgress";
import { InstallPrompt, PhoneGestures } from "@/components/shell/PhoneGestures";
import { condensed, inter, mono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: "The national front page where every story has a split. Take a side, read the dispatches, settle the debate.",
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
    { media: "(prefers-color-scheme: light)", color: "#2f6bff" },
    { media: "(prefers-color-scheme: dark)", color: "#2f6bff" },
  ],
};

/** Applies the saved theme before first paint (no flash). Default: follow the device. */
const themeScript = `(function(){try{var t=document.cookie.match(/(?:^|; )theme=(\\w+)/);t=t?t[1]:'dark';var l=t==='light'||(t==='system'&&matchMedia('(prefers-color-scheme: light)').matches);var c=document.documentElement.classList;c.toggle('dark',!l);c.toggle('light',l)}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [viewer, jar] = await Promise.all([getViewer(), cookies()]);
  const theme = jar.get("theme")?.value;
  const textSize = jar.get("textsize")?.value;
  const unread = viewer ? unreadCount(viewer.id) : 0;
  const liveCount = liveEvents().filter((e) => e.isLive).length;
  const wire: WireItem[] = wireItems();
  // Market moves for the ticker (index ETFs + a few bellwethers).
  const tape = (await getQuotes(["SPY", "QQQ", "DIA", "IWM", "AAPL", "NVDA", "MSFT", "TSLA"])).map((q) => ({ symbol: q.symbol, name: q.name, price: q.price, changePct: q.changePct }));
  const clientViewer = viewer
    ? { id: viewer.id, handle: viewer.handle, displayName: viewer.display_name, avatarUrl: mediaUrl(viewer.avatar_media_id), isAdmin: viewer.role === "admin", suspended: viewer.status === "suspended", verified: !!viewer.verified }
    : null;
  const count = (sql: string) => (viewer ? (get<{ n: number }>(sql, [viewer.id])?.n ?? 0) : 0);
  const topics = viewer ? getFeedTabs(viewer.id) : [];
  const stats = viewer
    ? {
        followers: count("SELECT count(*) n FROM follows WHERE followee_id = ?"),
        following: count("SELECT count(*) n FROM follows WHERE follower_id = ?"),
        friends: count("SELECT count(*) n FROM follows a JOIN follows b ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id WHERE a.follower_id = ?"),
      }
    : null;
  const unreadDm = viewer ? unreadMessages(viewer.id) : 0;
  const rail = jar.get("rail")?.value;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${condensed.variable} ${mono.variable} ${theme === "light" ? "light" : "dark"}`}
      style={textSize === "large" ? { fontSize: "112.5%" } : undefined}
      data-rail={rail === "open" || rail === "closed" ? rail : undefined}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[10px] focus:bg-navy focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Providers viewer={clientViewer} stats={stats} topics={topics}>
          <Suspense fallback={null}><NavProgress /></Suspense>
          <Rail viewer={clientViewer} unread={unread} unreadMessages={unreadDm} topics={topics} />
          <div className="lg:pl-[var(--rail-w)] lg:transition-[padding] lg:duration-200">
          <Masthead unread={unread} tape={tape} />
          <div className="z-30 shadow-[0_1px_0_var(--rule)] lg:sticky lg:top-0">
            <ChannelDial liveCount={liveCount} />
            <LiveWire items={wire} quotes={tape} demo={marketMode() === "demo"} slot="layout" now={Date.now()} />
          </div>
          <main id="main" className="pb-tabbar relative min-h-[70dvh]" style={{ ["--avatar-gap" as string]: "var(--paper)" }}>
            {viewer?.status === "suspended" && (
              <p className="border-b border-rule bg-danger-soft px-4 py-2.5 text-center text-[14px] font-medium text-disagree">
                Your account is suspended{viewer.suspended_until ? ` until ${new Date(viewer.suspended_until).toLocaleDateString()}` : ""}. You can read, but not take part.
              </p>
            )}
            {children}
            <SiteFooter />
          </main>
          </div>
          <TabBar unread={unread} unreadMessages={unreadDm} />
          <RegisterSW />
          <TzCookie />
          <PhoneGestures />
          <Celebrate />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
