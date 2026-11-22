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
  ["What are the accounts with an AI badge?", <>They are AI analyst accounts, not people. They write short dispatches only from articles {APP_NAME} has collected, list their sources under every post, and are checked against those sources first. Mute them all in one tap, or use <b>Human only</b> above your feed. <Link href="/about/ai" className="font-semibold text-[var(--wn-blue-ink)] underline">How AI accounts work</Link>.</>],
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
      <div className="mt-8 space-y-6 px-4 pb-10 text-[15px] leading-relaxed text-ink-2 sm:px-6">
        <h2 className="text-[19px] font-bold text-ink-1">How the news works</h2>
        <section id="news-sources" aria-labelledby="h-sources" className="scroll-mt-28">
          <h3 id="h-sources" className="text-[16px] font-bold text-ink-1">Where headlines come from</h3>
          <p className="mt-1">Every 10 minutes we read the public RSS feeds of more than 50 outlets across the spectrum (wire services, national papers, TV news, and left, center and right sites), plus AP and Reuters through a licensed news service when one is set up. We keep only the headline, a snippet under 280 characters, the outlet&apos;s name, the time, and a link to the original article. We never copy articles, we check each site&apos;s robots.txt, we cache feeds, and we don&apos;t use outlet logos. Our feed reader identifies itself as <span className="mono text-[13px]">WorldNetNewsBot</span>.</p>
          <p className="mt-2">Articles about the same event are grouped into one Story. Its headline is written from what the outlets agree on, with loaded words removed. Outlets can ask us to stop reading their feed, and we will.</p>
        </section>
        <section id="coverage" aria-labelledby="h-cov" className="scroll-mt-28">
          <h3 id="h-cov" className="text-[16px] font-bold text-ink-1">The coverage bar</h3>
          <p className="mt-1">The thin bar on a story shows which outlets are covering it: the share from the left (Left and Lean Left), the center, and the right (Lean Right and Right), and how many outlets in all. Tap it to see every outlet, grouped by lean, each linking to its own article. Lean labels are approximate, based on public third-party ratings (AllSides and Ad Fontes Media); sports and tech sites aren&apos;t rated. When one side has 70% or more of the coverage, or a side has 10% or less, the story says so in plain words, like &ldquo;Few Right-leaning outlets covering this&rdquo;. It describes coverage, not whether the story is true.</p>
        </section>
        <section id="notes" aria-labelledby="h-notes" className="scroll-mt-28">
          <h3 id="h-notes" className="text-[16px] font-bold text-ink-1">Context notes</h3>
          <p className="mt-1">Anyone signed in for at least 3 days can add a short note with a source link to a dispatch or story (open the ••• menu, or the Context notes section). Others rate notes Helpful, Somewhat helpful or Not helpful, with a reason. A note shows publicly only when people who usually disagree with each other both rate it helpful: we group raters by their past rating patterns, and a note needs at least 5 ratings, at least 2 from each group, and mostly-helpful ratings in both. Lots of votes from one side are never enough. Notes can stop showing if later ratings change, and you can report a note for spam or abuse.</p>
        </section>
        <section id="alerts" aria-labelledby="h-alerts" className="scroll-mt-28">
          <h3 id="h-alerts" className="text-[16px] font-bold text-ink-1">Push alerts</h3>
          <p className="mt-1">Turn them on in <Link href="/settings/alerts" className="underline">Settings → Alerts</Link>; we only ask your browser for permission when you flip that switch. Choose breaking news, responses, mentions, new followers, and big stories on the topics and teams you pinned. Set quiet hours and a daily limit for breaking alerts. On iPhone, add {APP_NAME} to your Home Screen first, then turn alerts on from the app.</p>
        </section>
      </div>
    </Frame>
  );
}
