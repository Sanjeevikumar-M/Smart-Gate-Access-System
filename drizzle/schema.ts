import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Human identities authenticated through the platform session flow. */
export const users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 160 }),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 30 }),
    loginMethod: varchar("loginMethod", { length: 64 }),
    role: mysqlEnum("role", ["admin", "operator", "registered_user"])
      .default("registered_user")
      .notNull(),
    status: mysqlEnum("status", ["active", "suspended", "revoked"])
      .default("active")
      .notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  },
  table => [index("users_role_idx").on(table.role, table.status)]
);

/** RFID identifiers are stored independently of account records so cards can be revoked safely. */
export const rfidCards = mysqlTable(
  "rfid_cards",
  {
    id: int("id").autoincrement().primaryKey(),
    rfidUid: varchar("rfidUid", { length: 128 }).notNull(),
    userId: int("userId").references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 120 }),
    status: mysqlEnum("status", ["active", "suspended", "lost", "revoked"])
      .default("active")
      .notNull(),
    registeredAt: timestamp("registeredAt").defaultNow().notNull(),
    lastUsedAt: timestamp("lastUsedAt"),
  },
  table => [
    uniqueIndex("rfid_cards_uid_uq").on(table.rfidUid),
    index("rfid_cards_user_status_idx").on(table.userId, table.status),
  ]
);

/** A physical controller or simulator that uses the same device contract. */
export const devices = mysqlTable(
  "devices",
  {
    id: int("id").autoincrement().primaryKey(),
    deviceId: varchar("deviceId", { length: 96 }).notNull(),
    deviceName: varchar("deviceName", { length: 160 }).notNull(),
    location: varchar("location", { length: 255 }),
    deviceTokenHash: varchar("deviceTokenHash", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["online", "offline", "warning", "maintenance"])
      .default("offline")
      .notNull(),
    connectionType: mysqlEnum("connectionType", ["simulator", "esp32"])
      .default("simulator")
      .notNull(),
    ipAddress: varchar("ipAddress", { length: 64 }),
    firmwareVersion: varchar("firmwareVersion", { length: 64 }),
    lastSeenAt: timestamp("lastSeenAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("devices_device_id_uq").on(table.deviceId),
    index("devices_status_seen_idx").on(table.status, table.lastSeenAt),
  ]
);

/** Every RFID decision is preserved as an append-only audit record. */
export const accessLogs = mysqlTable(
  "access_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").references(() => users.id, { onDelete: "set null" }),
    deviceId: int("deviceId").references(() => devices.id, { onDelete: "set null" }),
    rfidUid: varchar("rfidUid", { length: 128 }).notNull(),
    accessType: mysqlEnum("accessType", ["entry", "exit", "manual", "system"])
      .default("entry")
      .notNull(),
    result: mysqlEnum("result", ["authorized", "denied", "error"]).notNull(),
    reason: varchar("reason", { length: 255 }),
    gateState: mysqlEnum("gateState", ["open", "closed", "opening", "closing", "alert"])
      .default("closed")
      .notNull(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  },
  table => [
    index("access_logs_occurred_idx").on(table.occurredAt),
    index("access_logs_result_occurred_idx").on(table.result, table.occurredAt),
    index("access_logs_device_occurred_idx").on(table.deviceId, table.occurredAt),
    index("access_logs_rfid_idx").on(table.rfidUid),
  ]
);

/** Security, communications, and manual-operation history. */
export const gateEvents = mysqlTable(
  "gate_events",
  {
    id: int("id").autoincrement().primaryKey(),
    deviceId: int("deviceId").references(() => devices.id, { onDelete: "set null" }),
    actorUserId: int("actorUserId").references(() => users.id, { onDelete: "set null" }),
    eventType: varchar("eventType", { length: 96 }).notNull(),
    severity: mysqlEnum("severity", ["info", "warning", "critical"])
      .default("info")
      .notNull(),
    description: text("description").notNull(),
    metadata: text("metadata"),
    resolved: boolean("resolved").default(false).notNull(),
    resolvedAt: timestamp("resolvedAt"),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  },
  table => [
    index("gate_events_severity_resolved_idx").on(table.severity, table.resolved, table.occurredAt),
    index("gate_events_device_occurred_idx").on(table.deviceId, table.occurredAt),
  ]
);

/** Time-series sensor telemetry. Sensor values are serialized to allow numeric or structured readings. */
export const sensorReadings = mysqlTable(
  "sensor_readings",
  {
    id: int("id").autoincrement().primaryKey(),
    deviceId: int("deviceId").references(() => devices.id, { onDelete: "cascade" }).notNull(),
    sensorType: mysqlEnum("sensorType", ["ultrasonic", "infrared", "reed_switch", "rfid", "servo"])
      .notNull(),
    sensorValue: varchar("sensorValue", { length: 255 }).notNull(),
    quality: mysqlEnum("quality", ["normal", "inconsistent", "fault"])
      .default("normal")
      .notNull(),
    occurredAt: timestamp("occurredAt").defaultNow().notNull(),
  },
  table => [index("sensor_readings_device_occurred_idx").on(table.deviceId, table.occurredAt)]
);

/** Command queue consumed by a real ESP32 or simulator without client-side shortcuts. */
export const gateCommands = mysqlTable(
  "gate_commands",
  {
    id: int("id").autoincrement().primaryKey(),
    commandId: varchar("commandId", { length: 64 }).notNull(),
    deviceId: int("deviceId").references(() => devices.id, { onDelete: "cascade" }).notNull(),
    requestedByUserId: int("requestedByUserId").references(() => users.id, { onDelete: "set null" }),
    commandType: mysqlEnum("commandType", ["open", "close", "set_auto", "buzzer", "led"])
      .notNull(),
    payload: text("payload"),
    source: mysqlEnum("source", ["authorized_access", "manual", "system"])
      .notNull(),
    status: mysqlEnum("status", ["pending", "delivered", "acknowledged", "failed", "expired"])
      .default("pending")
      .notNull(),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    deliveredAt: timestamp("deliveredAt"),
    completedAt: timestamp("completedAt"),
  },
  table => [
    uniqueIndex("gate_commands_command_id_uq").on(table.commandId),
    index("gate_commands_device_status_idx").on(table.deviceId, table.status, table.requestedAt),
  ]
);

/** A singleton setting row makes safety-relevant timeout configuration explicit and auditable. */
export const gateSettings = mysqlTable("gate_settings", {
  id: int("id").autoincrement().primaryKey(),
  gateMode: mysqlEnum("gateMode", ["auto", "manual_open", "manual_closed"])
    .default("auto")
    .notNull(),
  gateState: mysqlEnum("gateState", ["open", "closed", "opening", "closing", "alert"])
    .default("closed")
    .notNull(),
  autoCloseTimeoutSeconds: int("autoCloseTimeoutSeconds").default(12).notNull(),
  openedAt: timestamp("openedAt"),
  autoCloseDueAt: timestamp("autoCloseDueAt"),
  updatedByUserId: int("updatedByUserId").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type RfidCard = typeof rfidCards.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type AccessLog = typeof accessLogs.$inferSelect;
export type GateEvent = typeof gateEvents.$inferSelect;
export type GateCommand = typeof gateCommands.$inferSelect;
