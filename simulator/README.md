# Local Device Simulator

The simulator behaves as a device client: it calls the authenticated `/api/iot/*` endpoints, receives queued commands, reports actuator position, and uses the returned auto-close value locally. It never updates dashboard state directly.

First, sign in as an administrator and open **Gate Device**. Use **Rotate device token** and copy the one-time value shown by the interface. Then run the simulator from a terminal.

```bash
export GATE_BASE_URL="http://localhost:3000"
export GATE_DEVICE_ID="gate-simulator-01"
export GATE_DEVICE_TOKEN="paste-the-one-time-token-here"

node simulator/gate-device-simulator.mjs authorized
```

Use `unauthorized`, `rfid-scan`, `authorized-event`, `unauthorized-event`, `vehicle`, `gate-open`, `gate-close`, `forced-open`, `online`, `offline`, or `poll` as the final argument to emit another required device event. For a deployed instance, set `GATE_BASE_URL` to its HTTPS address. Keep the token outside the repository and rotate it if it is exposed.
