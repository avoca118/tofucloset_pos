CREATE TABLE IF NOT EXISTS cargo_batches (
  id VARCHAR(64) NOT NULL,
  batch_id VARCHAR(64) NOT NULL,
  route VARCHAR(128) NOT NULL,
  cargo_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  china_muse_cargo_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  muse_yangon_cargo_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  other_expenses DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(64) NOT NULL DEFAULT 'Preparing',
  batch_date DATE NULL,
  arrival_date DATE NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cargo_batches_batch_id (batch_id),
  KEY idx_cargo_batches_status (status),
  KEY idx_cargo_batches_route (route)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cargo_items (
  id VARCHAR(64) NOT NULL,
  cargo_batch_id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NULL,
  order_item_id VARCHAR(64) NULL,
  product_id VARCHAR(64) NULL,
  cargo_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_cargo_items_batch (cargo_batch_id),
  KEY idx_cargo_items_order (order_id),
  KEY idx_cargo_items_order_item (order_item_id),
  CONSTRAINT fk_cargo_items_batch
    FOREIGN KEY (cargo_batch_id) REFERENCES cargo_batches (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cargo_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cargo_items_order_item
    FOREIGN KEY (order_item_id) REFERENCES order_items (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cargo_items_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
