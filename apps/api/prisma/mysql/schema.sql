-- OpenTrip MySQL / MariaDB schema (MySQL 8+).
-- Applied by prisma/mysql/apply-schema.ts when DATABASE_PROVIDER=mysql.
-- Keep in sync with the Postgres Prisma model (apps/api/prisma/schema.prisma).

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `user` (
  `id` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `emailVerified` TINYINT(1) NOT NULL DEFAULT 0,
  `emailIsPlaceholder` TINYINT(1) NOT NULL DEFAULT 0,
  `image` TEXT NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `defaultCurrency` VARCHAR(16) NOT NULL DEFAULT 'JPY',
  `twoFactorEnabled` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `twoFactor` (
  `id` VARCHAR(191) NOT NULL,
  `secret` TEXT NOT NULL,
  `backupCodes` TEXT NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `verified` TINYINT(1) NULL DEFAULT 1,
  `failedVerificationCount` INT NULL DEFAULT 0,
  `lockedUntil` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `twoFactor_secret_idx` (`secret`(191)),
  KEY `twoFactor_userId_idx` (`userId`),
  CONSTRAINT `twoFactor_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `session` (
  `id` VARCHAR(191) NOT NULL,
  `expiresAt` DATETIME(6) NOT NULL,
  `token` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `ipAddress` TEXT NULL,
  `userAgent` TEXT NULL,
  `userId` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `session_token_key` (`token`),
  KEY `session_user_id_idx` (`userId`),
  CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `account` (
  `id` VARCHAR(191) NOT NULL,
  `accountId` TEXT NOT NULL,
  `providerId` TEXT NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `accessToken` TEXT NULL,
  `refreshToken` TEXT NULL,
  `idToken` TEXT NULL,
  `accessTokenExpiresAt` DATETIME(6) NULL,
  `refreshTokenExpiresAt` DATETIME(6) NULL,
  `scope` TEXT NULL,
  `password` TEXT NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_provider_account_unique` (`accountId`(191), `providerId`(191)),
  KEY `account_user_id_idx` (`userId`),
  CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `external_identities` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `subject_type` VARCHAR(64) NOT NULL,
  `issuer` VARCHAR(191) NOT NULL,
  `subject` VARCHAR(191) NOT NULL,
  `observed_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `verified_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_identity_subject_unique` (`provider`, `subject_type`, `issuer`, `subject`),
  KEY `external_identities_user_idx` (`user_id`),
  CONSTRAINT `external_identities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `identity_conflicts` (
  `id` VARCHAR(191) NOT NULL,
  `provider` VARCHAR(64) NOT NULL,
  `primary_user_id` VARCHAR(191) NOT NULL,
  `conflicting_user_id` VARCHAR(191) NOT NULL,
  `subject_type` VARCHAR(64) NOT NULL,
  `issuer` VARCHAR(191) NOT NULL,
  `subject_hash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'open',
  `resolution` TEXT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `resolved_at` DATETIME(6) NULL,
  PRIMARY KEY (`id`),
  KEY `identity_conflicts_primary_user_idx` (`primary_user_id`),
  KEY `identity_conflicts_conflicting_user_idx` (`conflicting_user_id`),
  KEY `identity_conflicts_status_created_idx` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `verification` (
  `id` VARCHAR(191) NOT NULL,
  `identifier` VARCHAR(191) NOT NULL,
  `value` TEXT NOT NULL,
  `expiresAt` DATETIME(6) NOT NULL,
  `createdAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updatedAt` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `verification_identifier_idx` (`identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trips` (
  `id` VARCHAR(191) NOT NULL,
  `title` TEXT NOT NULL,
  `start_date` TEXT NOT NULL,
  `end_date` TEXT NOT NULL,
  `status` TEXT NOT NULL,
  `currency` VARCHAR(16) NOT NULL DEFAULT 'JPY',
  `cover_color` VARCHAR(32) NOT NULL DEFAULT '#3f6fc9',
  `cover_url` TEXT NULL,
  `intake` JSON NULL,
  `agent_seed_pending` TINYINT(1) NOT NULL DEFAULT 0,
  `owner_id` VARCHAR(191) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `version` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trip_members` (
  `id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `name` TEXT NOT NULL,
  `short_name` TEXT NOT NULL,
  `initials` TEXT NOT NULL,
  `avatar_bg` TEXT NOT NULL,
  `avatar_fg` TEXT NOT NULL,
  `is_current_user` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `image` TEXT NULL,
  `can_invite` TINYINT(1) NOT NULL DEFAULT 1,
  `role` VARCHAR(32) NOT NULL DEFAULT 'editor',
  `user_id` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `trip_members_trip_user_unique` (`trip_id`, `user_id`),
  KEY `trip_members_trip_idx` (`trip_id`),
  CONSTRAINT `trip_members_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trip_days` (
  `trip_id` VARCHAR(191) NOT NULL,
  `number` INT NOT NULL,
  `date_label` TEXT NOT NULL,
  `city` TEXT NOT NULL,
  `color` TEXT NOT NULL,
  `date` TEXT NOT NULL,
  PRIMARY KEY (`trip_id`, `number`),
  CONSTRAINT `trip_days_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stops` (
  `id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `day` INT NOT NULL,
  `time` TEXT NOT NULL,
  `duration` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `area` TEXT NOT NULL,
  `category` TEXT NOT NULL,
  `lat` DOUBLE NOT NULL,
  `lng` DOUBLE NOT NULL,
  `cost` INT NOT NULL DEFAULT 0,
  `created_by` TEXT NOT NULL,
  `transit` TINYINT(1) NOT NULL DEFAULT 0,
  `note` TEXT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `cost_currency` VARCHAR(16) NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  KEY `stops_trip_idx` (`trip_id`),
  CONSTRAINT `stops_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stop_votes` (
  `stop_id` VARCHAR(191) NOT NULL,
  `member_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`stop_id`, `member_id`),
  CONSTRAINT `stop_votes_stop_id_fkey` FOREIGN KEY (`stop_id`) REFERENCES `stops` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stop_comments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `stop_id` VARCHAR(191) NOT NULL,
  `author_id` TEXT NOT NULL,
  `text` TEXT NOT NULL,
  `time_label` TEXT NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `stop_comments_stop_idx` (`stop_id`),
  CONSTRAINT `stop_comments_stop_id_fkey` FOREIGN KEY (`stop_id`) REFERENCES `stops` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `expenses` (
  `id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `description` TEXT NOT NULL,
  `payer_id` TEXT NOT NULL,
  `amount` INT NOT NULL,
  `when_label` TEXT NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `currency` VARCHAR(16) NOT NULL DEFAULT '',
  `category` VARCHAR(64) NOT NULL DEFAULT 'Plan',
  PRIMARY KEY (`id`),
  KEY `expenses_trip_idx` (`trip_id`),
  CONSTRAINT `expenses_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `expense_participants` (
  `expense_id` VARCHAR(191) NOT NULL,
  `member_id` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`expense_id`, `member_id`),
  CONSTRAINT `expense_participants_expense_id_fkey` FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reservations` (
  `id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'tentative',
  `title` VARCHAR(160) NOT NULL,
  `provider` VARCHAR(160) NOT NULL DEFAULT '',
  `confirmation_number` VARCHAR(160) NOT NULL DEFAULT '',
  `start_at` DATETIME(6) NOT NULL,
  `end_at` DATETIME(6) NULL,
  `timezone` VARCHAR(100) NOT NULL,
  `location_name` VARCHAR(200) NOT NULL DEFAULT '',
  `address` VARCHAR(500) NOT NULL DEFAULT '',
  `latitude` DOUBLE NULL,
  `longitude` DOUBLE NULL,
  `day_number` INT NULL,
  `stop_id` VARCHAR(191) NULL,
  `expense_id` VARCHAR(191) NULL,
  `amount_minor` BIGINT NULL,
  `currency` CHAR(3) NULL,
  `notes` TEXT NOT NULL,
  `created_by` VARCHAR(191) NOT NULL,
  `idempotency_key` VARCHAR(200) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `revision` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reservations_idempotency_key` (`trip_id`, `created_by`, `idempotency_key`),
  KEY `reservations_trip_start_idx` (`trip_id`, `start_at`),
  KEY `reservations_stop_idx` (`stop_id`),
  KEY `reservations_expense_idx` (`expense_id`),
  CONSTRAINT `reservations_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reservations_stop_id_fkey` FOREIGN KEY (`stop_id`) REFERENCES `stops` (`id`) ON DELETE SET NULL,
  CONSTRAINT `reservations_expense_id_fkey` FOREIGN KEY (`expense_id`) REFERENCES `expenses` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trip_invites` (
  `id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `token_hash` VARCHAR(191) NOT NULL,
  `created_by` TEXT NOT NULL,
  `access_scope` VARCHAR(32) NOT NULL DEFAULT 'anyone',
  `role` VARCHAR(32) NOT NULL DEFAULT 'editor',
  `can_invite` TINYINT(1) NOT NULL DEFAULT 0,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `expires_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `trip_invites_token_hash_key` (`token_hash`),
  KEY `trip_invites_trip_idx` (`trip_id`),
  CONSTRAINT `trip_invites_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trip_invite_allowed_emails` (
  `invite_id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  PRIMARY KEY (`invite_id`, `email`),
  CONSTRAINT `trip_invite_allowed_emails_invite_id_fkey` FOREIGN KEY (`invite_id`) REFERENCES `trip_invites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trip_invite_acceptances` (
  `invite_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `accepted_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`invite_id`, `user_id`),
  CONSTRAINT `trip_invite_acceptances_invite_id_fkey` FOREIGN KEY (`invite_id`) REFERENCES `trip_invites` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_preferences` (
  `user_id` VARCHAR(191) NOT NULL,
  `planner_sidebar_width` DECIMAL(10,4) NOT NULL DEFAULT 30,
  `planner_sidebar_collapsed` TINYINT(1) NOT NULL DEFAULT 0,
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `agent_panel_collapsed` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `user_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_messages` (
  `id` VARCHAR(191) NOT NULL,
  `seq` BIGINT NOT NULL AUTO_INCREMENT,
  `trip_id` VARCHAR(191) NOT NULL,
  `role` TEXT NOT NULL,
  `parts` JSON NOT NULL,
  `actor_user_id` VARCHAR(191) NULL,
  `source` VARCHAR(64) NOT NULL DEFAULT 'chat',
  `trip_version` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `agent_messages_seq_unique` (`seq`),
  KEY `agent_messages_trip_seq_idx` (`trip_id`, `seq`),
  CONSTRAINT `agent_messages_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_suggestions` (
  `id` VARCHAR(191) NOT NULL,
  `trip_id` VARCHAR(191) NOT NULL,
  `message_id` VARCHAR(191) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `severity` TEXT NOT NULL,
  `confidence` DOUBLE NOT NULL,
  `reason` TEXT NOT NULL,
  `suggestion_text` TEXT NOT NULL,
  `patch` JSON NOT NULL,
  `trip_version` INT NOT NULL,
  `expires_at` DATETIME(6) NULL,
  `applied_by` VARCHAR(191) NULL,
  `applied_at` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `agent_suggestions_trip_status_idx` (`trip_id`, `status`),
  CONSTRAINT `agent_suggestions_trip_id_fkey` FOREIGN KEY (`trip_id`) REFERENCES `trips` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `agent_suggestion_dismissals` (
  `suggestion_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `dismissed_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`suggestion_id`, `user_id`),
  CONSTRAINT `agent_suggestion_dismissals_suggestion_id_fkey` FOREIGN KEY (`suggestion_id`) REFERENCES `agent_suggestions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `name` VARCHAR(191) NOT NULL,
  `applied_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
