#pragma once

// Copy this file to config.h and fill in your own local network and deployment values.
// Do not commit config.h to source control.
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"
#define GATE_API_BASE_URL "https://YOUR_DEPLOYED_DOMAIN"
#define GATE_DEVICE_ID "gate-esp32-01"
#define GATE_DEVICE_TOKEN "ROTATE_FROM_ADMIN_INTERFACE"

// Hardware pin assignments. Change these for your board and wiring.
#define IR_PIN 34
#define REED_PIN 35
#define SERVO_PIN 13
#define GREEN_LED_PIN 25
#define RED_LED_PIN 26
#define BUZZER_PIN 27
#define RFID_SS_PIN 5
#define RFID_RST_PIN 4
