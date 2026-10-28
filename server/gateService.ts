import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash, timingSafeEqual } from "node:crypto";
import {
  accessLogs,
  devices,
  gateCommands,
  gateEvents,
  gateSettings,
  rfidCards,
  sensorReadings,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { publishGateUpdate } from "./liveUpdates";

export const DEVICE_EVENT_TYPES = [
  "RFID_SCAN",
  "AUTHORIZED_ACCESS",
  "UNAUTHORIZED_ACCESS",
  "VEHICLE_DETECTED",
  "GATE_OPEN",
  "GATE_CLOSE",
  "FORCED_GATE_OPEN",
  "DEVICE_ONLINE",
  "DEVICE_OFFLINE",
] as const;

export type DeviceEventType = (typeof DEVICE_EVENT_TYPES)[number];

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("Database connection is not available");
  return db;
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function subtractDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export async function getSettings() {
  const db = requireDb(await getDb());
  const existing = await db.select().from(gateSettings).limit(1);
  if (existing[0]) return existing[0];
  await db.insert(gateSettings).values({
    gateMode: "auto",
    gateState: "closed",
    autoCloseTimeoutSeconds: 12,
  });
  const created = await db.select().from(gateSettings).limit(1);
  if (!created[0]) throw new Error("Unable to initialize gate settings");
  return created[0];
}

export async function getDeviceByPublicId(deviceId: string) {
  const db = requireDb(await getDb());
  const result = await db.select().from(devices).where(eq(devices.deviceId, deviceId)).limit(1);
  return result[0] ?? null;
}

export async function authenticateDevice(deviceId: string, deviceToken: string) {
  const device = await getDeviceByPublicId(deviceId);
  if (!device || !deviceToken) return null;
  const supplied = Buffer.from(hashDeviceToken(deviceToken), "utf8");
  const stored = Buffer.from(device.deviceTokenHash, "utf8");
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) return null;
  return device;
}

async function createEvent(input: {
  deviceId?: number | null;
  actorUserId?: number | null;
  eventType: string;
  severity: "info" | "warning" | "critical";
  description: string;
  metadata?: Record<string, unknown>;
}) {
  const db = requireDb(await getDb());
  await db.insert(gateEvents).values({
    deviceId: input.deviceId ?? null,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    severity: input.severity,
    description: input.description,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

async function touchDevice(deviceId: number, status: "online" | "offline" | "warning" | "maintenance" = "online") {
  const db = requireDb(await getDb());
  await db.update(devices).set({ status, lastSeenAt: new Date() }).where(eq(devices.id, deviceId));
}

async function enqueueCommand(input: {
  deviceId: number;
  requestedByUserId?: number | null;
  commandType: "open" | "close" | "set_auto" | "buzzer" | "led";
  source: "authorized_access" | "manual" | "system";
  payload?: Record<string, unknown>;
}) {
  const db = requireDb(await getDb());
  const commandId = nanoid(16);
  await db.insert(gateCommands).values({
    commandId,
    deviceId: input.deviceId,
    requestedByUserId: input.requestedByUserId ?? null,
    commandType: input.commandType,
    source: input.source,
    payload: input.payload ? JSON.stringify(input.payload) : null,
  });
  return { commandId, ...input };
}

export async function getPrimaryDevice() {
  const db = requireDb(await getDb());
  const existing = await db.select().from(devices).orderBy(desc(devices.lastSeenAt)).limit(1);
  if (!existing[0]) throw new Error("No gate device is registered");
  return existing[0];
}

async function flagRepeatedDenials(deviceId: number, rfidUid: string) {
  const db = requireDb(await getDb());
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const denied = await db
    .select({ id: accessLogs.id })
    .from(accessLogs)
    .where(
      and(
        eq(accessLogs.deviceId, deviceId),
        eq(accessLogs.rfidUid, rfidUid),
        eq(accessLogs.result, "denied"),
        gte(accessLogs.occurredAt, fiveMinutesAgo)
      )
    );
  if (denied.length >= 3) {
    await createEvent({
      deviceId,
      eventType: "REPEATED_UNAUTHORIZED_ACCESS",
      severity: "critical",
      description: `Repeated denied RFID scans detected for ${rfidUid}.`,
      metadata: { rfidUid, attemptsInFiveMinutes: denied.length },
    });
  }
}

async function authorizeRfid(device: typeof devices.$inferSelect, rfidUid: string) {
  const db = requireDb(await getDb());
  const settings = await getSettings();
  const cardRows = await db
    .select({ card: rfidCards, user: users })
    .from(rfidCards)
    .leftJoin(users, eq(rfidCards.userId, users.id))
    .where(eq(rfidCards.rfidUid, rfidUid))
    .limit(1);
  const record = cardRows[0];
  const authorized = Boolean(record?.card && record.card.status === "active" && record.user?.status === "active");

  if (!authorized || !record?.user) {
    await db.insert(accessLogs).values({
      deviceId: device.id,
      rfidUid,
      accessType: "entry",
      result: "denied",
      reason: "Unknown, inactive, or revoked RFID credential",
      gateState: settings.gateState,
    });
    await createEvent({
      deviceId: device.id,
      eventType: "UNAUTHORIZED_RFID",
      severity: "warning",
      description: `Access denied for RFID ${rfidUid}.`,
      metadata: { rfidUid },
    });
    await flagRepeatedDenials(device.id, rfidUid);
    publishGateUpdate({ type: "access_denied", deviceId: device.deviceId, rfidUid });
    return { authorized: false, reason: "RFID is not authorized", command: null, autoCloseTimeoutSeconds: null };
  }

  await db.insert(accessLogs).values({
    userId: record.user.id,
    deviceId: device.id,
    rfidUid,
    accessType: "entry",
    result: "authorized",
    reason: "Active RFID credential matched a registered user",
    gateState: settings.gateMode === "auto" ? "opening" : settings.gateState,
  });
  await db.update(rfidCards).set({ lastUsedAt: new Date() }).where(eq(rfidCards.id, record.card.id));

  let command: Awaited<ReturnType<typeof enqueueCommand>> | null = null;
  if (settings.gateMode === "auto") {
    command = await enqueueCommand({
      deviceId: device.id,
      commandType: "open",
      source: "authorized_access",
      payload: { autoCloseTimeoutSeconds: settings.autoCloseTimeoutSeconds, rfidUid, userId: record.user.id },
    });
    await db
      .update(gateSettings)
      .set({ gateState: "opening", updatedByUserId: null })
      .where(eq(gateSettings.id, settings.id));
  }
  await createEvent({
    deviceId: device.id,
    actorUserId: record.user.id,
    eventType: "AUTHORIZED_ACCESS",
    severity: "info",
    description: `${record.user.name ?? "Registered user"} was authorized by RFID.`,
    metadata: { rfidUid, autoMode: settings.gateMode === "auto" },
  });
  publishGateUpdate({ type: "access_authorized", deviceId: device.deviceId, userId: record.user.id, commandId: command?.commandId });
  return {
    authorized: true,
    user: { id: record.user.id, name: record.user.name, role: record.user.role },
    command,
    autoCloseTimeoutSeconds: settings.autoCloseTimeoutSeconds,
  };
}

export async function processDeviceEvent(input: {
  device: typeof devices.$inferSelect;
  eventType: DeviceEventType;
  rfidUid?: string;
  sensorValue?: string;
  commandId?: string;
}) {
  const { device, eventType } = input;
  await touchDevice(device.id, eventType === "DEVICE_OFFLINE" ? "offline" : "online");
  const db = requireDb(await getDb());
  const settings = await getSettings();

  if (eventType === "DEVICE_ONLINE") {
    await createEvent({ deviceId: device.id, eventType, severity: "info", description: `${device.deviceName} is online.` });
  }
  if (eventType === "DEVICE_OFFLINE") {
    await createEvent({ deviceId: device.id, eventType: "COMMUNICATION_FAILURE", severity: "warning", description: `${device.deviceName} reported offline.` });
  }
  if (eventType === "VEHICLE_DETECTED") {
    await db.insert(sensorReadings).values({
      deviceId: device.id,
      sensorType: "infrared",
      sensorValue: input.sensorValue ?? "presence_detected",
    });
    await createEvent({ deviceId: device.id, eventType, severity: "info", description: "Presence detected; RFID identification window opened." });
  }
  if (eventType === "RFID_SCAN") {
    if (!input.rfidUid) throw new Error("RFID_SCAN requires an RFID UID");
    await db.insert(sensorReadings).values({ deviceId: device.id, sensorType: "rfid", sensorValue: input.rfidUid });
    return authorizeRfid(device, input.rfidUid);
  }
  if (eventType === "UNAUTHORIZED_ACCESS") {
    const rfidUid = input.rfidUid ?? "UNSPECIFIED";
    await db.insert(accessLogs).values({
      deviceId: device.id,
      rfidUid,
      accessType: "entry",
      result: "denied",
      reason: "Device-reported unauthorized access",
      gateState: settings.gateState,
    });
    await createEvent({ deviceId: device.id, eventType, severity: "warning", description: `Unauthorized access reported for ${rfidUid}.` });
  }
  if (eventType === "GATE_OPEN") {
    const openedAt = new Date();
    const autoCloseDueAt = settings.gateMode === "auto"
      ? new Date(openedAt.getTime() + settings.autoCloseTimeoutSeconds * 1000)
      : null;
    await db
      .update(gateSettings)
      .set({ gateState: "open", openedAt, autoCloseDueAt })
      .where(eq(gateSettings.id, settings.id));
    if (input.commandId) {
      await db.update(gateCommands).set({ status: "acknowledged", completedAt: openedAt }).where(eq(gateCommands.commandId, input.commandId));
    }
    await createEvent({ deviceId: device.id, eventType, severity: "info", description: "Gate open position confirmed by device." });
  }
  if (eventType === "GATE_CLOSE") {
    const closedAt = new Date();
    await db
      .update(gateSettings)
      .set({ gateState: "closed", openedAt: null, autoCloseDueAt: null })
      .where(eq(gateSettings.id, settings.id));
    if (input.commandId) {
      await db.update(gateCommands).set({ status: "acknowledged", completedAt: closedAt }).where(eq(gateCommands.commandId, input.commandId));
    }
    await createEvent({ deviceId: device.id, eventType, severity: "info", description: "Gate closed position confirmed by device." });
  }
  if (eventType === "FORCED_GATE_OPEN") {
    await db
      .update(gateSettings)
      .set({ gateState: "alert", autoCloseDueAt: null })
      .where(eq(gateSettings.id, settings.id));
    await createEvent({
      deviceId: device.id,
      eventType,
      severity: "critical",
      description: "Gate forced-open condition detected; automatic opening is suspended pending operator review.",
    });
  }
  publishGateUpdate({ type: "device_event", deviceId: device.deviceId, eventType });
  return { authorized: null, command: null, autoCloseTimeoutSeconds: null };
}

export async function pollDeviceCommands(device: typeof devices.$inferSelect) {
  const db = requireDb(await getDb());
  await touchDevice(device.id);
  const pending = await db
    .select()
    .from(gateCommands)
    .where(and(eq(gateCommands.deviceId, device.id), eq(gateCommands.status, "pending")))
    .orderBy(gateCommands.requestedAt)
    .limit(10);
  if (pending.length) {
    await db
      .update(gateCommands)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(inArray(gateCommands.id, pending.map(command => command.id)));
  }
  return pending.map(command => ({ ...command, status: "delivered" as const }));
}

export async function acknowledgeDeviceCommand(device: typeof devices.$inferSelect, commandId: string, success: boolean) {
  const db = requireDb(await getDb());
  const command = await db
    .select()
    .from(gateCommands)
    .where(and(eq(gateCommands.commandId, commandId), eq(gateCommands.deviceId, device.id)))
    .limit(1);
  if (!command[0]) throw new Error("Unknown command for this device");
  await db
    .update(gateCommands)
    .set({ status: success ? "acknowledged" : "failed", completedAt: new Date() })
    .where(eq(gateCommands.id, command[0].id));
  if (!success) {
    await createEvent({
      deviceId: device.id,
      eventType: "COMMAND_FAILURE",
      severity: "warning",
      description: `Device could not complete ${command[0].commandType} command ${commandId}.`,
    });
  }
  publishGateUpdate({ type: "command_acknowledged", deviceId: device.deviceId, commandId, success });
  return command[0];
}

/** Generates a new opaque device credential and stores only its SHA-256 verifier. */
export async function rotateDeviceToken(deviceId: number) {
  const db = requireDb(await getDb());
  const deviceToken = nanoid(40);
  await db.update(devices).set({ deviceTokenHash: hashDeviceToken(deviceToken) }).where(eq(devices.id, deviceId));
  await createEvent({
    deviceId,
    eventType: "DEVICE_TOKEN_ROTATED",
    severity: "info",
    description: "A device authentication token was rotated by an administrator.",
  });
  return deviceToken;
}

export async function controlGate(input: {
  actorUserId: number;
  action: "open" | "close" | "auto";
}) {
  const db = requireDb(await getDb());
  const settings = await getSettings();
  const device = await getPrimaryDevice();
  if (input.action === "auto") {
    await db.update(gateSettings).set({ gateMode: "auto", updatedByUserId: input.actorUserId }).where(eq(gateSettings.id, settings.id));
    await createEvent({ actorUserId: input.actorUserId, deviceId: device.id, eventType: "MODE_AUTO", severity: "info", description: "Administrator enabled automatic gate control." });
    publishGateUpdate({ type: "mode_changed", mode: "auto" });
    return { command: null, mode: "auto" as const };
  }
  const command = await enqueueCommand({
    deviceId: device.id,
    requestedByUserId: input.actorUserId,
    commandType: input.action,
    source: "manual",
    payload: { requestedBy: input.actorUserId },
  });
  await db
    .update(gateSettings)
    .set({
      gateMode: input.action === "open" ? "manual_open" : "manual_closed",
      gateState: input.action === "open" ? "opening" : "closing",
      updatedByUserId: input.actorUserId,
    })
    .where(eq(gateSettings.id, settings.id));
  await createEvent({
    actorUserId: input.actorUserId,
    deviceId: device.id,
    eventType: `MANUAL_${input.action.toUpperCase()}`,
    severity: "info",
    description: `Authorized manual ${input.action} command queued for ${device.deviceName}.`,
    metadata: { commandId: command.commandId },
  });
  publishGateUpdate({ type: "manual_command", action: input.action, commandId: command.commandId });
  return { command, mode: input.action === "open" ? "manual_open" as const : "manual_closed" as const };
}

export async function updateGateConfiguration(actorUserId: number, autoCloseTimeoutSeconds: number) {
  if (autoCloseTimeoutSeconds < 3 || autoCloseTimeoutSeconds > 300) {
    throw new Error("Auto-close timeout must be between 3 and 300 seconds");
  }
  const db = requireDb(await getDb());
  const settings = await getSettings();
  await db
    .update(gateSettings)
    .set({ autoCloseTimeoutSeconds, updatedByUserId: actorUserId })
    .where(eq(gateSettings.id, settings.id));
  await createEvent({
    actorUserId,
    eventType: "CONFIGURATION_CHANGED",
    severity: "info",
    description: `Auto-close timeout changed to ${autoCloseTimeoutSeconds} seconds.`,
  });
  publishGateUpdate({ type: "configuration_changed", autoCloseTimeoutSeconds });
}

export async function runSimulationScenario(actorUserId: number, scenario: "authorized" | "unauthorized" | "forced_open" | "offline" | "apply_commands") {
  const device = await getPrimaryDevice();
  if (scenario === "authorized") {
    await processDeviceEvent({ device, eventType: "DEVICE_ONLINE" });
    await processDeviceEvent({ device, eventType: "VEHICLE_DETECTED", sensorValue: "0.42m" });
    const result = await processDeviceEvent({ device, eventType: "RFID_SCAN", rfidUid: "RFID-ALPHA-001" });
    const commands = await pollDeviceCommands(device);
    const open = commands.find(command => command.commandType === "open");
    if (open) await processDeviceEvent({ device, eventType: "GATE_OPEN", commandId: open.commandId });
    return { scenario, result, commands };
  }
  if (scenario === "unauthorized") {
    await processDeviceEvent({ device, eventType: "VEHICLE_DETECTED", sensorValue: "0.38m" });
    const result = await processDeviceEvent({ device, eventType: "RFID_SCAN", rfidUid: "RFID-UNKNOWN-999" });
    return { scenario, result, commands: [] };
  }
  if (scenario === "forced_open") {
    const result = await processDeviceEvent({ device, eventType: "FORCED_GATE_OPEN" });
    return { scenario, result, commands: [] };
  }
  if (scenario === "offline") {
    const result = await processDeviceEvent({ device, eventType: "DEVICE_OFFLINE" });
    return { scenario, result, commands: [] };
  }
  const commands = await pollDeviceCommands(device);
  for (const command of commands) {
    await processDeviceEvent({
      device,
      eventType: command.commandType === "open" ? "GATE_OPEN" : command.commandType === "close" ? "GATE_CLOSE" : "DEVICE_ONLINE",
      commandId: command.commandId,
    });
  }
  await createEvent({ actorUserId, deviceId: device.id, eventType: "SIMULATOR_APPLIED_COMMANDS", severity: "info", description: "Simulator polled and applied pending commands." });
  return { scenario, result: null, commands };
}

export async function getDashboardSnapshot() {
  await seedGateDemoData();
  const db = requireDb(await getDb());
  const settings = await getSettings();
  const today = startOfToday();
  const [device] = await db.select().from(devices).orderBy(desc(devices.lastSeenAt)).limit(1);
  const countRows = await db
    .select({ result: accessLogs.result, total: sql<number>`count(*)` })
    .from(accessLogs)
    .where(gte(accessLogs.occurredAt, today))
    .groupBy(accessLogs.result);
  const counts = { total: 0, authorized: 0, denied: 0 };
  for (const row of countRows) {
    const total = Number(row.total);
    counts.total += total;
    if (row.result === "authorized") counts.authorized = total;
    if (row.result === "denied") counts.denied = total;
  }
  const [activeAlertCount] = await db
    .select({ total: sql<number>`count(*)` })
    .from(gateEvents)
    .where(and(eq(gateEvents.resolved, false), inArray(gateEvents.severity, ["warning", "critical"])));
  const recentAccess = await db
    .select({ log: accessLogs, userName: users.name })
    .from(accessLogs)
    .leftJoin(users, eq(accessLogs.userId, users.id))
    .orderBy(desc(accessLogs.occurredAt))
    .limit(8);
  const alerts = await db
    .select()
    .from(gateEvents)
    .where(and(eq(gateEvents.resolved, false), inArray(gateEvents.severity, ["warning", "critical"])))
    .orderBy(desc(gateEvents.occurredAt))
    .limit(6);
  return {
    gate: settings,
    device: device ?? null,
    metrics: { ...counts, activeAlerts: Number(activeAlertCount?.total ?? 0) },
    recentAccess,
    alerts,
    generatedAt: new Date(),
  };
}

export async function getAnalyticsSummary() {
  const db = requireDb(await getDb());
  const since = subtractDays(6);
  const logs = await db.select().from(accessLogs).where(gte(accessLogs.occurredAt, since)).orderBy(accessLogs.occurredAt);
  const events = await db.select().from(gateEvents).where(gte(gateEvents.occurredAt, since)).orderBy(gateEvents.occurredAt);
  const daily = new Map<string, { date: string; authorized: number; denied: number }>();
  for (let index = 6; index >= 0; index--) {
    const date = subtractDays(index).toISOString().slice(0, 10);
    daily.set(date, { date, authorized: 0, denied: 0 });
  }
  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour: `${String(hour).padStart(2, "0")}:00`, accesses: 0 }));
  for (const log of logs) {
    const key = log.occurredAt.toISOString().slice(0, 10);
    const day = daily.get(key);
    if (day) {
      if (log.result === "authorized") day.authorized++;
      if (log.result === "denied") day.denied++;
    }
    hourly[log.occurredAt.getHours()]!.accesses++;
  }
  const severity = { info: 0, warning: 0, critical: 0 };
  for (const event of events) severity[event.severity]++;
  const settings = await getSettings();
  const openDurationSeconds = settings.openedAt ? Math.round((Date.now() - settings.openedAt.getTime()) / 1000) : 0;
  return {
    daily: Array.from(daily.values()),
    authorization: [
      { name: "Authorized", value: logs.filter(log => log.result === "authorized").length },
      { name: "Denied", value: logs.filter(log => log.result === "denied").length },
    ],
    hourly,
    securityEvents: Object.entries(severity).map(([name, value]) => ({ name, value })),
    gateOpenDuration: { seconds: openDurationSeconds, status: settings.gateState },
  };
}

export async function seedGateDemoData() {
  const db = requireDb(await getDb());
  const existing = await db.select({ total: sql<number>`count(*)` }).from(devices);
  if (Number(existing[0]?.total ?? 0) > 0) return;
  const now = new Date();
  await db.insert(users).values([
    { openId: "demo-admin", name: "Demo Administrator", email: "admin@example.invalid", role: "admin", status: "active", loginMethod: "seed", lastSignedIn: now },
    { openId: "demo-operator", name: "Security Operator", email: "operator@example.invalid", role: "operator", status: "active", loginMethod: "seed", lastSignedIn: now },
    { openId: "demo-visitor-alex", name: "Alex Johnson", email: "alex@example.invalid", role: "registered_user", status: "active", loginMethod: "seed", lastSignedIn: now },
    { openId: "demo-visitor-priya", name: "Priya Raman", email: "priya@example.invalid", role: "registered_user", status: "active", loginMethod: "seed", lastSignedIn: now },
    { openId: "demo-visitor-mateo", name: "Mateo Silva", email: "mateo@example.invalid", role: "registered_user", status: "active", loginMethod: "seed", lastSignedIn: now },
  ]);
  const seededUsers = await db.select().from(users).where(inArray(users.openId, ["demo-admin", "demo-operator", "demo-visitor-alex", "demo-visitor-priya", "demo-visitor-mateo"]));
  const byOpenId = new Map(seededUsers.map(user => [user.openId, user]));
  await db.insert(devices).values({
    deviceId: "gate-simulator-01",
    deviceName: "Main Gate Simulator",
    location: "Campus Main Entrance",
    deviceTokenHash: hashDeviceToken(nanoid(40)),
    status: "online",
    connectionType: "simulator",
    firmwareVersion: "sim-1.0.0",
    lastSeenAt: now,
  });
  const device = await getPrimaryDevice();
  await getSettings();
  const cardSeed = [
    ["RFID-ALPHA-001", "demo-visitor-alex", "Alex entry card"],
    ["RFID-BRAVO-002", "demo-visitor-priya", "Priya entry card"],
    ["RFID-CHARLIE-003", "demo-visitor-mateo", "Mateo entry card"],
  ] as const;
  await db.insert(rfidCards).values(
    cardSeed.map(([rfidUid, openId, label]) => ({ rfidUid, userId: byOpenId.get(openId)?.id ?? null, label, status: "active" as const }))
  );
  const alex = byOpenId.get("demo-visitor-alex");
  const priya = byOpenId.get("demo-visitor-priya");
  if (alex && priya) {
    await db.insert(accessLogs).values([
      { userId: alex.id, deviceId: device.id, rfidUid: "RFID-ALPHA-001", accessType: "entry", result: "authorized", reason: "Seeded simulation record", gateState: "closed", occurredAt: new Date(Date.now() - 75 * 60 * 1000) },
      { userId: priya.id, deviceId: device.id, rfidUid: "RFID-BRAVO-002", accessType: "entry", result: "authorized", reason: "Seeded simulation record", gateState: "closed", occurredAt: new Date(Date.now() - 42 * 60 * 1000) },
      { deviceId: device.id, rfidUid: "RFID-UNKNOWN-999", accessType: "entry", result: "denied", reason: "Unknown RFID", gateState: "closed", occurredAt: new Date(Date.now() - 18 * 60 * 1000) },
    ]);
  }
  await db.insert(gateEvents).values([
    { deviceId: device.id, eventType: "DEVICE_ONLINE", severity: "info", description: "Simulator device initialized for demonstration data." },
    { deviceId: device.id, eventType: "UNAUTHORIZED_RFID", severity: "warning", description: "Seeded unauthorized RFID event requires review.", resolved: false },
  ]);
  await db.insert(sensorReadings).values([
    { deviceId: device.id, sensorType: "infrared", sensorValue: "presence_detected", quality: "normal" },
    { deviceId: device.id, sensorType: "ultrasonic", sensorValue: "0.46m", quality: "normal" },
    { deviceId: device.id, sensorType: "reed_switch", sensorValue: "closed", quality: "normal" },
  ]);
}
