CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) NOT NULL,
  order_number VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  created_by VARCHAR(64) NULL,
  order_type VARCHAR(32) NOT NULL DEFAULT 'Preorder',
  order_date DATE NOT NULL,
  status VARCHAR(64) NOT NULL DEFAULT 'Pending Confirmation',
  preorder_status VARCHAR(64) NULL,
  packing_status VARCHAR(64) NULL,
  delivery_status VARCHAR(64) NULL,
  delivery_method VARCHAR(64) NULL,
  tracking_number VARCHAR(128) NULL,
  waiting_time VARCHAR(64) NULL,
  expected_arrival DATE NULL,
  batch_id VARCHAR(64) NULL,
  customer_notified TINYINT(1) NOT NULL DEFAULT 0,
  customer_notes TEXT NULL,
  internal_notes TEXT NULL,
  stock_state VARCHAR(32) NOT NULL DEFAULT 'draft',
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  delivery_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  shop_delivery_cost DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  allocated_expense DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  total DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  refunded_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  final_paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  required_deposit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  product_cost DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  cargo_cost DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  net_profit DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  payment_status VARCHAR(64) NULL,
  packed_by VARCHAR(64) NULL,
  packed_by_name VARCHAR(191) NULL,
  packed_at DATETIME(3) NULL,
  cancellation_reason TEXT NULL,
  cancelled_by VARCHAR(64) NULL,
  cancelled_by_name VARCHAR(191) NULL,
  cancelled_at DATETIME(3) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_number (order_number),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_created_by (created_by),
  KEY idx_orders_status (status),
  KEY idx_orders_type (order_type),
  KEY idx_orders_date (order_date),
  KEY idx_orders_batch (batch_id),
  KEY idx_orders_payment_status (payment_status),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_orders_packed_by
    FOREIGN KEY (packed_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_orders_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  variant_id VARCHAR(64) NOT NULL,
  product_name_snapshot VARCHAR(191) NOT NULL,
  sku VARCHAR(64) NULL,
  size VARCHAR(64) NULL,
  color VARCHAR(64) NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  cargo_cost DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  supplier_status VARCHAR(64) NULL,
  cargo_status VARCHAR(64) NULL,
  arrival_status VARCHAR(64) NULL,
  expected_arrival DATE NULL,
  batch_id VARCHAR(64) NULL,
  customer_notified TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_items_order (order_id),
  KEY idx_order_items_product (product_id),
  KEY idx_order_items_variant (variant_id),
  KEY idx_order_items_batch (batch_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_variant
    FOREIGN KEY (variant_id) REFERENCES product_variants (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_timeline (
  id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(64) NULL,
  user_name VARCHAR(191) NULL,
  title VARCHAR(191) NOT NULL,
  note TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_order_timeline_order (order_id),
  CONSTRAINT fk_order_timeline_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_timeline_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_status_history (
  id VARCHAR(64) NOT NULL,
  order_id VARCHAR(64) NOT NULL,
  old_status VARCHAR(64) NULL,
  new_status VARCHAR(64) NOT NULL,
  changed_by VARCHAR(64) NULL,
  changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  note TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_order_status_history_order (order_id),
  KEY idx_order_status_history_changed_at (changed_at),
  CONSTRAINT fk_order_status_history_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_status_history_user
    FOREIGN KEY (changed_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
