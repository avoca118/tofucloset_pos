CREATE TABLE IF NOT EXISTS inventory_transactions (
  id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NULL,
  variant_id VARCHAR(64) NULL,
  product_name VARCHAR(191) NULL,
  variant_label VARCHAR(191) NULL,
  transaction_type VARCHAR(64) NOT NULL,
  quantity INT NOT NULL,
  reference_type VARCHAR(64) NULL,
  reference_id VARCHAR(64) NULL,
  staff_id VARCHAR(64) NULL,
  staff_name VARCHAR(191) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_inventory_product (product_id),
  KEY idx_inventory_variant (variant_id),
  KEY idx_inventory_type (transaction_type),
  KEY idx_inventory_reference (reference_type, reference_id),
  KEY idx_inventory_created (created_at),
  CONSTRAINT fk_inventory_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_staff
    FOREIGN KEY (staff_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
