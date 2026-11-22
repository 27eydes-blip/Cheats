// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/components/providers", () => ({ useViewer: () => null }));
vi.mock("@/actions/stance", () => ({ stanceAction: vi.fn() }));

import { normalizeResults, SearchOverlay } from "@/components/shell/SearchOverlay";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

let showModalThrows = false;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    if (showModalThrows) throw new DOMException("not supported", "InvalidStateError");
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
let beacons: string[] = [];
beforeEach(() => {
  showModalThrows = false;
  beacons = [];
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: undefined });
});
afterEach(() => (cleanup(), vi.unstubAllGlobals()));

const respond = (status: number, body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));
const open = async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  render(<SearchOverlay open onClose={() => {}} onCompose={() => {}} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  vi.useRealTimers();
};

describe("search results normalization", () => {
  it("turns missing, null or malformed fields into safe empty results", () => {
    expect(normalizeResults(null)).toEqual({ stories: [], voices: [], desks: [], takes: [], teams: [] });
    expect(normalizeResults({ error: "Bad gateway" }).stories).toEqual([]);
    const r = normalizeResults({ stories: [{ key: "k", title: null, section: null, split: null }, null, { title: "no key" }], takes: [{ id: "t", stance: "unsure", body: null }], teams: [{ id: "x" }], voices: "nope" });
    expect(r.stories).toEqual([{ key: "k", title: "Untitled story", section: "News", status: "", takes: 0, split: { agree: 0, disagree: 0, unsure: 0, total: 0, mine: null } }]);
    expect(r.takes[0]).toMatchObject({ stance: null, body: "" });
    expect(r.teams).toEqual([]);
    expect(r.voices).toEqual([]);
  });
});

describe("search overlay", () => {
  it("opens with zero results", async () => {
    respond(200, { stories: [], voices: [], desks: [], takes: [], teams: [] });
    await open();
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByText("Front Page")).toBeTruthy(); // quick jumps still there
  });

  it("survives an error body instead of results", async () => {
    respond(200, { error: "Something upstream broke" });
    await open();
    expect(screen.getByRole("combobox")).toBeTruthy();
  });

  it("shows a message, not a crash, when the search API fails", async () => {
    respond(502, "<html>Bad gateway</html>");
    await open();
    expect(screen.getByText(/Search is having trouble/)).toBeTruthy();
  });

  it("still opens when the browser can't open a modal dialog", async () => {
    showModalThrows = true;
    respond(200, { stories: [{ key: "s", title: "A story", section: "Politics", status: "developing", takes: 2, split: { agree: 1, disagree: 1, unsure: 0, total: 2 } }] });
    await open();
    expect(document.querySelector("dialog")!.hasAttribute("open")).toBe(true);
    expect(screen.getByText("A story")).toBeTruthy();
  });
});

describe("error boundary", () => {
  it("keeps a crash inside search from taking down the page, and reports it", async () => {
    const Boom = () => {
      throw new Error("kaboom");
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => (beacons.push(String(init?.body)), new Response(null, { status: 204 }))));
    render(
      <div>
        <p>Rest of the page</p>
        <ErrorBoundary where="search" fallback={() => <p>Search hit a problem.</p>}>
          <Boom />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText("Rest of the page")).toBeTruthy();
    expect(screen.getByText("Search hit a problem.")).toBeTruthy();
    await new Promise((r) => setTimeout(r, 10));
    expect(beacons[0]).toContain("kaboom");
    expect(JSON.parse(beacons[0])).toMatchObject({ where: "search", message: "kaboom" });
  });
});

describe("zero results", () => {
  it("says so when a query matches nothing", async () => {
    respond(200, { stories: [], voices: [], desks: [], takes: [], teams: [] });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { getByRole } = render(<SearchOverlay open onClose={() => {}} onCompose={() => {}} />);
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(getByRole("combobox"), { target: { value: "zzzz" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    vi.useRealTimers();
    expect(screen.getByText(/Nothing on the wire for “zzzz”/)).toBeTruthy();
  });
});
