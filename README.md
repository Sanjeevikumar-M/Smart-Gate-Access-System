# Sentinel Gate — Smart Automated Gate Access & Control System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle%20ORM-MySQL-green.svg)](https://orm.drizzle.team/)
[![ESP32](https://img.shields.io/badge/ESP32-Arduino%20C%2B%2B-red.svg)](https://www.espressif.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An enterprise-grade, academic IoT smart gate access monitoring and automated control system. It integrates RFID physical authorization, multi-sensor vehicle presence detection, real-time command queueing, audit logging, role-based security operations (Admin, Operator, Registered User), live WebSocket monitoring, a local hardware simulator, and ESP32 reference firmware.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [System Flowcharts](#system-flowcharts)
   - [RFID Access Control Flowchart](#1-rfid-access-control--gate-operation-flowchart)
   - [Device Command & Acknowledgement Lifecycle](#2-device-command--acknowledgement-lifecycle)
3. [Repository Branch Structure](#repository-branch-structure)
4. [Hardware Specifications & Pinout](#hardware-specifications--pinout)
5. [Prerequisites & Installation](#prerequisites--installation)
6. [Running the Application](#running-the-application)
7. [Device Simulator Walkthrough](#device-simulator-walkthrough)
8. [ESP32 Firmware Setup](#esp32-firmware-setup)
9. [IoT REST API Specification](#iot-rest-api-specification)
10. [Security & Hardening Measures](#security--hardening-measures)

---

## Architecture Overview

```mermaid
graph TD
    subgraph "Physical / Edge Layer"
        ESP32["ESP32 Microcontroller"]
        RC522["RC522 RFID Reader"]
        IR["Infrared Presence Sensor"]
        Reed["Magnetic Reed Switch (Position)"]
        Servo["SG90 / MG996R Servo Gate Motor"]
        Indicators["Status LEDs & Buzzer"]
        Sim["Local Node.js Device Simulator"]
    end

    subgraph "Backend Services (Express + tRPC)"
        IoT_API["/api/iot/* REST API Engine"]
        TRPC_API["/api/trpc Application Routers"]
        WS_Server["WebSocket Notification Hub (/ws/dashboard)"]
        Auth["JWT & Role Authorization Guard"]
        GateService["Gate Service & State Machine"]
    end

    subgraph "Storage Layer"
        MySQL[("MySQL 8.0 / TiDB Database")]
        Schema["Drizzle ORM Schema & Logs"]
    end

    subgraph "Frontend Layer (React 19 + Vite)"
        Dashboard["Command Centre Dashboard"]
        AuditLogs["Access & Security Event Logs"]
        UserMgmt["User & RFID Credential Management"]
        Analytics["Throughput & Security Analytics"]
    end

    RC522 -->|SPI| ESP32
    IR -->|Digital In| ESP32
    Reed -->|Digital In| ESP32
    ESP32 -->|PWM| Servo
    ESP32 -->|GPIO| Indicators

    ESP32 <-->|Authenticated JSON HTTP/HTTPS| IoT_API
    Sim <-->|Authenticated JSON REST| IoT_API

    IoT_API --> GateService
    TRPC_API --> GateService
    GateService --> MySQL
    GateService -->|Broadcast Events| WS_Server
    WS_Server -->|Real-time Socket Stream| Dashboard
    Dashboard <-->|tRPC RPC Calls| TRPC_API
```

---

## System Flowcharts

### 1. RFID Access Control & Gate Operation Flowchart

```mermaid
flowchart TD
    Start([Vehicle / Visitor Approaches]) --> DetectPresence{IR Sensor: Object Detected?}
    DetectPresence -- No --> Standby[Gate Remains Idle / Closed]
    DetectPresence -- Yes --> RFIDPrompt[Open RFID Scan Window & Green Strobe]
    
    RFIDPrompt --> ScanCard[User Taps RFID Card on RC522 Reader]
    ScanCard --> SendScanEvent[ESP32 / Simulator sends POST /api/iot/events RFID_SCAN]
    
    SendScanEvent --> BackendVerify{Backend: Check Active RFID & User Record}
    
    BackendVerify -- "Credential Not Found / Suspended" --> AccessDenied[Log 'denied' Access & Fire UNAUTHORIZED_RFID Alert]
    AccessDenied --> DeniedFeedback[Sound Warning Buzzer & Red LED]
    DeniedFeedback --> CheckRepeated{Attempts >= 3 in 5 min?}
    CheckRepeated -- Yes --> CriticalAlert[Raise Critical Security Alert]
    CheckRepeated -- No --> Standby
    
    BackendVerify -- "Active Credential Matched" --> AccessApproved[Log 'authorized' Access Log & Update LastUsedAt]
    AccessApproved --> CheckMode{Gate Operating Mode?}
    
    CheckMode -- "Manual Mode" --> LogOnly[State updated to Authorized; Wait for Operator Command]
    CheckMode -- "Auto Mode" --> QueueOpen[Queue 'open' Command with autoCloseTimeoutSeconds]
    
    QueueOpen --> DevicePoll[ESP32 Polls GET /api/iot/commands]
    DevicePoll --> ActuateOpen[Servo Rotates to 95° Open & Buzzer Beeps]
    ActuateOpen --> AckOpen[Device sends POST /api/iot/commands/:id/ack & Event GATE_OPEN]
    AckOpen --> WSBroadcast[WebSocket updates Live Dashboard]
    
    AckOpen --> TimerStart[Local Device Timer: Count down autoCloseTimeoutSeconds]
    TimerStart --> TimerElapsed{Timeout Reached?}
    TimerElapsed -- Yes --> ActuateClose[Servo Rotates to 0° Closed Position]
    ActuateClose --> AckClose[Device sends Event GATE_CLOSE & Position Confirmed]
    AckClose --> End([Cycle Complete - Ready for Next Vehicle])
```

### 2. Device Command & Acknowledgement Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Security Operator / Admin
    participant Dashboard as Web Dashboard
    participant Backend as Express / Gate Service
    participant Database as MySQL Database
    participant Device as ESP32 / Gate Simulator

    Admin->>Dashboard: Click "Manual Open" or "Set Auto Mode"
    Dashboard->>Backend: tRPC mutation: gate.control({ action: "open" })
    Backend->>Database: Insert gateCommands (status: 'pending')
    Backend->>Database: Update gateSettings (gateState: 'opening')
    Backend->>Dashboard: Broadcast live update via WebSocket

    loop Every 1.5 Seconds
        Device->>Backend: GET /api/iot/commands (x-device-id, x-device-token)
        Backend->>Database: Select pending commands for device
        Backend->>Database: Mark status as 'delivered'
        Backend-->>Device: Return [ { commandId, commandType: "open", payload } ]
    end

    Device->>Device: Execute Servo Actuation (0° -> 95°)
    Device->>Backend: POST /api/iot/commands/:id/ack { success: true }
    Backend->>Database: Update command status: 'acknowledged'
    Device->>Backend: POST /api/iot/events { eventType: "GATE_OPEN" }
    Backend->>Dashboard: Broadcast GATE_OPEN event to all live operators
```

---

## Repository Branch Structure

This project uses modular branches:

| Branch | Focus Area | Contents |
| :--- | :--- | :--- |
| **`main`** | **Complete Full-Stack Repository** | Unified production-ready repository containing firmware, simulator, backend, and dashboard. |
| **`software`** | **Software Application** | Complete software bundle: React frontend dashboard, Express/tRPC API, Drizzle migrations, and Node.js simulator. |
| **`backend`** | **Server & IoT Engine** | Express server, `/api/iot/*` REST controllers, tRPC routers, database models, simulator, and automated test suites. |
| **`frontend`** | **Monitoring Dashboard** | React 19 web application, Tailwind CSS styling, Recharts analytics, and WebSocket client. |
| **`hardware`** | **Firmware & Embedded Integration** | ESP32 Arduino C++ firmware (`gate_controller.ino`), pinout guides, wiring schematics, and sensor configuration. |

---

## Hardware Specifications & Pinout

The physical controller uses an **ESP32 DevKit v1** paired with sensors and actuators:

| Component | Interface / Protocol | ESP32 GPIO Pin | Function / Description |
| :--- | :--- | :--- | :--- |
| **MFRC522 RFID Reader** | SPI (SDA / SS) | **GPIO 5** | Slave select line for RFID communication |
| **MFRC522 RFID Reader** | SPI (SCK) | **GPIO 18** | SPI Clock |
| **MFRC522 RFID Reader** | SPI (MOSI) | **GPIO 23** | Master Out Slave In |
| **MFRC522 RFID Reader** | SPI (MISO) | **GPIO 19** | Master In Slave Out |
| **MFRC522 RFID Reader** | Reset (RST) | **GPIO 4** | RFID module hardware reset |
| **Infrared (IR) Sensor** | Digital Input | **GPIO 34** | Active LOW when vehicle / person is present |
| **Magnetic Reed Switch** | Digital Input (PULLUP)| **GPIO 35** | Detects physical gate alignment (closed state) |
| **Servo Motor (SG90/MG996R)**| PWM Signal | **GPIO 13** | Actuates gate barrier arm (0° closed, 95° open) |
| **Green Status LED** | Digital Output | **GPIO 25** | Visual authorized access indicator |
| **Red Status LED** | Digital Output | **GPIO 26** | Visual unauthorized / alert indicator |
| **Active Buzzer** | PWM / Tone | **GPIO 27** | Audible access tone (1500Hz) & alert warning (350Hz) |

> **Wiring Note**: Supply external 5V power (minimum 1.5A–2A) to the servo motor. Do not power the servo motor directly from the ESP32 3.3V/VIN pins to prevent brownout resets.

---

## Prerequisites & Installation

### Prerequisites
* **Node.js**: v18.0.0 or higher (v20+ recommended)
* **pnpm**: v9.0.0 or higher (`corepack enable` or `npm install -g pnpm`)
* **Docker** (optional, for 1-command MySQL database): Docker Desktop / Docker Engine

### 1. Clone Repository
```bash
git clone https://github.com/Sanjeevikumar-M/Smart-Gate-Access-System.git
cd Smart-Gate-Access-System
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Customize connection strings and secrets in `.env`:
```ini
DATABASE_URL=mysql://root:rootpassword@localhost:3306/smart_gate
PORT=3000
JWT_SECRET=super-secret-jwt-key-min-32-chars!
VITE_APP_ID=smart-gate-access-system
```

### 4. Database Setup (Docker or Local MySQL)
Launch a local MySQL 8.0 instance with Docker Compose:
```bash
docker compose up -d
```
Generate schema and run initial migrations:
```bash
pnpm db:push
```

---

## Running the Application

### Start Development Server
```bash
pnpm dev
```
Open **`http://localhost:3000`** in your browser. The server automatically launches the Vite frontend and Express tRPC backend on the same port.

### Run Automated Tests
```bash
pnpm test
```

### Run TypeScript Verification
```bash
pnpm check
```

---

## Device Simulator Walkthrough

You can test full physical gate cycles without ESP32 hardware using the built-in simulator:

1. Open the dashboard at `http://localhost:3000` and navigate to **Gate Device**.
2. Click **Rotate device token** and copy the displayed token string.
3. In your terminal, run any of the simulation scenarios:

```bash
# Set simulator environment variables (PowerShell):
$env:GATE_BASE_URL="http://localhost:3000"
$env:GATE_DEVICE_ID="gate-simulator-01"
$env:GATE_DEVICE_TOKEN="paste-your-token-here"

# Scenario 1: Authorized access with presence detection and auto-close
node simulator/gate-device-simulator.mjs authorized

# Scenario 2: Unauthorized RFID card access attempt
node simulator/gate-device-simulator.mjs unauthorized

# Scenario 3: Physical forced-open tampering alert
node simulator/gate-device-simulator.mjs forced-open

# Scenario 4: Periodic heartbeat check
node simulator/gate-device-simulator.mjs heartbeat

# Scenario 5: Poll and apply manual commands issued from dashboard
node simulator/gate-device-simulator.mjs poll
```

---

## ESP32 Firmware Setup

1. Open the **Arduino IDE** (v2.x recommended).
2. Install the ESP32 Board Package:
   - Go to **Preferences** -> **Additional Board Manager URLs** -> add `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`.
   - Install **esp32 by Espressif Systems** via Board Manager.
3. Install required libraries from Library Manager:
   - **ESP32Servo**
   - **MFRC522**
   - **ArduinoJson** (v6 or v7)
4. Configure credentials:
   - Copy `firmware/config.example.h` to `firmware/config.h`.
   - Enter your Wi-Fi SSID, Password, Server Base URL, Device ID, and Device Token.
5. Connect your ESP32 board via USB, select your COM port, and click **Upload**.

---

## IoT REST API Specification

All physical hardware and simulator endpoints are under `/api/iot/*` and require the following headers:
- `x-device-id`: Unique device identifier string
- `x-device-token`: Secret authentication token

| Endpoint | Method | Payload / Parameters | Description |
| :--- | :--- | :--- | :--- |
| `/api/iot/heartbeat` | `POST` | Empty body | Reports device online and updates `lastSeenAt` |
| `/api/iot/events` | `POST` | `{"eventType": "RFID_SCAN", "rfidUid": "..."}` | Submits sensor readings, RFID taps, and gate state changes |
| `/api/iot/commands` | `GET` | *None* | Fetches pending commands queued by operators |
| `/api/iot/commands/:id/ack` | `POST` | `{"success": true}` | Acknowledges completion or failure of a command |

Permitted event types: `RFID_SCAN`, `AUTHORIZED_ACCESS`, `UNAUTHORIZED_ACCESS`, `VEHICLE_DETECTED`, `GATE_OPEN`, `GATE_CLOSE`, `FORCED_GATE_OPEN`, `DEVICE_ONLINE`, `DEVICE_OFFLINE`.

---

## Security & Hardening Measures

- **Timing-Safe Credential Verification**: Device authentication tokens are hashed using SHA-256 and compared using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
- **Cross-Site WebSocket Hijacking (CSWSH) Defense**: The WebSocket upgrade handler validates the `Origin` header against permitted hostnames before upgrading live socket connections.
- **Payload Size Constraints**: Global Express JSON parsing is strictly bounded to `2mb` to prevent memory exhaustion DoS attacks.
- **Role-Based Procedure Isolation**: Sensitive gate actions (such as credential revocation or auto-close adjustments) require an authenticated `admin` procedure, while monitoring features require an `operator` role.
- **Auditable Security Logs**: Every RFID scan, unauthorized attempt, tampering event, and manual override is recorded in an append-only `access_logs` table.

---

## License

This project is licensed under the [MIT License](LICENSE).
