import { describe, expect, it } from "vitest";

import { createInMemoryUserStore, normalizeEmail } from "./users";

describe("normalizeEmail", () => {
  it("trims and lower-cases", () => {
    expect(normalizeEmail("  Ada@Example.COM ")).toBe("ada@example.com");
  });
});

describe("createInMemoryUserStore", () => {
  it("creates once per email and refreshes the profile afterwards", async () => {
    const store = createInMemoryUserStore();
    const first = await store.upsertFromIdentity({ email: "Ada@example.com", name: "Ada" });
    const second = await store.upsertFromIdentity({
      email: "ada@example.com",
      image: "https://example.com/ada.png",
    });

    expect(second).toEqual({
      id: first.id,
      email: "ada@example.com",
      name: "Ada",
      image: "https://example.com/ada.png",
    });
    expect(store.users.size).toBe(1);
  });
});
