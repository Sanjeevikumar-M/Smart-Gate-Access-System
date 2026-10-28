import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import {
  authenticateDevice,
  controlGate,
  getDashboardSnapshot,
  getPrimaryDevice,
  processDeviceEvent,
  rotateDeviceToken,
  runSimulationScenario,
  seedGateDemoData,
} from "./gateService";

describe("smart gate service", () => {
  it("authorizes a registered RFID credential and queues a device command in AUTO mode", async () => {
    await seedGateDemoData();
    const db = await getDb();
    if (!db) throw new Error("Database unavailable during test");
    const [admin] = await db.select().from(users).where(eq(users.openId, "demo-admin")).limit(1);
    if (!admin) throw new Error("Seed administrator missing");
    await controlGate({ actorUserId: admin.id, action: "auto" });
    const device = await getPrimaryDevice();
    const result = await processDeviceEvent({
      device,
      eventType: "RFID_SCAN",
      rfidUid: "RFID-ALPHA-001",
    });

    expect(result.authorized).toBe(true);
    expect(result.command?.commandType).toBe("open");
    expect(result.autoCloseTimeoutSeconds).toBeGreaterThanOrEqual(3);
  }, 15000);

  it("rejects an unknown RFID credential without creating an open command", async () => {
    await seedGateDemoData();
    const device = await getPrimaryDevice();
    const result = await processDeviceEvent({
      device,
      eventType: "RFID_SCAN",
      rfidUid: "RFID-TEST-UNKNOWN",
    });

    expect(result.authorized).toBe(false);
    expect(result.command).toBeNull();
  });

  it("returns a database-backed dashboard snapshot after device initialization", async () => {
    await seedGateDemoData();
    const snapshot = await getDashboardSnapshot();

    expect(snapshot.device?.deviceId).toBe("gate-simulator-01");
    expect(snapshot.gate.autoCloseTimeoutSeconds).toBeGreaterThanOrEqual(3);
    expect(snapshot.recentAccess.length).toBeGreaterThan(0);
  });

  it("allows a registered administrator to queue a manual close command", async () => {
    await seedGateDemoData();
    const db = await getDb();
    if (!db) throw new Error("Database unavailable during test");
    const [admin] = await db.select().from(users).where(eq(users.openId, "demo-admin")).limit(1);
    if (!admin) throw new Error("Seed administrator missing");
    const result = await controlGate({ actorUserId: admin.id, action: "close" });

    expect(result.command?.commandType).toBe("close");
    expect(result.mode).toBe("manual_closed");
  });

  it("changes the gate to ALERT when a forced-open event is reported", async () => {
    await seedGateDemoData();
    const device = await getPrimaryDevice();
    await processDeviceEvent({ device, eventType: "FORCED_GATE_OPEN" });
    const snapshot = await getDashboardSnapshot();

    expect(snapshot.gate.gateState).toBe("alert");
  });

  it("accepts only the current rotated device token", async () => {
    await seedGateDemoData();
    const device = await getPrimaryDevice();
    const token = await rotateDeviceToken(device.id);

    await expect(authenticateDevice(device.deviceId, token)).resolves.not.toBeNull();
    await expect(authenticateDevice(device.deviceId, "incorrect-token")).resolves.toBeNull();
  });

  it("runs an unauthorized simulator workflow through the shared gate service", async () => {
    await seedGateDemoData();
    const db = await getDb();
    if (!db) throw new Error("Database unavailable during test");
    const [admin] = await db.select().from(users).where(eq(users.openId, "demo-admin")).limit(1);
    if (!admin) throw new Error("Seed administrator missing");
    const scenario = await runSimulationScenario(admin.id, "unauthorized");
    const snapshot = await getDashboardSnapshot();

    expect(scenario.scenario).toBe("unauthorized");
    expect(snapshot.recentAccess.some(row => row.log.rfidUid === "RFID-UNKNOWN-999" && row.log.result === "denied")).toBe(true);
  }, 15000);
});
