CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) NOT NULL,
  product_code VARCHAR(64) NOT NULL,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  category VARCHAR(128) NULL,
  supplier VARCHAR(191) NULL,
  product_type VARCHAR(32) NOT NULL DEFAULT 'Preorder',
  cost_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  discount_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  supplier_link VARCHAR(512) NULL,
  supplier_product_code VARCHAR(128) NULL,
  supplier_price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  estimated_product_cost DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  default_waiting_time VARCHAR(64) NULL,
  default_cargo_cost DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  customer_description TEXT NULL,
  notes TEXT NULL,
  internal_notes TEXT NULL,
  available_sizes JSON NULL,
  available_colors JSON NULL,
  images JSON NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  UNIQUE KEY uq_products_code (product_code),
  KEY idx_products_name (name),
  KEY idx_products_category (category),
  KEY idx_products_status (status),
  KEY idx_products_type (product_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_variants (
  id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  sku VARCHAR(96) NULL,
  size VARCHAR(64) NOT NULL DEFAULT 'Free',
  color VARCHAR(64) NOT NULL DEFAULT 'Default',
  cost_price DECIMAL(14,2) NULL,
  selling_price DECIMAL(14,2) NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,
  sold_quantity INT NOT NULL DEFAULT 0,
  returned_quantity INT NOT NULL DEFAULT 0,
  damaged_quantity INT NOT NULL DEFAULT 0,
  low_stock_threshold INT NOT NULL DEFAULT 3,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_product_variants_sku (sku),
  KEY idx_product_variants_combo (product_id, color, size),
  KEY idx_product_variants_product (product_id),
  KEY idx_product_variants_status (status),
  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_cost_history (
  id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  cost DECIMAL(14,2) NOT NULL,
  cost_date DATE NOT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_product_cost_history_product (product_id),
  CONSTRAINT fk_product_cost_history_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
