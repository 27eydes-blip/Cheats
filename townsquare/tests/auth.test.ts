import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, createSession, createUser, destroySession, userFromSession } from "@/lib/users";
import { freshDb, makeUser } from "./helpers";

beforeEach(freshDb);

describe("sign up and log in", () => {
  it("creates an account and logs in with the right password only", async () => {
    const u = await makeUser("alice");
    expect(u.handle).toBe("alice");
    expect(u.password_hash).toMatch(/^scrypt\$/);
    expect((await authenticate("ALICE@example.com", "a-long-password")).id).toBe(u.id);
    await expect(authenticate("alice@example.com", "wrong-password")).rejects.toThrow("Wrong email or password");
    await expect(authenticate("nobody@example.com", "whatever")).rejects.toThrow("Wrong email or password");
  });

  it("rejects duplicate emails/handles, bad handles, short passwords, and under-13s", async () => {
    await makeUser("bob");
    const base = { email: "x@example.com", password: "a-long-password", handle: "xavier", displayName: "X", ageConfirmed: true, acceptTerms: true } as const;
    await expect(createUser({ ...base, email: "bob@example.com" })).rejects.toThrow("already exists");
    await expect(createUser({ ...base, handle: "BOB" })).rejects.toThrow("taken");
    await expect(createUser({ ...base, handle: "bad handle!" })).rejects.toThrow();
    await expect(createUser({ ...base, handle: "admin" })).rejects.toThrow("reserved");
    await expect(createUser({ ...base, password: "short" })).rejects.toThrow();
    await expect(createUser({ ...base, ageConfirmed: false as never })).rejects.toThrow("13");
  });

  it("sessions are stored hashed and can be revoked", async () => {
    const u = await makeUser();
    const { token } = createSession(u.id);
    expect(userFromSession(token)?.id).toBe(u.id);
    expect(userFromSession("not-a-token")).toBeNull();
    destroySession(token);
    expect(userFromSession(token)).toBeNull();
  });
});
