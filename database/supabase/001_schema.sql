-- Tofu's Closet POS
-- Supabase PostgreSQL schema
-- Migrated from local MySQL

create extension if not exists pgcrypto;

-- =========================================================
-- USERS
-- =========================================================

create table if not exists users (
  id varchar(64) primary key,
  name varchar(191) not null,
  email varchar(191) not null unique,
  password_hash varchar(255) not null,
  role varchar(32) not null default 'Staff',
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  permissions jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_role on users(role);
create index if not exists idx_users_status on users(status);

-- =========================================================
-- CUSTOMERS
-- =========================================================

create table if not exists customers (
  id varchar(64) primary key,
  customer_code varchar(64) not null unique,
  name varchar(191) not null,
  phone varchar(64) not null,
  email varchar(191),
  contact varchar(191),
  address text,
  township varchar(191),
  delivery_method varchar(64),
  notes text,
  customer_visible_notes text,
  internal_notes text,
  tags jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customers_phone on customers(phone);
create index if not exists idx_customers_email on customers(email);
create index if not exists idx_customers_name on customers(name);

-- =========================================================
-- PRODUCTS
-- =========================================================

create table if not exists products (
  id varchar(64) primary key,
  product_code varchar(64) not null unique,
  sku varchar(64) not null unique,
  name varchar(191) not null,
  description text,
  category varchar(128),
  supplier varchar(191),
  product_type varchar(32) not null default 'Preorder',
  cost_price numeric(14,2) not null default 0.00,
  selling_price numeric(14,2) not null default 0.00,
  discount_price numeric(14,2) not null default 0.00,
  supplier_link varchar(512),
  supplier_product_code varchar(128),
  supplier_price numeric(14,2) not null default 0.00,
  estimated_product_cost numeric(14,2) not null default 0.00,
  default_waiting_time varchar(64),
  default_cargo_cost numeric(14,2) not null default 0.00,
  customer_description text,
  notes text,
  internal_notes text,
  available_sizes jsonb,
  available_colors jsonb,
  images jsonb,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_products_name on products(name);
create index if not exists idx_products_category on products(category);
create index if not exists idx_products_status on products(status);
create index if not exists idx_products_type on products(product_type);

-- =========================================================
-- PRODUCT VARIANTS
-- =========================================================

create table if not exists product_variants (
  id varchar(64) primary key,
  product_id varchar(64) not null,
  sku varchar(96) unique,
  size varchar(64) not null default 'Free',
  color varchar(64) not null default 'Default',
  cost_price numeric(14,2),
  selling_price numeric(14,2),
  stock_quantity integer not null default 0,
  reserved_quantity integer not null default 0,
  sold_quantity integer not null default 0,
  returned_quantity integer not null default 0,
  damaged_quantity integer not null default 0,
  low_stock_threshold integer not null default 3,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fk_product_variants_product
    foreign key (product_id)
    references products(id)
    on delete cascade
    on update cascade
);

create index if not exists idx_product_variants_combo
  on product_variants(product_id, color, size);

create index if not exists idx_product_variants_product
  on product_variants(product_id);

create index if not exists idx_product_variants_status
  on product_variants(status);

-- =========================================================
-- CARGO BATCHES
-- =========================================================

create table if not exists cargo_batches (
  id varchar(64) primary key,
  batch_id varchar(64) not null unique,
  route varchar(128) not null,
  cargo_fee numeric(14,2) not null default 0.00,
  china_muse_cargo_fee numeric(14,2) not null default 0.00,
  muse_yangon_cargo_fee numeric(14,2) not null default 0.00,
  other_expenses numeric(14,2) not null default 0.00,
  status varchar(64) not null default 'Preparing',
  batch_date date,
  arrival_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cargo_batches_status
  on cargo_batches(status);

create index if not exists idx_cargo_batches_route
  on cargo_batches(route);

-- =========================================================
-- ORDERS
-- =========================================================

create table if not exists orders (
  id varchar(64) primary key,
  order_number varchar(64) not null unique,
  customer_id varchar(64) not null,
  created_by varchar(64),
  order_type varchar(32) not null default 'Preorder',
  order_date date not null,
  status varchar(64) not null default 'Pending Confirmation',
  preorder_status varchar(64),
  packing_status varchar(64),
  delivery_status varchar(64),
  delivery_method varchar(64),
  tracking_number varchar(128),
  waiting_time varchar(64),
  expected_arrival date,
  batch_id varchar(64),
  customer_notified boolean not null default false,
  customer_notes text,
  internal_notes text,
  stock_state varchar(32) not null default 'draft',

  subtotal numeric(14,2) not null default 0.00,
  discount numeric(14,2) not null default 0.00,
  delivery_fee numeric(14,2) not null default 0.00,
  shop_delivery_cost numeric(14,2) not null default 0.00,
  allocated_expense numeric(14,2) not null default 0.00,
  total numeric(14,2) not null default 0.00,
  paid_amount numeric(14,2) not null default 0.00,
  refunded_amount numeric(14,2) not null default 0.00,
  final_paid_amount numeric(14,2) not null default 0.00,
  balance numeric(14,2) not null default 0.00,
  required_deposit numeric(14,2) not null default 0.00,
  product_cost numeric(14,2) not null default 0.00,
  cargo_cost numeric(14,2) not null default 0.00,
  net_profit numeric(14,2) not null default 0.00,

  payment_status varchar(64),

  packed_by varchar(64),
  packed_by_name varchar(191),
  packed_at timestamptz,

  cancellation_reason text,
  cancelled_by varchar(64),
  cancelled_by_name varchar(191),
  cancelled_at timestamptz,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fk_orders_customer
    foreign key (customer_id)
    references customers(id)
    on delete restrict
    on update cascade,

  constraint fk_orders_created_by
    foreign key (created_by)
    references users(id)
    on delete set null
    on update cascade,

  constraint fk_orders_packed_by
    foreign key (packed_by)
    references users(id)
    on delete set null
    on update cascade,

  constraint fk_orders_cancelled_by
    foreign key (cancelled_by)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_created_by on orders(created_by);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_type on orders(order_type);
create index if not exists idx_orders_date on orders(order_date);
create index if not exists idx_orders_batch on orders(batch_id);
create index if not exists idx_orders_payment_status on orders(payment_status);

-- =========================================================
-- ORDER ITEMS
-- =========================================================

create table if not exists order_items (
  id varchar(64) primary key,
  order_id varchar(64) not null,
  product_id varchar(64) not null,
  variant_id varchar(64) not null,
  product_name_snapshot varchar(191) not null,
  sku varchar(64),
  size varchar(64),
  color varchar(64),
  quantity integer not null default 1,
  unit_price numeric(14,2) not null default 0.00,
  cost_price numeric(14,2) not null default 0.00,
  cargo_cost numeric(14,2) not null default 0.00,
  discount numeric(14,2) not null default 0.00,
  subtotal numeric(14,2) not null default 0.00,
  supplier_status varchar(64),
  cargo_status varchar(64),
  arrival_status varchar(64),
  expected_arrival date,
  batch_id varchar(64),
  customer_notified boolean not null default false,
  created_at timestamptz not null default now(),

  constraint fk_order_items_order
    foreign key (order_id)
    references orders(id)
    on delete cascade
    on update cascade,

  constraint fk_order_items_product
    foreign key (product_id)
    references products(id)
    on delete restrict
    on update cascade,

  constraint fk_order_items_variant
    foreign key (variant_id)
    references product_variants(id)
    on delete restrict
    on update cascade
);

create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_order_items_product on order_items(product_id);
create index if not exists idx_order_items_variant on order_items(variant_id);
create index if not exists idx_order_items_batch on order_items(batch_id);

-- =========================================================
-- CARGO ITEMS
-- =========================================================

create table if not exists cargo_items (
  id varchar(64) primary key,
  cargo_batch_id varchar(64) not null,
  order_id varchar(64),
  order_item_id varchar(64),
  product_id varchar(64),
  cargo_fee numeric(14,2) not null default 0.00,
  status varchar(64),
  created_at timestamptz not null default now(),

  constraint fk_cargo_items_batch
    foreign key (cargo_batch_id)
    references cargo_batches(id)
    on delete cascade
    on update cascade,

  constraint fk_cargo_items_order
    foreign key (order_id)
    references orders(id)
    on delete set null
    on update cascade,

  constraint fk_cargo_items_order_item
    foreign key (order_item_id)
    references order_items(id)
    on delete set null
    on update cascade,

  constraint fk_cargo_items_product
    foreign key (product_id)
    references products(id)
    on delete set null
    on update cascade
);

create index if not exists idx_cargo_items_batch on cargo_items(cargo_batch_id);
create index if not exists idx_cargo_items_order on cargo_items(order_id);
create index if not exists idx_cargo_items_order_item on cargo_items(order_item_id);
create index if not exists idx_cargo_items_product on cargo_items(product_id);

-- =========================================================
-- PAYMENTS
-- =========================================================

create table if not exists payments (
  id varchar(64) primary key,
  order_id varchar(64) not null,
  customer_id varchar(64),
  amount numeric(14,2) not null,
  payment_method varchar(64) not null default 'KPay',
  payment_type varchar(32) not null default 'payment',
  payment_date date not null,
  reference varchar(128),
  received_by varchar(64),
  received_by_name varchar(191),
  notes text,
  created_at timestamptz not null default now(),

  constraint fk_payments_order
    foreign key (order_id)
    references orders(id)
    on delete restrict
    on update cascade,

  constraint fk_payments_customer
    foreign key (customer_id)
    references customers(id)
    on delete set null
    on update cascade,

  constraint fk_payments_received_by
    foreign key (received_by)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_payments_order on payments(order_id);
create index if not exists idx_payments_customer on payments(customer_id);
create index if not exists idx_payments_date on payments(payment_date);
create index if not exists idx_payments_method on payments(payment_method);

-- =========================================================
-- EXPENSES
-- =========================================================

create table if not exists expenses (
  id varchar(64) primary key,
  category varchar(128) not null default 'Other',
  amount numeric(14,2) not null,
  expense_date date not null,
  description text,
  payment_method varchar(64),
  added_by varchar(64),
  added_by_name varchar(191),
  order_id varchar(64),
  batch_id varchar(64),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fk_expenses_added_by
    foreign key (added_by)
    references users(id)
    on delete set null
    on update cascade,

  constraint fk_expenses_order
    foreign key (order_id)
    references orders(id)
    on delete set null
    on update cascade
);

create index if not exists idx_expenses_date on expenses(expense_date);
create index if not exists idx_expenses_category on expenses(category);
create index if not exists idx_expenses_order on expenses(order_id);
create index if not exists idx_expenses_batch on expenses(batch_id);

-- =========================================================
-- ORDER STATUS HISTORY
-- =========================================================

create table if not exists order_status_history (
  id varchar(64) primary key,
  order_id varchar(64) not null,
  old_status varchar(64),
  new_status varchar(64) not null,
  changed_by varchar(64),
  changed_at timestamptz not null default now(),
  note text,

  constraint fk_order_status_history_order
    foreign key (order_id)
    references orders(id)
    on delete cascade
    on update cascade,

  constraint fk_order_status_history_user
    foreign key (changed_by)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_order_status_history_order
  on order_status_history(order_id);

create index if not exists idx_order_status_history_changed_at
  on order_status_history(changed_at);

-- =========================================================
-- ORDER TIMELINE
-- =========================================================

create table if not exists order_timeline (
  id varchar(64) primary key,
  order_id varchar(64) not null,
  user_id varchar(64),
  user_name varchar(191),
  title varchar(191) not null,
  note text,
  created_at timestamptz not null default now(),

  constraint fk_order_timeline_order
    foreign key (order_id)
    references orders(id)
    on delete cascade
    on update cascade,

  constraint fk_order_timeline_user
    foreign key (user_id)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_order_timeline_order
  on order_timeline(order_id);

-- =========================================================
-- AUDIT LOGS
-- =========================================================

create table if not exists audit_logs (
  id varchar(64) primary key,
  user_id varchar(64),
  user_name varchar(191),
  action varchar(191) not null,
  entity_type varchar(64),
  entity_id varchar(64),
  details text,
  created_at timestamptz not null default now(),

  constraint fk_audit_user
    foreign key (user_id)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_audit_user on audit_logs(user_id);
create index if not exists idx_audit_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_audit_created on audit_logs(created_at);

-- =========================================================
-- PRODUCT COST HISTORY
-- =========================================================

create table if not exists product_cost_history (
  id varchar(64) primary key,
  product_id varchar(64) not null,
  cost numeric(14,2) not null,
  cost_date date not null,
  note varchar(255),
  created_at timestamptz not null default now(),

  constraint fk_product_cost_history_product
    foreign key (product_id)
    references products(id)
    on delete cascade
    on update cascade
);

create index if not exists idx_product_cost_history_product
  on product_cost_history(product_id);

-- =========================================================
-- REFUNDS
-- =========================================================

create table if not exists refunds (
  id varchar(64) primary key,
  order_id varchar(64) not null,
  customer_id varchar(64),
  amount numeric(14,2) not null,
  method varchar(64) not null default 'KPay',
  reason varchar(255),
  refund_date date not null,
  processed_by varchar(64),
  processed_by_name varchar(191),
  created_at timestamptz not null default now(),

  constraint fk_refunds_order
    foreign key (order_id)
    references orders(id)
    on delete restrict
    on update cascade,

  constraint fk_refunds_customer
    foreign key (customer_id)
    references customers(id)
    on delete set null
    on update cascade,

  constraint fk_refunds_processed_by
    foreign key (processed_by)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_refunds_order on refunds(order_id);
create index if not exists idx_refunds_date on refunds(refund_date);

-- =========================================================
-- RETURNS
-- =========================================================

create table if not exists returns (
  id varchar(64) primary key,
  order_id varchar(64) not null,
  customer_id varchar(64),
  reason varchar(255),
  status varchar(64) not null default 'Processed',
  processed_by varchar(64),
  processed_by_name varchar(191),
  return_date date not null,
  created_at timestamptz not null default now(),

  constraint fk_returns_order
    foreign key (order_id)
    references orders(id)
    on delete restrict
    on update cascade,

  constraint fk_returns_customer
    foreign key (customer_id)
    references customers(id)
    on delete set null
    on update cascade,

  constraint fk_returns_processed_by
    foreign key (processed_by)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_returns_order on returns(order_id);
create index if not exists idx_returns_status on returns(status);

-- =========================================================
-- RETURN ITEMS
-- =========================================================

create table if not exists return_items (
  id varchar(64) primary key,
  return_id varchar(64) not null,
  order_item_id varchar(64),
  product_name varchar(191),
  variant_id varchar(64),
  color varchar(64),
  size varchar(64),
  quantity integer not null default 1,
  condition varchar(32) not null default 'Resellable',
  created_at timestamptz not null default now(),

  constraint fk_return_items_return
    foreign key (return_id)
    references returns(id)
    on delete cascade
    on update cascade,

  constraint fk_return_items_order_item
    foreign key (order_item_id)
    references order_items(id)
    on delete set null
    on update cascade,

  constraint fk_return_items_variant
    foreign key (variant_id)
    references product_variants(id)
    on delete set null
    on update cascade
);

create index if not exists idx_return_items_return
  on return_items(return_id);

-- =========================================================
-- INVENTORY TRANSACTIONS
-- =========================================================

create table if not exists inventory_transactions (
  id varchar(64) primary key,
  product_id varchar(64),
  variant_id varchar(64),
  product_name varchar(191),
  variant_label varchar(191),
  transaction_type varchar(64) not null,
  quantity integer not null,
  reference_type varchar(64),
  reference_id varchar(64),
  staff_id varchar(64),
  staff_name varchar(191),
  notes text,
  created_at timestamptz not null default now(),

  constraint fk_inventory_product
    foreign key (product_id)
    references products(id)
    on delete set null
    on update cascade,

  constraint fk_inventory_variant
    foreign key (variant_id)
    references product_variants(id)
    on delete set null
    on update cascade,

  constraint fk_inventory_staff
    foreign key (staff_id)
    references users(id)
    on delete set null
    on update cascade
);

create index if not exists idx_inventory_product
  on inventory_transactions(product_id);

create index if not exists idx_inventory_variant
  on inventory_transactions(variant_id);

create index if not exists idx_inventory_type
  on inventory_transactions(transaction_type);

create index if not exists idx_inventory_reference
  on inventory_transactions(reference_type, reference_id);

create index if not exists idx_inventory_created
  on inventory_transactions(created_at);

-- =========================================================
-- DISMISSED NOTIFICATIONS
-- =========================================================

create table if not exists dismissed_notifications (
  id varchar(191) primary key,
  dismissed_at timestamptz not null default now()
);

-- =========================================================
-- SETTINGS
-- =========================================================

create table if not exists settings (
  setting_key varchar(191) primary key,
  setting_value jsonb,
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SUPPLIERS
-- =========================================================

create table if not exists suppliers (
  id varchar(64) primary key,
  name varchar(191) not null unique,
  platform varchar(128),
  supplier_link varchar(512),
  contact varchar(191),
  note text,
  product_cost numeric(14,2) not null default 0.00,
  supplier_status varchar(64) not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- SCHEMA MIGRATIONS
-- =========================================================

create table if not exists schema_migrations (
  id integer generated by default as identity primary key,
  filename varchar(191) not null unique,
  applied_at timestamptz not null default now()
);

-- =========================================================
-- UPDATED_AT TRIGGER
-- MySQL ON UPDATE CURRENT_TIMESTAMP equivalent
-- =========================================================

create or replace function update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at
before update on users
for each row
execute function update_updated_at_column();

drop trigger if exists trg_customers_updated_at on customers;
create trigger trg_customers_updated_at
before update on customers
for each row
execute function update_updated_at_column();

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
before update on products
for each row
execute function update_updated_at_column();

drop trigger if exists trg_product_variants_updated_at on product_variants;
create trigger trg_product_variants_updated_at
before update on product_variants
for each row
execute function update_updated_at_column();

drop trigger if exists trg_cargo_batches_updated_at on cargo_batches;
create trigger trg_cargo_batches_updated_at
before update on cargo_batches
for each row
execute function update_updated_at_column();

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
before update on orders
for each row
execute function update_updated_at_column();

drop trigger if exists trg_expenses_updated_at on expenses;
create trigger trg_expenses_updated_at
before update on expenses
for each row
execute function update_updated_at_column();

drop trigger if exists trg_suppliers_updated_at on suppliers;
create trigger trg_suppliers_updated_at
before update on suppliers
for each row
execute function update_updated_at_column();

drop trigger if exists trg_settings_updated_at on settings;
create trigger trg_settings_updated_at
before update on settings
for each row
execute function update_updated_at_column();