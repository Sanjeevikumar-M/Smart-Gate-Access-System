import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeContext(role: "admin" | "operator" | "registered_user"): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 990001,
      openId: `test-${role}`,
      name: "Test User",
      email: "test@example.invalid",
      phone: null,
      loginMethod: "test",
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

describe("gate role protection", () => {
  it("rejects a registered-user attempt to issue a manual gate command", async () => {
    const caller = appRouter.createCaller(makeContext("registered_user"));
    await expect(caller.gate.control({ action: "open" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an operator attempt to change the auto-close configuration", async () => {
    const caller = appRouter.createCaller(makeContext("operator"));
    await expect(caller.gate.configure({ autoCloseTimeoutSeconds: 20 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows an administrator to create, read, update, and remove a managed user", async () => {
    const caller = appRouter.createCaller(makeContext("admin"));
    const name = `CRUD Test ${Date.now()}`;
    const created = await caller.users.create({ name, role: "registered_user" });
    const users = await caller.users.list();
    const record = users.find(item => item.openId === created.openId);
    expect(record?.name).toBe(name);
    if (!record) throw new Error("Created record was not returned by list");
    await caller.users.update({ id: record.id, status: "suspended" });
    await caller.users.remove({ id: record.id });
    const afterRemove = await caller.users.list();
    expect(afterRemove.some(item => item.id === record.id)).toBe(false);
  }, 15000);
});
