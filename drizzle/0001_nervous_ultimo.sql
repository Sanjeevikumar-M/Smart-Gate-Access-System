CREATE TABLE `access_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`deviceId` int,
	`rfidUid` varchar(128) NOT NULL,
	`accessType` enum('entry','exit','manual','system') NOT NULL DEFAULT 'entry',
	`result` enum('authorized','denied','error') NOT NULL,
	`reason` varchar(255),
	`gateState` enum('open','closed','opening','closing','alert') NOT NULL DEFAULT 'closed',
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` varchar(96) NOT NULL,
	`deviceName` varchar(160) NOT NULL,
	`location` varchar(255),
	`deviceTokenHash` varchar(255) NOT NULL,
	`status` enum('online','offline','warning','maintenance') NOT NULL DEFAULT 'offline',
	`connectionType` enum('simulator','esp32') NOT NULL DEFAULT 'simulator',
	`ipAddress` varchar(64),
	`firmwareVersion` varchar(64),
	`lastSeenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_device_id_uq` UNIQUE(`deviceId`)
);
--> statement-breakpoint
CREATE TABLE `gate_commands` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commandId` varchar(64) NOT NULL,
	`deviceId` int NOT NULL,
	`requestedByUserId` int,
	`commandType` enum('open','close','set_auto','buzzer','led') NOT NULL,
	`payload` text,
	`source` enum('authorized_access','manual','system') NOT NULL,
	`status` enum('pending','delivered','acknowledged','failed','expired') NOT NULL DEFAULT 'pending',
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`deliveredAt` timestamp,
	`completedAt` timestamp,
	CONSTRAINT `gate_commands_id` PRIMARY KEY(`id`),
	CONSTRAINT `gate_commands_command_id_uq` UNIQUE(`commandId`)
);
--> statement-breakpoint
CREATE TABLE `gate_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int,
	`actorUserId` int,
	`eventType` varchar(96) NOT NULL,
	`severity` enum('info','warning','critical') NOT NULL DEFAULT 'info',
	`description` text NOT NULL,
	`metadata` text,
	`resolved` boolean NOT NULL DEFAULT false,
	`resolvedAt` timestamp,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gate_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gate_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`gateMode` enum('auto','manual_open','manual_closed') NOT NULL DEFAULT 'auto',
	`gateState` enum('open','closed','opening','closing','alert') NOT NULL DEFAULT 'closed',
	`autoCloseTimeoutSeconds` int NOT NULL DEFAULT 12,
	`openedAt` timestamp,
	`autoCloseDueAt` timestamp,
	`updatedByUserId` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gate_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `rfid_cards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rfidUid` varchar(128) NOT NULL,
	`userId` int,
	`label` varchar(120),
	`status` enum('active','suspended','lost','revoked') NOT NULL DEFAULT 'active',
	`registeredAt` timestamp NOT NULL DEFAULT (now()),
	`lastUsedAt` timestamp,
	CONSTRAINT `rfid_cards_id` PRIMARY KEY(`id`),
	CONSTRAINT `rfid_cards_uid_uq` UNIQUE(`rfidUid`)
);
--> statement-breakpoint
CREATE TABLE `sensor_readings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceId` int NOT NULL,
	`sensorType` enum('ultrasonic','infrared','reed_switch','rfid','servo') NOT NULL,
	`sensorValue` varchar(255) NOT NULL,
	`quality` enum('normal','inconsistent','fault') NOT NULL DEFAULT 'normal',
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sensor_readings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(160);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','operator','registered_user') NOT NULL DEFAULT 'registered_user';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(30);--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','suspended','revoked') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `access_logs` ADD CONSTRAINT `access_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `access_logs` ADD CONSTRAINT `access_logs_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gate_commands` ADD CONSTRAINT `gate_commands_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gate_commands` ADD CONSTRAINT `gate_commands_requestedByUserId_users_id_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gate_events` ADD CONSTRAINT `gate_events_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gate_events` ADD CONSTRAINT `gate_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gate_settings` ADD CONSTRAINT `gate_settings_updatedByUserId_users_id_fk` FOREIGN KEY (`updatedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rfid_cards` ADD CONSTRAINT `rfid_cards_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sensor_readings` ADD CONSTRAINT `sensor_readings_deviceId_devices_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `access_logs_occurred_idx` ON `access_logs` (`occurredAt`);--> statement-breakpoint
CREATE INDEX `access_logs_result_occurred_idx` ON `access_logs` (`result`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `access_logs_device_occurred_idx` ON `access_logs` (`deviceId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `access_logs_rfid_idx` ON `access_logs` (`rfidUid`);--> statement-breakpoint
CREATE INDEX `devices_status_seen_idx` ON `devices` (`status`,`lastSeenAt`);--> statement-breakpoint
CREATE INDEX `gate_commands_device_status_idx` ON `gate_commands` (`deviceId`,`status`,`requestedAt`);--> statement-breakpoint
CREATE INDEX `gate_events_severity_resolved_idx` ON `gate_events` (`severity`,`resolved`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `gate_events_device_occurred_idx` ON `gate_events` (`deviceId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `rfid_cards_user_status_idx` ON `rfid_cards` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `sensor_readings_device_occurred_idx` ON `sensor_readings` (`deviceId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`,`status`);