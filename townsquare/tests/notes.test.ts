import { beforeEach, describe, expect, it } from "vitest";
import { get, now, run } from "@/lib/db";
import { abuseQueue, createNote, flagNote, getNote, notesFor, rateNote, reviewNote, scoreNotes } from "@/lib/notes/notes";
import { createPost, hydrate } from "@/lib/posts";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);
const DAY = 86_400_000;
type U = Awaited<ReturnType<typeof makeUser>>;
/** Users old enough to write notes and to have their ratings counted. */
async function veteran(): Promise<U> {
  const u = await makeUser();
  run("UPDATE users SET created_at = ? WHERE id = ?", [now() - 30 * DAY, u.id]);
  return { ...u, created_at: now() - 30 * DAY };
}
/** Two camps with opposite stances on a run of stories (their "past rating patterns"). */
async function camps(per = 5) {
  const A: U[] = [], B: U[] = [];
  for (let i = 0; i < per; i++) A.push(await veteran()), B.push(await veteran());
  for (let k = 0; k < 8; k++) {
    run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES (?, ?, 'Politics', 'developing', ?, ?)", [`st${k}`, `Story ${k}`, now(), now()]);
    for (const u of A) run("INSERT INTO stances (user_id, target_type, target_id, value, created_at) VALUES (?, 'story', ?, ?, ?)", [u.id, `st${k}`, k % 2 ? "agree" : "disagree", now()]);
    for (const u of B) run("INSERT INTO stances (user_id, target_type, target_id, value, created_at) VALUES (?, 'story', ?, ?, ?)", [u.id, `st${k}`, k % 2 ? "disagree" : "agree", now()]);
  }
  return { A, B };
}

describe("context notes", () => {
  it("enforces source links, length, account age and no notes on your own dispatch", async () => {
    const poster = await veteran();
    const writer = await veteran();
    const post = { id: createPost(poster, { body: "The bridge was closed for 40 years." }) };
    const base = { targetType: "post", targetId: post.id, body: "The bridge reopened in 2019 after repairs, per the city.", sourceUrl: "https://city.example.gov/bridge" };
    expect(() => createNote(writer, { ...base, sourceUrl: "" })).toThrow(/source/i);
    expect(() => createNote(writer, { ...base, sourceUrl: "javascript:alert(1)" })).toThrow(/source/i);
    expect(() => createNote(writer, { ...base, body: "too short" })).toThrow(/at least/);
    expect(() => createNote(writer, { ...base, body: "x".repeat(300) })).toThrow(/under/);
    expect(() => createNote(poster, base)).toThrow(/own dispatch/);
    const newbie = await makeUser();
    expect(() => createNote(newbie, base)).toThrow(/after 3 days/);
    const id = createNote(writer, base);
    expect(() => createNote(writer, base)).toThrow(/already/);
    expect(() => rateNote(writer, id, "helpful", "Cites a good source")).toThrow(/own note/);
    expect(() => rateNote(poster, id, "helpful", "Made-up reason")).toThrow(/reason/);
  });

  it("publishes only when both viewpoint groups find it helpful, and shows it under the dispatch", async () => {
    const { A, B } = await camps();
    const poster = await veteran();
    const post = { id: createPost(poster, { body: "Unemployment hit a record high last month." }) };
    const id = createNote(A[0], { targetType: "post", targetId: post.id, body: "The rate was 4.1%, below the 2020 peak of 14.8%, per BLS data.", sourceUrl: "https://www.bls.gov/example" });
    for (const u of A.slice(1, 5)) rateNote(u, id, "helpful", "Cites a good source");
    expect(getNote(id, null)!.status).toBe("needs_ratings"); // one camp only
    expect(hydrate([post.id], null)[0].note).toBeNull();
    rateNote(B[0], id, "helpful", "Gives important context");
    rateNote(B[1], id, "somewhat", "Partly helpful");
    expect(getNote(id, null)!.status).toBe("published");
    expect(hydrate([post.id], null)[0].note).toMatchObject({ id, sourceDomain: "bls.gov" });
    const n = notesFor("post", post.id, B[2].id);
    expect(n.published).toHaveLength(1);
    expect(n.published[0].groups!.a.n + n.published[0].groups!.b.n).toBe(6);
    // later ratings can take it down again
    for (const u of B.slice(2, 5)) rateNote(u, id, "not_helpful", "Incorrect");
    expect(getNote(id, null)!.status).toBe("needs_ratings");
  });

  it("does not count ratings from brand-new accounts", async () => {
    const { A, B } = await camps();
    const writer = await veteran();
    run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES ('s', 'S', 'US', 'developing', ?, ?)", [now(), now()]);
    const id = createNote(writer, { targetType: "story", targetId: "s", body: "Officials later revised the count to 12 injured.", sourceUrl: "https://example.gov/update" });
    for (const u of A.slice(0, 3)) rateNote(u, id, "helpful", "Cites a good source");
    const fresh: U[] = [];
    for (let i = 0; i < 3; i++) fresh.push(await makeUser());
    for (const u of fresh) rateNote(u, id, "helpful", "Cites a good source");
    expect(getNote(id, null)!.status).toBe("needs_ratings");
    for (const u of B.slice(0, 2)) rateNote(u, id, "helpful", "Neutral wording");
    expect(getNote(id, null)!.status).toBe("published");
  });

  it("rate-limits ratings and hides notes with several abuse flags until reviewed", async () => {
    const admin = await veteran();
    run("UPDATE users SET role = 'admin' WHERE id = ?", [admin.id]);
    const writer = await veteran();
    run("INSERT INTO stories (key, title, section, status, created_at, updated_at) VALUES ('s', 'S', 'US', 'developing', ?, ?)", [now(), now()]);
    const id = createNote(writer, { targetType: "story", targetId: "s", body: "This note is here to be flagged by people.", sourceUrl: "https://example.com/x" });
    run("UPDATE context_notes SET status = 'published' WHERE id = ?", [id]);
    for (let i = 0; i < 3; i++) flagNote(await veteran(), id, "Spam");
    expect(notesFor("story", "s", null).published).toHaveLength(0);
    expect(abuseQueue().flagged[0]).toMatchObject({ id, reasons: "Spam · Spam · Spam" });
    reviewNote({ ...admin, role: "admin" }, id, "remove");
    expect(getNote(id, null)!.status).toBe("removed");
    expect(abuseQueue().flagged).toHaveLength(0);

    const rater = await veteran();
    const notes: string[] = [];
    for (let i = 0; i < 31; i++) {
      run("INSERT INTO context_notes (id, author_id, target_type, target_id, body, source_url, created_at) VALUES (?, ?, 'story', 's', 'n', 'https://e.com', ?)", [`n${i}`, writer.id, now()]);
      notes.push(`n${i}`);
    }
    for (let i = 0; i < 30; i++) rateNote(rater, notes[i], "helpful", "Easy to understand");
    expect(() => rateNote(rater, notes[30], "helpful", "Easy to understand")).toThrow(/too often/);
    expect(get<{ n: number }>("SELECT count(*) n FROM note_ratings WHERE rater_id = ?", [rater.id])!.n).toBe(30);
    expect(scoreNotes()).toBeInstanceOf(Array);
  });
});
