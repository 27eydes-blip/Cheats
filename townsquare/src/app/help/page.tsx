import Link from "next/link";
import { APP_NAME } from "@/config";
import { Kicker } from "@/components/ui/Badge";
import { Frame, PageTitle } from "@/components/ui/Frame";

export const metadata = { title: "Help", description: `How ${APP_NAME} works: the feed, dispatches, reactions, privacy and safety.` };

const QA: [string, React.ReactNode][] = [
  ["What are Dispatches, Responses, Relays, Boosts and the Vault?", <>A <b>Dispatch</b> is a post. A <b>Response</b> is a reply. A <b>Relay</b> shares someone&apos;s dispatch with your followers. A <b>Boost</b> is a reaction (tap for 🔥, hold for all five). The <b>Vault</b> keeps dispatches for later; only you can see it.</>],
  ["How does For You decide what to show?", <>It mixes stories and dispatches by freshness, engagement, your interests, and what people you follow reacted to. Use the ••• menu on any card for <b>Show more like this</b>, <b>Not interested</b> or <b>Mute topic</b>. Nothing can be boosted without limit, and sponsored cards (if any) are always labeled.</>],
  ["How do I change my tabs?", <>Tap <b>+</b> at the end of the tab strip on Home to pin topics and teams, or remove ones you don&apos;t want. Swipe left or right on the feed to move between tabs.</>],
  ["Who can message me?", <>Only people you follow can start a conversation with you, and you can reply to anyone who has written to you. Blocking someone stops messages both ways.</>],
  ["How do I make my account private?", <>Settings → Privacy and safety → Private account. New followers then need your approval, and only approved followers see your dispatches.</>],
  ["What is the Credibility Meter?", <>A 0–100 score on every profile. It rises when you attach source links to your dispatches and falls if moderators remove your content. Tap &ldquo;How this is scored&rdquo; on any profile for the breakdown.</>],
  ["What are Flash dispatches?", <>Turn on ⚡ in the composer and the dispatch disappears after 24 hours.</>],
  ["How do I report something or block someone?", <>Open the ••• menu on a dispatch or a profile. Reports go to moderators; the same rules apply to every account. See the <Link href="/legal/guidelines" className="font-semibold text-[var(--wn-blue-ink)] underline">Community Guidelines</Link>.</>],
  ["Are the stock prices real?", <>Only when the Markets page says LIVE DATA. If it says DEMO, the prices are simulated. Nothing on {APP_NAME} is investment advice.</>],
  ["Keyboard shortcuts", <>Press <kbd className="mono rounded-[6px] bg-white/[0.06] px-1.5 ring-1 ring-rule">?</kbd> anywhere for the list, or <kbd className="mono rounded-[6px] bg-white/[0.06] px-1.5 ring-1 ring-rule">⌘K</kbd> to search.</>],
];

export default function Help() {
  return (
    <Frame>
      <PageTitle folio={<Kicker tone="gold">Support</Kicker>} title="Help" dek={`Quick answers about how ${APP_NAME} works.`} />
      <div className="space-y-2 px-3 pt-4 sm:px-4">
        {QA.map(([q, a]) => (
          <details key={q} className="card group px-4">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 text-[15.5px] font-bold [&::-webkit-details-marker]:hidden">
              {q}
              <span aria-hidden="true" className="text-[20px] text-[var(--wn-cyan-ink)] transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="pb-4 text-[15px] leading-relaxed text-ink-2">{a}</p>
          </details>
        ))}
        <p className="px-1 pt-3 text-[13.5px] text-ink-3">Still stuck? See <Link href="/legal/terms" className="underline">Terms</Link>, <Link href="/legal/privacy" className="underline">Privacy</Link>, or manage your account in <Link href="/settings" className="underline">Settings</Link>.</p>
      </div>
    </Frame>
  );
}
