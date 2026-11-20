import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { APP_NAME, TAGLINE } from "@/config";
import { getBanner } from "@/lib/moderation";
import { unreadCount } from "@/lib/notifications";
import { getViewer } from "@/lib/session";
import { mediaUrl } from "@/lib/users";
import { BreakingBanner } from "@/components/BreakingBanner";
import { BottomTabs, SideNav, TopBar } from "@/components/Nav";
import { Providers } from "@/components/providers";
import { RightRail } from "@/components/RightRail";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: `${APP_NAME} — ${TAGLINE}`, template: `%s · ${APP_NAME}` },
  description: "Follow people, join communities, and get live news in one feed you control.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0e14" },
  ],
};

/** Applies the saved theme before first paint, so there's no light/dark flash. */
const themeScript = `(function(){try{var t=document.cookie.match(/(?:^|; )theme=(\\w+)/);t=t?t[1]:'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [viewer, jar] = await Promise.all([getViewer(), cookies()]);
  const theme = jar.get("theme")?.value;
  const textSize = jar.get("textsize")?.value;
  const unread = viewer ? unreadCount(viewer.id) : 0;
  const clientViewer = viewer
    ? {
        id: viewer.id,
        handle: viewer.handle,
        displayName: viewer.display_name,
        avatarUrl: mediaUrl(viewer.avatar_media_id),
        isAdmin: viewer.role === "admin",
        suspended: viewer.status === "suspended",
      }
    : null;

  return (
    <html lang="en" className={theme === "dark" ? "dark" : ""} style={textSize === "large" ? { fontSize: "112.5%" } : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <Providers viewer={clientViewer}>
          <BreakingBanner banner={getBanner()} />
          <TopBar unread={unread} />
          <div className="mx-auto flex max-w-6xl justify-center">
            <div className="hidden w-20 shrink-0 sm:block xl:w-64">
              <SideNav unread={unread} />
            </div>
            <main id="main" className="pb-tabbar min-h-[100dvh] w-full max-w-[640px] min-w-0 border-line sm:border-x">
              {viewer?.status === "suspended" && (
                <p className="border-b border-line bg-danger/10 px-4 py-2 text-sm text-danger">
                  Your account is suspended{viewer.suspended_until ? ` until ${new Date(viewer.suspended_until).toLocaleDateString()}` : ""}. You can read, but not post or interact.
                </p>
              )}
              {children}
            </main>
            <div className="hidden w-[350px] shrink-0 lg:block">
              <RightRail viewerId={viewer?.id ?? null} />
            </div>
          </div>
          <BottomTabs />
          <RegisterSW />
        </Providers>
      </body>
    </html>
  );
}
