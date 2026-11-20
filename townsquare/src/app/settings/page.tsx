import Link from "next/link";
import { requireViewerPage } from "@/lib/session";
import { PageHeader } from "@/components/PageHeader";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const viewer = await requireViewerPage("/settings");
  const items = [
    { href: "/settings/profile", title: "Edit profile", text: "Photo, banner, name, bio, links" },
    { href: "/settings/account", title: "Account", text: `Handle (@${viewer.handle}), email, password, delete account` },
    { href: "/settings/privacy", title: "Privacy and safety", text: "Follower lists, blocked and muted accounts, download your data" },
    { href: "/settings/display", title: "Display", text: "Dark mode and text size" },
  ];
  return (
    <>
      <PageHeader title="Settings" />
      <ul>
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} className="block border-b border-line px-4 py-4 hover:bg-surface">
              <span className="block font-bold">{i.title}</span>
              <span className="text-sm text-muted">{i.text}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="px-4 py-6 text-sm text-muted">
        <Link href="/legal/terms" className="underline">Terms</Link> · <Link href="/legal/privacy" className="underline">Privacy</Link> ·{" "}
        <Link href="/legal/guidelines" className="underline">Community Guidelines</Link>
      </p>
    </>
  );
}
