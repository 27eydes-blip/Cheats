// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TeamLogo } from "@/components/sports/TeamLogo";

afterEach(cleanup);
const team = { id: "nfl-kc", abbr: "KC", fullName: "Kansas City Chiefs", primary: "#E31837", secondary: "#FFB81C", league: "NFL" as const };

describe("TeamLogo", () => {
  it("draws the generated badge when there is no licensed logo", () => {
    const { container, getByRole } = render(<TeamLogo team={{ ...team, logo: null }} size="md" />);
    expect(container.querySelector("[data-team-logo=badge]")).not.toBeNull();
    expect(getByRole("img", { name: "Kansas City Chiefs" })).toBeTruthy();
    expect(container.textContent).toContain("KC");
  });

  it("lazy-loads the cached logo, and switches to the badge if the image fails", () => {
    const { container } = render(<TeamLogo team={{ ...team, logo: "/api/team-logo/nfl-kc" }} size="lg" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("width")).toBe("64");
    act(() => {
      fireEvent.error(img);
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-team-logo=badge]")).not.toBeNull();
  });

  it("supports small, medium and large sizes", () => {
    for (const [size, px] of [["sm", "22"], ["md", "34"], ["lg", "64"]] as const) {
      const { container } = render(<TeamLogo team={{ ...team, logo: null }} size={size} />);
      expect(container.querySelector("svg")!.getAttribute("width")).toBe(px);
      cleanup();
    }
  });
});
