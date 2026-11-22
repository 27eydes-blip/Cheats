// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let path = "/";
vi.mock("next/navigation", () => ({ usePathname: () => path, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/actions/menu", () => ({ switchAccountAction: vi.fn(), feedTabAction: vi.fn() }));
vi.mock("@/components/providers", () => ({ useToast: () => vi.fn(), useViewer: () => null }));

import { SideMenu } from "@/components/shell/SideMenu";
import { activeTab, isActive, menuItems, TABS } from "@/components/shell/menu";

beforeAll(() => {
  // jsdom has no modal dialogs or matchMedia.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as never;
});
afterEach(() => { cleanup(); path = "/"; });

const viewer = { id: "u1", handle: "ann", displayName: "Ann Lee", avatarUrl: null, isAdmin: false, verified: true };
const stats = { followers: 1204, following: 88, friends: 12 };

describe("menu definition", () => {
  it("lists every destination in order, hides Wallet behind its flag and Control Room from non-admins", () => {
    const m = menuItems({ handle: "ann", isAdmin: false, wallet: false });
    expect(m.main.map((x) => x.label)).toEqual(["Profile", "Vault", "History", "Lists", "Rooms", "Groups", "Markets", "Creator Hub", "Settings", "Help"]);
    expect(m.main[0].href).toBe("/u/ann");
    expect(m.more.map((x) => x.key)).toEqual(["rundown", "edition", "teams"]);
    expect(menuItems({ handle: "ann", isAdmin: true, wallet: true }).main.map((x) => x.key)).toContain("wallet");
    expect(menuItems({ handle: "ann", isAdmin: true, wallet: false }).more.map((x) => x.key)).toContain("control");
  });
  it("signed-out visitors only get public destinations", () => {
    const m = menuItems({ handle: null, isAdmin: false, wallet: true });
    expect(m.main.map((x) => x.key)).toEqual(["rooms", "groups", "markets", "help"]);
    expect(m.more.map((x) => x.key)).toEqual(["edition", "teams"]);
  });
  it("maps paths to the five bottom tabs", () => {
    expect(TABS.map((t) => t.label)).toEqual(["Home", "Discover", "Markets", "Alerts", "Messages"]);
    expect([activeTab("/"), activeTab("/explore"), activeTab("/search"), activeTab("/markets"), activeTab("/notifications"), activeTab("/messages/ann"), activeTab("/settings")]).toEqual([0, 1, 1, 2, 3, 4, -1]);
    expect(isActive("/u/ann/followers", "/u/ann")).toBe(true);
    expect(isActive("/explore", "/")).toBe(false);
  });
});

describe("SideMenu drawer", () => {
  it("opens as a labeled modal with the profile card, count chips and theme controls", () => {
    const { getByRole, getByText, getAllByRole, container } = render(<SideMenu open onClose={() => {}} viewer={viewer} stats={stats} wallet={false} />);
    const dialog = container.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("aria-label")).toBe("Menu");
    expect(getByText("Ann Lee")).toBeTruthy();
    expect(getByText("@ann")).toBeTruthy();
    expect(getByRole("link", { name: /1,204\s*Followers/ }).getAttribute("href")).toBe("/u/ann/followers");
    expect(getByRole("link", { name: /12\s*Friends/ }).getAttribute("href")).toBe("/u/ann/friends");
    expect(getByRole("radiogroup", { name: "Theme" })).toBeTruthy();
    expect(getByText("Switch account")).toBeTruthy();
    const labels = getAllByRole("link").map((a) => a.textContent ?? "");
    for (const l of ["Profile", "Vault", "History", "Lists", "Rooms", "Groups", "Markets", "Creator Hub", "Settings", "Help"]) expect(labels.some((t) => t.startsWith(l))).toBe(true);
    expect(labels.some((t) => t.startsWith("Wallet"))).toBe(false);
  });

  it("shows Wallet only when the feature flag is on, and marks the current page", () => {
    path = "/bookmarks";
    const { getByRole } = render(<SideMenu open onClose={() => {}} viewer={viewer} stats={stats} wallet />);
    expect(getByRole("link", { name: /^Wallet/ })).toBeTruthy();
    expect(getByRole("link", { name: /^Vault/ }).getAttribute("aria-current")).toBe("page");
  });

  it("closes on the close button, an outside (backdrop) tap, a destination tap, and a left swipe", () => {
    const onClose = vi.fn();
    const { getByRole, container } = render(<SideMenu open onClose={onClose} viewer={viewer} stats={stats} />);
    const dialog = container.querySelector("dialog")!;
    fireEvent.click(getByRole("button", { name: "Close menu" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(dialog); // a click on the dialog element itself is the backdrop
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(getByRole("link", { name: /^History/ }));
    expect(onClose).toHaveBeenCalledTimes(3);
    act(() => { fireEvent.touchStart(dialog, { touches: [{ clientX: 300, clientY: 400 }] }); });
    act(() => { fireEvent.touchMove(dialog, { touches: [{ clientX: 180, clientY: 404 }] }); });
    act(() => { fireEvent.touchEnd(dialog); });
    expect(onClose).toHaveBeenCalledTimes(4);
    // a mostly vertical drag (scrolling the menu) must not close it
    act(() => { fireEvent.touchStart(dialog, { touches: [{ clientX: 300, clientY: 400 }] }); });
    act(() => { fireEvent.touchMove(dialog, { touches: [{ clientX: 280, clientY: 200 }] }); });
    act(() => { fireEvent.touchEnd(dialog); });
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it("stays closed until opened, and offers Log in / Join to signed-out visitors", () => {
    const { container, rerender, getByRole, queryByText } = render(<SideMenu open={false} onClose={() => {}} viewer={null} stats={null} />);
    expect(container.querySelector("dialog")!.hasAttribute("open")).toBe(false);
    rerender(<SideMenu open onClose={() => {}} viewer={null} stats={null} />);
    expect(getByRole("link", { name: "Log in" }).getAttribute("href")).toBe("/login");
    expect(getByRole("link", { name: "Join" })).toBeTruthy();
    expect(queryByText("Switch account")).toBeNull();
    expect(queryByText("Vault")).toBeNull();
  });
});

describe("one feed tab row and Your Topics", () => {
  it("the home feed has exactly two tabs: For You (default) and Friends", async () => {
    const { FeedTabs } = await import("@/components/feed/FeedTabs");
    const { getAllByRole } = render(<FeedTabs active={{ kind: "foryou" }} />);
    const tabs = getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["For You", "Friends"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("href")).toBe("/?tab=friends");
  });

  it("puts picked topics and teams in the side menu as links to their pages", () => {
    const team = { id: "nfl-kc", league: "nfl", abbr: "KC", city: "Kansas City", name: "Chiefs", fullName: "Kansas City Chiefs", primary: "#E31837", secondary: "#FFB81C", logo: null } as never;
    const { getByRole, getByText } = render(<SideMenu open onClose={() => {}} viewer={viewer} stats={stats} topics={[{ kind: "topic", key: "markets", label: "Markets" }, { kind: "team", key: "nfl-kc", label: "Chiefs", team }] as never} />);
    expect(getByText("Your Topics")).toBeTruthy();
    expect(getByRole("link", { name: /Business/ }).getAttribute("href")).toBe("/topics/business");
    expect(getByRole("link", { name: /Chiefs/ }).getAttribute("href")).toBe("/sports/nfl-kc");
    expect(getByRole("button", { name: "Edit" })).toBeTruthy();
  });

  it("lists every topic once in the top nav, linking to topic pages", async () => {
    const { CHANNELS, activeChannel } = await import("@/components/shell/channels");
    expect(CHANNELS.map((c) => c.label)).toEqual(["Politics", "World", "Business", "Tech", "Sports", "Culture", "Markets", "Live", "Desks"]);
    expect(new Set(CHANNELS.map((c) => c.label)).size).toBe(CHANNELS.length);
    expect(CHANNELS[0].href).toBe("/topics/politics");
    expect(activeChannel("/topics/business")).toBe("markets");
    expect(activeChannel("/markets")).toBe("stockboard");
    expect(activeChannel("/")).toBeNull();
  });
});
