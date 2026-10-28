import { and, desc, eq, gte, like, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { accessLogs, devices, gateEvents, rfidCards, users } from "../drizzle/schema";
import {
  acknowledgeDeviceCommand,
  controlGate,
  getAnalyticsSummary,
  getDashboardSnapshot,
  getPrimaryDevice,
  getSettings,
  runSimulationScenario,
  seedGateDemoData,
  updateGateConfiguration,
  rotateDeviceToken,
} from "./gateService";
import { getDb, getGateUsers, getRfidDirectory } from "./db";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, operatorProcedure, publicProcedure, router } from "./_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db;
}

async function ensureDemoData() {
  await seedGateDemoData();
}

const accessFilterSchema = z.object({
  query: z.string().max(128).optional(),
  result: z.enum(["authorized", "denied", "error"]).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    snapshot: operatorProcedure.query(async () => {
      await ensureDemoData();
      return getDashboardSnapshot();
    }),
  }),
  gate: router({
    status: operatorProcedure.query(async () => {
      await ensureDemoData();
      const [settings, device] = await Promise.all([getSettings(), getPrimaryDevice()]);
      return { settings, device };
    }),
    control: operatorProcedure
      .input(z.object({ action: z.enum(["open", "close", "auto"]) }))
      .mutation(async ({ ctx, input }) => {
        await ensureDemoData();
        return controlGate({ actorUserId: ctx.user.id, action: input.action });
      }),
    configure: adminProcedure
      .input(z.object({ autoCloseTimeoutSeconds: z.number().int().min(3).max(300) }))
      .mutation(async ({ ctx, input }) => {
        await ensureDemoData();
        await updateGateConfiguration(ctx.user.id, input.autoCloseTimeoutSeconds);
        return getSettings();
      }),
  }),
  users: router({
    list: adminProcedure.query(async () => {
      await ensureDemoData();
      return getGateUsers();
    }),
    create: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          email: z.string().email().max(320).optional().or(z.literal("")),
          phone: z.string().trim().max(30).optional(),
          role: z.enum(["admin", "operator", "registered_user"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const openId = `managed-${nanoid(14)}`;
        await db.insert(users).values({
          openId,
          name: input.name,
          email: input.email || null,
          phone: input.phone || null,
          role: input.role,
          status: "active",
          loginMethod: "managed-record",
          lastSignedIn: new Date(),
        });
        return { success: true, openId };
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number().int().positive(),
          name: z.string().trim().min(2).max(160).optional(),
          email: z.string().email().max(320).nullable().optional(),
          phone: z.string().trim().max(30).nullable().optional(),
          role: z.enum(["admin", "operator", "registered_user"]).optional(),
          status: z.enum(["active", "suspended", "revoked"]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        const { id, ...changes } = input;
        await db.update(users).set(changes).where(eq(users.id, id));
        return { success: true };
      }),
    remove: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.id === input.id) throw new Error("An administrator cannot delete the active session identity");
        const db = await requireDb();
        await db.delete(users).where(eq(users.id, input.id));
        return { success: true };
      }),
  }),
  rfid: router({
    list: operatorProcedure.query(async () => {
      await ensureDemoData();
      return getRfidDirectory();
    }),
    register: adminProcedure
      .input(
        z.object({
          rfidUid: z.string().trim().min(3).max(128),
          userId: z.number().int().positive(),
          label: z.string().trim().max(120).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.insert(rfidCards).values({
          rfidUid: input.rfidUid,
          userId: input.userId,
          label: input.label || null,
          status: "active",
        });
        return { success: true };
      }),
    updateStatus: adminProcedure
      .input(z.object({ id: z.number().int().positive(), status: z.enum(["active", "suspended", "lost", "revoked"]) }))
      .mutation(async ({ input }) => {
        const db = await requireDb();
        await db.update(rfidCards).set({ status: input.status }).where(eq(rfidCards.id, input.id));
        return { success: true };
      }),
  }),
  access: router({
    logs: operatorProcedure.input(accessFilterSchema).query(async ({ input }) => {
      await ensureDemoData();
      const db = await requireDb();
      const conditions = [];
      if (input.result) conditions.push(eq(accessLogs.result, input.result));
      if (input.query) {
        conditions.push(
          sql`(${accessLogs.rfidUid} LIKE ${`%${input.query}%`} OR ${users.name} LIKE ${`%${input.query}%`})`
        );
      }
      return db
        .select({ log: accessLogs, userName: users.name, deviceName: devices.deviceName })
        .from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .leftJoin(devices, eq(accessLogs.deviceId, devices.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(accessLogs.occurredAt))
        .limit(input.limit);
    }),
  }),
  alerts: router({
    list: operatorProcedure
      .input(z.object({ includeResolved: z.boolean().default(false) }))
      .query(async ({ input }) => {
        await ensureDemoData();
        const db = await requireDb();
        return db
          .select({ event: gateEvents, deviceName: devices.deviceName })
          .from(gateEvents)
          .leftJoin(devices, eq(gateEvents.deviceId, devices.id))
          .where(input.includeResolved ? undefined : eq(gateEvents.resolved, false))
          .orderBy(desc(gateEvents.occurredAt))
          .limit(100);
      }),
    resolve: operatorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await requireDb();
      await db.update(gateEvents).set({ resolved: true, resolvedAt: new Date() }).where(eq(gateEvents.id, input.id));
      return { success: true };
    }),
  }),
  devices: router({
    list: operatorProcedure.query(async () => {
      await ensureDemoData();
      const db = await requireDb();
      return db.select().from(devices).orderBy(desc(devices.lastSeenAt));
    }),
    sensorReadings: operatorProcedure
      .input(z.object({ deviceId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const db = await requireDb();
        return db.execute(sql`SELECT * FROM sensor_readings WHERE deviceId = ${input.deviceId} ORDER BY occurredAt DESC LIMIT 50`);
      }),
    rotateToken: adminProcedure
      .input(z.object({ deviceId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const deviceToken = await rotateDeviceToken(input.deviceId);
        return { deviceToken };
      }),
  }),
  analytics: router({
    summary: operatorProcedure.query(async () => {
      await ensureDemoData();
      return getAnalyticsSummary();
    }),
  }),
  simulator: router({
    run: operatorProcedure
      .input(z.object({ scenario: z.enum(["authorized", "unauthorized", "forced_open", "offline", "apply_commands"]) }))
      .mutation(async ({ ctx, input }) => {
        await ensureDemoData();
        return runSimulationScenario(ctx.user.id, input.scenario);
      }),
    acknowledge: operatorProcedure
      .input(z.object({ commandId: z.string().min(4), success: z.boolean() }))
      .mutation(async ({ input }) => {
        await ensureDemoData();
        const device = await getPrimaryDevice();
        return acknowledgeDeviceCommand(device, input.commandId, input.success);
      }),
  }),
});

export type AppRouter = typeof appRouter;
