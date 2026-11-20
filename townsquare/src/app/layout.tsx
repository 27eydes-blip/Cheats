import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { APP_NAME, TAGLINE } from "@/config";
import { getBanner } from "@/lib/moderation";
import { liveEvents, tickerStories } from "@/lib/news";
import { unreadCount } from "@/lib/notifications";
import { getViewer } from "@/lib/session";
import { mediaUrl } from "@/lib/users";
import { Providers } from "@/components/providers";
import { RegisterSW } from "@/components/RegisterSW";
import { RightRail } from "@/components/RightRail";
import { TabBar, TopBar } from "@/components/shell/MobileChrome";
import { SideNav } from "@/components/shell/SideNav";
import { Ticker, type TickerItem } from "@/components/shell/Ticker";
import { inter, newsreader } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: "Follow people, join communities, and get live news in one feed you control.",
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
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e14" },
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
  const stories = tickerStories();
  const ticker: TickerItem[] = [
    ...(banner ? [{ text: banner.text, href: banner.url }] : []),
    ...stories.filter((s) => !banner?.url?.endsWith(`/${s.key}`)).map((s) => ({ text: `${s.status === "live" ? "LIVE · " : ""}${s.title}`, href: `/news/story/${s.key}` })),
  ];
  const clientViewer = viewer
    ? { id: viewer.id, handle: viewer.handle, displayName: viewer.display_name, avatarUrl: mediaUrl(viewer.avatar_media_id), isAdmin: viewer.role === "admin", suspended: viewer.status === "suspended" }
    : null;

  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${theme === "dark" ? "dark" : ""}`}
      style={textSize === "large" ? { fontSize: "112.5%" } : undefined}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Providers viewer={clientViewer}>
          {ticker.length > 0 && <Ticker label={banner?.level === "info" ? "UPDATE" : banner?.level === "alert" ? "ALERT" : "BREAKING"} items={ticker} />}
          <TopBar unread={unread} />
          <div className="mx-auto flex max-w-[1340px] justify-center sm:px-2 lg:px-4">
            <div className="hidden w-[76px] shrink-0 sm:block xl:w-[256px]">
              <SideNav unread={unread} liveCount={liveCount} />
            </div>
            <main
              id="main"
              className="pb-tabbar relative min-h-[100dvh] w-full max-w-[680px] min-w-0 bg-surface sm:border-x sm:border-line sm:shadow-1"
              style={{ ["--avatar-gap" as string]: "var(--surface)" }}
            >
              {viewer?.status === "suspended" && (
                <p className="border-b border-line bg-danger-soft px-4 py-2.5 text-[14px] font-medium text-danger sm:px-6">
                  Your account is suspended{viewer.suspended_until ? ` until ${new Date(viewer.suspended_until).toLocaleDateString()}` : ""}. You can read, but not post or interact.
                </p>
              )}
              {children}
            </main>
            <div className="hidden w-[340px] shrink-0 lg:block xl:w-[360px]">
              <RightRail viewerId={viewer?.id ?? null} />
            </div>
          </div>
          <TabBar liveCount={liveCount} />
          <RegisterSW />
        </Providers>
      </body>
    </html>
  );
}
