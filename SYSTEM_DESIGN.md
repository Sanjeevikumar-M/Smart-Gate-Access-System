# Smart Gate System Design

## Architectural decision

The system uses a modular monolith. The React dashboard communicates with a typed Express/tRPC backend, which persists operational history in MySQL through Drizzle ORM. A real ESP32 or the simulator communicates with the same device contract: sensor and access events are submitted to the backend; the device polls for pending commands and acknowledges execution. This preserves the intended hardware-to-cloud path without coupling the user interface to a particular device implementation.

## Trust boundaries and roles

Human users authenticate through the platform's secure JWT-backed session flow. Protected procedures enforce one of three system roles: `admin`, `operator`, or `registered_user`. Administrators manage identities, cards, configuration, and all controls. Operators monitor the system, inspect logs and alerts, and issue logged manual commands. Registered users are access identities that may be linked to an RFID card, but they have no administrative dashboard capabilities.

Devices are not granted a human session. Each request from an ESP32 or simulator carries a device identifier and device token. The backend validates the pair, records the event, and rejects invalid-device activity as a security event.

## Gate state machine

| State | Permitted transition | Trigger | Safe behavior |
|---|---|---|---|
| `CLOSED` | `OPENING` | Authorized scan or approved manual-open command | The gate opens only after backend authorization or a role-authorized command. |
| `OPENING` | `OPEN` | Device acknowledgement | The backend records the command and the device reports position. |
| `OPEN` | `CLOSING` | Configured auto-close deadline or approved manual-close command | The deadline is read from the `gate_settings` table, not hard-coded. |
| `CLOSING` | `CLOSED` | Device acknowledgement | The gate returns to the secure resting state. |
| Any | `ALERT` | Forced-open, inconsistent sensor, timeout, or device fault | An alert is recorded; automatic opening is inhibited until a safe state is restored. |

The operational mode is `AUTO`, `MANUAL_OPEN`, or `MANUAL_CLOSED`. In AUTO mode a successful authorization creates an `OPEN` command and an auto-close deadline. Manual commands are audit logged and require Admin or Security Operator authority.

## Device event contract

| Event | Required payload | Backend effect |
|---|---|---|
| `VEHICLE_DETECTED` | device ID, sensor value | Stores a sensor reading and opens an identification window. |
| `RFID_SCAN` | device ID, RFID UID | Verifies card authorization and creates a pending gate command where permitted. |
| `AUTHORIZED_ACCESS` | device ID, RFID UID, user ID | Writes an authorized access log and reports success to the device. |
| `UNAUTHORIZED_ACCESS` | device ID, RFID UID | Writes a denied access log and creates a warning alert. |
| `GATE_OPEN` / `GATE_CLOSE` | device ID, gate position | Updates state and completes the relevant command. |
| `FORCED_GATE_OPEN` | device ID, sensor evidence | Creates a critical event and leaves the gate in an alert state. |
| `DEVICE_ONLINE` / `DEVICE_OFFLINE` | device ID | Updates the heartbeat/device status and creates an event when required. |

Device commands are queued with a unique command identifier. A device receives only its own pending commands through a polling endpoint and must acknowledge each command with the same identifier. Consequently, simulator and ESP32 implementations have identical command semantics.

## Core data relationships

`users` have zero or more `rfid_cards` and `access_logs`. `devices` have zero or more `sensor_readings`, `access_logs`, `gate_events`, and `gate_commands`. `gate_events` preserve security and operation history independently of access logs. `gate_settings` stores the singleton runtime configuration, including the auto-close timeout. Indexes support time-ordered monitoring views, device heartbeats, RFID lookup, and access-log filtering.

## Live monitoring strategy

The backend exposes one consolidated dashboard snapshot and small domain-specific queries. The initial release uses resilient polling every five seconds for monitoring views; the same update payload is designed to be broadcast through a WebSocket-compatible event channel after connection support is enabled. UI state is always reconciled from the authoritative database snapshot, so it remains correct after a connection interruption.
