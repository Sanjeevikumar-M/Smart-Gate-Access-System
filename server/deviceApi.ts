import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  DEVICE_EVENT_TYPES,
  acknowledgeDeviceCommand,
  authenticateDevice,
  pollDeviceCommands,
  processDeviceEvent,
  seedGateDemoData,
} from "./gateService";

const eventSchema = z.object({
  eventType: z.enum(DEVICE_EVENT_TYPES),
  rfidUid: z.string().max(128).optional(),
  sensorValue: z.string().max(255).optional(),
  commandId: z.string().max(64).optional(),
});

async function requireDevice(req: Request, res: Response) {
  await seedGateDemoData();
  const deviceId = req.header("x-device-id") ?? "";
  const deviceToken = req.header("x-device-token") ?? "";
  const device = await authenticateDevice(deviceId, deviceToken);
  if (!device) {
    res.status(401).json({ error: "Invalid device credentials" });
    return null;
  }
  return device;
}

export function registerDeviceApi(app: Express) {
  app.post("/api/iot/heartbeat", async (req, res) => {
    try {
      const device = await requireDevice(req, res);
      if (!device) return;
      const result = await processDeviceEvent({ device, eventType: "DEVICE_ONLINE" });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Heartbeat failed" });
    }
  });

  app.post("/api/iot/events", async (req, res) => {
    try {
      const device = await requireDevice(req, res);
      if (!device) return;
      const input = eventSchema.parse(req.body);
      const result = await processDeviceEvent({ device, ...input });
      res.json({ ok: true, result });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Invalid device event" });
    }
  });

  app.get("/api/iot/commands", async (req, res) => {
    try {
      const device = await requireDevice(req, res);
      if (!device) return;
      const commands = await pollDeviceCommands(device);
      res.json({ ok: true, commands });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Command poll failed" });
    }
  });

  app.post("/api/iot/commands/:commandId/ack", async (req, res) => {
    try {
      const device = await requireDevice(req, res);
      if (!device) return;
      const input = z.object({ success: z.boolean() }).parse(req.body);
      const command = await acknowledgeDeviceCommand(device, req.params.commandId, input.success);
      res.json({ ok: true, command });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Command acknowledgement failed" });
    }
  });
}
