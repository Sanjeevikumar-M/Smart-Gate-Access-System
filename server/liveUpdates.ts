import type { IncomingMessage } from "node:http";
import type { Server } from "node:http";
import type { Request as ExpressRequest } from "express";
import { WebSocket, WebSocketServer } from "ws";
import { sdk } from "./_core/sdk";

let dashboardSockets: WebSocketServer | null = null;

export function registerLiveUpdates(server: Server) {
  dashboardSockets = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request: IncomingMessage, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws/dashboard") return;

    // Origin validation to prevent Cross-Site WebSocket Hijacking (CSWSH)
    const origin = request.headers.origin;
    const host = request.headers.host;
    if (origin) {
      try {
        const originUrl = new URL(origin);
        const hostName = host?.split(":")[0];
        const allowed =
          originUrl.hostname === hostName ||
          originUrl.hostname === "localhost" ||
          originUrl.hostname === "127.0.0.1" ||
          (process.env.ALLOWED_ORIGINS &&
            process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).includes(originUrl.origin));
        if (!allowed) {
          socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
          socket.destroy();
          return;
        }
      } catch {
        socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
        socket.destroy();
        return;
      }
    }

    void sdk
      .authenticateRequest(request as unknown as ExpressRequest)
      .then(() => {
        dashboardSockets?.handleUpgrade(request, socket, head, webSocket => {
          dashboardSockets?.emit("connection", webSocket, request);
        });
      })
      .catch(() => {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
      });
  });
  dashboardSockets.on("connection", socket => {
    socket.send(JSON.stringify({ type: "connected", at: new Date().toISOString() }));
  });
}

export function publishGateUpdate(payload: Record<string, unknown>) {
  if (!dashboardSockets) return;
  const message = JSON.stringify({ ...payload, at: new Date().toISOString() });
  for (const client of Array.from(dashboardSockets.clients)) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}
