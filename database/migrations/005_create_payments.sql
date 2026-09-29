CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_method VARCHAR(64) NOT NULL DEFAULT 'KPay',
  payment_type VARCHAR(32) NOT NULL DEFAULT 'payment',
  payment_date DATE NOT NULL,
  reference VARCHAR(128) NULL,
  received_by VARCHAR(64) NULL,
  received_by_name VARCHAR(191) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_payments_order (order_id),
  KEY idx_payments_customer (customer_id),
  KEY idx_payments_date (payment_date),
  KEY idx_payments_method (payment_method),
  CONSTRAINT fk_payments_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_payments_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_payments_received_by
    FOREIGN KEY (received_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NULL,
  amount DECIMAL(14,2) NOT NULL,
  method VARCHAR(64) NOT NULL DEFAULT 'KPay',
  reason VARCHAR(255) NULL,
  refund_date DATE NOT NULL,
  processed_by VARCHAR(64) NULL,
  processed_by_name VARCHAR(191) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_refunds_order (order_id),
  KEY idx_refunds_date (refund_date),
  CONSTRAINT fk_refunds_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_refunds_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_refunds_processed_by
    FOREIGN KEY (processed_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS returns (
  id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NULL,
  reason VARCHAR(255) NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Processed',
  processed_by VARCHAR(64) NULL,
  processed_by_name VARCHAR(191) NULL,
  return_date DATE NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_returns_order (order_id),
  KEY idx_returns_status (status),
  CONSTRAINT fk_returns_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_returns_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_returns_processed_by
    FOREIGN KEY (processed_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS return_items (
  id VARCHAR(64) NOT NULL,
  return_id VARCHAR(64) NOT NULL,
  order_item_id VARCHAR(64) NULL,
  product_name VARCHAR(191) NULL,
  variant_id VARCHAR(64) NULL,
  color VARCHAR(64) NULL,
  size VARCHAR(64) NULL,
  quantity INT NOT NULL DEFAULT 1,
  `condition` VARCHAR(32) NOT NULL DEFAULT 'Resellable',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_return_items_return (return_id),
  CONSTRAINT fk_return_items_return
    FOREIGN KEY (return_id) REFERENCES returns (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_return_items_order_item
    FOREIGN KEY (order_item_id) REFERENCES order_items (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_return_items_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
