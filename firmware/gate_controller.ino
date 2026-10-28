#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include "config.h"

Servo gateServo;
MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
bool gateIsOpen = false;
unsigned long closeDueAt = 0;
unsigned long lastHeartbeatAt = 0;
unsigned long lastPollAt = 0;
bool presenceWasDetected = false;

String makeUrl(const char* path) { return String(GATE_API_BASE_URL) + path; }

void setIndicators(bool authorized) {
  digitalWrite(GREEN_LED_PIN, authorized ? HIGH : LOW);
  digitalWrite(RED_LED_PIN, authorized ? LOW : HIGH);
  tone(BUZZER_PIN, authorized ? 1500 : 350, authorized ? 100 : 450);
}

void sendEvent(const char* eventType, const String& rfidUid = "", const String& commandId = "") {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(makeUrl("/api/iot/events"));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", GATE_DEVICE_ID);
  http.addHeader("x-device-token", GATE_DEVICE_TOKEN);
  StaticJsonDocument<512> payload;
  payload["eventType"] = eventType;
  if (rfidUid.length()) payload["rfidUid"] = rfidUid;
  if (commandId.length()) payload["commandId"] = commandId;
  String body;
  serializeJson(payload, body);
  http.POST(body);
  http.end();
}

void acknowledgeCommand(const String& commandId, bool success) {
  HTTPClient http;
  http.begin(makeUrl(("/api/iot/commands/" + commandId + "/ack").c_str()));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", GATE_DEVICE_ID);
  http.addHeader("x-device-token", GATE_DEVICE_TOKEN);
  http.POST(success ? "{\"success\":true}" : "{\"success\":false}");
  http.end();
}

void openGate(const String& commandId, unsigned long autoCloseSeconds) {
  gateServo.write(95);
  gateIsOpen = true;
  setIndicators(true);
  sendEvent("GATE_OPEN", "", commandId);
  if (autoCloseSeconds > 0) closeDueAt = millis() + autoCloseSeconds * 1000UL;
}

void closeGate(const String& commandId = "") {
  gateServo.write(0);
  gateIsOpen = false;
  closeDueAt = 0;
  digitalWrite(GREEN_LED_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);
  sendEvent("GATE_CLOSE", "", commandId);
}

void pollCommands() {
  if (WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.begin(makeUrl("/api/iot/commands"));
  http.addHeader("x-device-id", GATE_DEVICE_ID);
  http.addHeader("x-device-token", GATE_DEVICE_TOKEN);
  int code = http.GET();
  if (code != 200) { http.end(); return; }
  DynamicJsonDocument doc(4096);
  if (deserializeJson(doc, http.getString())) { http.end(); return; }
  for (JsonObject command : doc["commands"].as<JsonArray>()) {
    String commandId = command["commandId"].as<String>();
    String commandType = command["commandType"].as<String>();
    if (commandType == "open") {
      String payloadText = command["payload"].as<String>();
      StaticJsonDocument<256> payload;
      deserializeJson(payload, payloadText);
      unsigned long timeout = payload["autoCloseTimeoutSeconds"] | 0;
      openGate(commandId, timeout);
      acknowledgeCommand(commandId, true);
    } else if (commandType == "close") {
      closeGate(commandId);
      acknowledgeCommand(commandId, true);
    } else {
      acknowledgeCommand(commandId, true);
    }
  }
  http.end();
}

String readRfidUid() {
  String uid;
  for (byte index = 0; index < rfid.uid.size; index++) {
    if (rfid.uid.uidByte[index] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[index], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void sendHeartbeat() {
  HTTPClient http;
  http.begin(makeUrl("/api/iot/heartbeat"));
  http.addHeader("x-device-id", GATE_DEVICE_ID);
  http.addHeader("x-device-token", GATE_DEVICE_TOKEN);
  http.POST("");
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(IR_PIN, INPUT);
  pinMode(REED_PIN, INPUT_PULLUP);
  pinMode(GREEN_LED_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  gateServo.attach(SERVO_PIN);
  closeGate();
  SPI.begin();
  rfid.PCD_Init();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void loop() {
  const unsigned long now = millis();
  if (WiFi.status() == WL_CONNECTED && now - lastHeartbeatAt > 30000) { sendHeartbeat(); lastHeartbeatAt = now; }
  if (now - lastPollAt > 1500) { pollCommands(); lastPollAt = now; }

  bool presenceDetected = digitalRead(IR_PIN) == LOW;
  if (presenceDetected && !presenceWasDetected) sendEvent("VEHICLE_DETECTED");
  presenceWasDetected = presenceDetected;

  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    sendEvent("RFID_SCAN", readRfidUid());
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
  }

  if (gateIsOpen && closeDueAt && now > closeDueAt) closeGate();
  if (!gateIsOpen && digitalRead(REED_PIN) == LOW) sendEvent("FORCED_GATE_OPEN");
}
