import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/test/db";

import { createPrismaUserStore } from "./prisma-user-store";

describe("createPrismaUserStore", () => {
  let db: TestDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(async () => {
    await db.dispose();
  });

  it("creates a user on first sign-in with a normalized email", async () => {
    const store = createPrismaUserStore(db.prisma);
    const user = await store.upsertFromIdentity({
      email: "  Ada@Example.COM ",
      name: "Ada Lovelace",
      image: "https://example.com/ada.png",
    });

    expect(user).toEqual({
      id: expect.any(String),
      email: "ada@example.com",
      name: "Ada Lovelace",
      image: "https://example.com/ada.png",
    });
    expect(await db.prisma.user.count()).toBe(1);
  });

  it("refreshes the profile on later sign-ins and keeps the same id", async () => {
    const store = createPrismaUserStore(db.prisma);
    const first = await store.upsertFromIdentity({ email: "ada@example.com", name: "Ada" });
    const second = await store.upsertFromIdentity({
      email: "ADA@example.com",
      name: "Ada Lovelace",
      image: "https://example.com/ada.png",
    });

    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Ada Lovelace");
    expect(await db.prisma.user.count()).toBe(1);
  });

  it("does not clear fields the provider omitted", async () => {
    const store = createPrismaUserStore(db.prisma);
    await store.upsertFromIdentity({
      email: "ada@example.com",
      name: "Ada",
      image: "https://example.com/ada.png",
    });
    const user = await store.upsertFromIdentity({ email: "ada@example.com", image: null });

    expect(user.name).toBe("Ada");
    expect(user.image).toBe("https://example.com/ada.png");
  });

  it("is safe under concurrent first sign-ins", async () => {
    const store = createPrismaUserStore(db.prisma);
    const users = await Promise.all(
      Array.from({ length: 5 }, () => store.upsertFromIdentity({ email: "ada@example.com" })),
    );

    expect(new Set(users.map((user) => user.id)).size).toBe(1);
    expect(await db.prisma.user.count()).toBe(1);
  });
});
