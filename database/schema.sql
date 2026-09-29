-- Combined schema for a fresh MySQL database.
-- Applied by `npm run db:migrate` in order via database/migrations/*.sql
-- This file is the full recreate script for empty `tofus_closet_pos`.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS tofus_closet_pos
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tofus_closet_pos;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename VARCHAR(191) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
