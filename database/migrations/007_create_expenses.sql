CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(64) NOT NULL,
  category VARCHAR(128) NOT NULL DEFAULT 'Other',
  amount DECIMAL(14,2) NOT NULL,
  expense_date DATE NOT NULL,
  description TEXT NULL,
  payment_method VARCHAR(64) NULL,
  added_by VARCHAR(64) NULL,
  added_by_name VARCHAR(191) NULL,
  order_id VARCHAR(64) NULL,
  batch_id VARCHAR(64) NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_expenses_date (expense_date),
  KEY idx_expenses_category (category),
  KEY idx_expenses_order (order_id),
  KEY idx_expenses_batch (batch_id),
  CONSTRAINT fk_expenses_added_by
    FOREIGN KEY (added_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_expenses_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
