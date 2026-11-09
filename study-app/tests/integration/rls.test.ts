/**
 * Row-level security checks against the local Supabase (npx supabase start).
 * Each test signs up two real students and tries to cross the line.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

const URL = "http://127.0.0.1:54321";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

async function student() {
  const c = createClient<Database>(URL, KEY, { auth: { persistSession: false } });
  const email = `rls-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const { data, error } = await c.auth.signUp({ email, password: "password123" });
  if (error) throw error;
  return { c, id: data.user!.id };
}

let a: { c: SupabaseClient<Database>; id: string };
let b: { c: SupabaseClient<Database>; id: string };
let aClass: string;
let aNote: string;
let aQuiz: string;

beforeAll(async () => {
  a = await student();
  b = await student();
  aClass = (await a.c.from("classes").insert({ name: "Chem" }).select().single()).data!.id;
  aNote = (await a.c.from("notes").insert({ title: "Secret notes", class_id: aClass }).select().single()).data!.id;
  await a.c.from("note_pages").insert({ note_id: aNote, page_index: 0, raw_text: "private" });
  aQuiz = (await a.c.from("quiz_sets").insert({ title: "Quiz", note_id: aNote }).select().single()).data!.id;
});

describe("row-level security", () => {
  it("hides other students' rows", async () => {
    for (const t of ["classes", "notes", "note_pages", "quiz_sets"] as const) {
      const { data } = await b.c.from(t).select("id");
      expect(data, t).toEqual([]);
    }
    expect((await a.c.from("notes").select("id")).data).toHaveLength(1);
  });

  it("blocks writes into another student's rows", async () => {
    const upd = await b.c.from("notes").update({ title: "hacked" }).eq("id", aNote).select();
    expect(upd.data).toEqual([]);
    const del = await b.c.from("notes").delete().eq("id", aNote).select();
    expect(del.data).toEqual([]);
    expect((await a.c.from("notes").select("title").eq("id", aNote).single()).data!.title).toBe("Secret notes");
  });

  it("blocks inserting rows owned by someone else", async () => {
    const r = await b.c.from("classes").insert({ name: "x", owner_id: a.id });
    expect(r.error).not.toBeNull();
  });

  it("blocks attaching children to another student's parent", async () => {
    const q = await b.c.from("questions").insert({ quiz_set_id: aQuiz, type: "flashcard", data: { front: "a", back: "b" } });
    expect(q.error).not.toBeNull();
    const p = await b.c.from("note_pages").insert({ note_id: aNote, page_index: 5 });
    expect(p.error).not.toBeNull();
    const t = await b.c.from("topics").insert({ class_id: aClass, name: "x" });
    expect(t.error).not.toBeNull();
  });

  it("keeps page images in each student's own folder", async () => {
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    const own = await a.c.storage.from("note-pages").upload(`${a.id}/n/0.jpg`, blob, { contentType: "image/jpeg" });
    expect(own.error).toBeNull();
    const intrude = await b.c.storage.from("note-pages").upload(`${a.id}/n/evil.jpg`, blob, { contentType: "image/jpeg" });
    expect(intrude.error).not.toBeNull();
    const read = await b.c.storage.from("note-pages").download(`${a.id}/n/0.jpg`);
    expect(read.error).not.toBeNull();
  });

  it("does not let students upgrade their own plan", async () => {
    const r = await a.c.from("profiles").update({ plan: "pro" }).eq("id", a.id);
    expect(r.error).not.toBeNull();
    expect((await a.c.from("profiles").select("plan").eq("id", a.id).single()).data!.plan).toBe("free");
    const ok = await a.c.from("profiles").update({ display_name: "Sam" }).eq("id", a.id);
    expect(ok.error).toBeNull();
  });

  it("does not let students edit or delete usage records", async () => {
    await a.c.from("usage_events").insert({ owner_id: a.id, kind: "page_read" });
    const del = await a.c.from("usage_events").delete().eq("owner_id", a.id).select();
    expect(del.data ?? []).toEqual([]);
    expect((await a.c.from("usage_events").select("id")).data!.length).toBe(1);
  });
});
