#!/usr/bin/env node

/**
 * Local smart-gate simulator.
 *
 * It is intentionally a device client, not a dashboard shortcut: every event,
 * command poll, acknowledgement, and auto-close action travels through the
 * same authenticated /api/iot/* contract intended for an ESP32.
 */
const baseUrl = (process.env.GATE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const deviceId = process.env.GATE_DEVICE_ID ?? "gate-simulator-01";
const deviceToken = process.env.GATE_DEVICE_TOKEN;
const scenario = process.argv[2] ?? "authorized";

if (!deviceToken) {
  console.error("GATE_DEVICE_TOKEN is required. Rotate a device token from the Admin Gate Device screen, then set it in your terminal environment.");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  "x-device-id": deviceId,
  "x-device-token": deviceToken,
};

async function request(path, method = "POST", body) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? `${method} ${path} failed with ${response.status}`);
  return payload;
}

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function event(eventType, payload = {}) {
  console.log(`→ ${eventType}`);
  return request("/api/iot/events", "POST", { eventType, ...payload });
}

async function heartbeat() {
  console.log("→ DEVICE_ONLINE heartbeat");
  return request("/api/iot/heartbeat");
}

async function acknowledge(commandId, success = true) {
  return request(`/api/iot/commands/${commandId}/ack`, "POST", { success });
}

async function applyPendingCommands() {
  const { commands } = await request("/api/iot/commands", "GET");
  for (const command of commands) {
    console.log(`← command ${command.commandType} (${command.commandId})`);
    if (command.commandType === "open") {
      await event("GATE_OPEN", { commandId: command.commandId });
    } else if (command.commandType === "close") {
      await event("GATE_CLOSE", { commandId: command.commandId });
    }
    await acknowledge(command.commandId, true);
  }
  return commands;
}

async function authorizedAccess() {
  await heartbeat();
  await event("VEHICLE_DETECTED", { sensorValue: "0.44m" });
  const scan = await event("RFID_SCAN", { rfidUid: "RFID-ALPHA-001" });
  const result = scan.result;
  if (!result?.authorized || !result.command) {
    console.log("Access was not authorized; no gate movement occurred.");
    return;
  }
  await event("GATE_OPEN", { commandId: result.command.commandId });
  await acknowledge(result.command.commandId, true);
  const delay = Number(result.autoCloseTimeoutSeconds ?? 12) * 1000;
  console.log(`Gate is open. Local device timer will close it in ${delay / 1000} seconds.`);
  await sleep(delay);
  await event("GATE_CLOSE");
  console.log("✓ Authorized entry and locally timed auto-close complete.");
}

async function unauthorizedAccess() {
  await heartbeat();
  await event("VEHICLE_DETECTED", { sensorValue: "0.39m" });
  await event("RFID_SCAN", { rfidUid: "RFID-UNKNOWN-999" });
  console.log("✓ Unauthorized RFID was reported; gate remains closed.");
}

async function main() {
  if (scenario === "authorized") return authorizedAccess();
  if (scenario === "unauthorized") return unauthorizedAccess();
  if (scenario === "rfid-scan") return event("RFID_SCAN", { rfidUid: "RFID-ALPHA-001" });
  if (scenario === "authorized-event") return event("AUTHORIZED_ACCESS", { rfidUid: "RFID-ALPHA-001" });
  if (scenario === "unauthorized-event") return event("UNAUTHORIZED_ACCESS", { rfidUid: "RFID-UNKNOWN-999" });
  if (scenario === "vehicle") return event("VEHICLE_DETECTED", { sensorValue: "0.42m" });
  if (scenario === "gate-open") return event("GATE_OPEN");
  if (scenario === "gate-close") return event("GATE_CLOSE");
  if (scenario === "forced-open") return event("FORCED_GATE_OPEN");
  if (scenario === "online" || scenario === "heartbeat") return heartbeat();
  if (scenario === "offline") return event("DEVICE_OFFLINE");
  if (scenario === "poll") return applyPendingCommands();
  throw new Error(`Unknown scenario "${scenario}". Use authorized, unauthorized, rfid-scan, authorized-event, unauthorized-event, vehicle, gate-open, gate-close, forced-open, online, offline, or poll.`);
}

main().catch(error => {
  console.error(`Simulator failed: ${error.message}`);
  process.exit(1);
});
