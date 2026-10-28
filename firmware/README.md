# ESP32 Firmware Reference

Install the **ESP32Servo**, **MFRC522**, and **ArduinoJson** libraries through the Arduino IDE Library Manager. Copy `config.example.h` to `config.h`, enter the local Wi-Fi and server values, and upload `gate_controller.ino` to an ESP32.

The firmware sends sensor/RFID events to the backend, polls the command queue, reports gate position, and performs auto-close locally after receiving an open command. The sample uses an IR sensor, reed switch, RC522 reader, servo, two LEDs, and a buzzer. Pin assignments are deliberately located in `config.h` so deployment-specific wiring is not hard-coded into the source.

> Validate electrical levels, servo power isolation, sensor calibration, and emergency/manual override behaviour with qualified supervision before physical deployment.
