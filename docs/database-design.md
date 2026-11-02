# Database Design

## 1. Design principles

The application requires a normalized relational model with strict financial validation. The database should:

- keep customer debt records separate by category
- support many-to-many allocation between payments and transactions
- protect against over-allocation, under-allocation, and silent credits
- preserve historical records
- use Decimal/Numeric fields for money values
- rely on database transactions during financial update workflows

## 2. Core entities

### 2.1 users

Stores authenticated application users.

Suggested schema:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'EMPLOYEE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 customers

Stores customer profile information.

```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  contact_number TEXT,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.3 transactions

Stores all debt transactions, regardless of category.

```sql
CREATE TYPE transaction_type AS ENUM ('MONEY_LOAN', 'STORE_ITEMS');
CREATE TYPE transaction_entry_mode AS ENUM ('ITEMIZED', 'TOTAL_ONLY');
CREATE TYPE transaction_status AS ENUM ('ACTIVE', 'VOIDED', 'REVERSED');

CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  user_id UUID NOT NULL REFERENCES users(id),
  type transaction_type NOT NULL,
  entry_mode transaction_entry_mode,
  total_amount NUMERIC(18,2) NOT NULL CHECK (total_amount > 0),
  status transaction_status NOT NULL DEFAULT 'ACTIVE',
  description TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Rules:

- Money Utang transactions can have no transaction items.
- Store Items Utang transactions may be `ITEMIZED` or `TOTAL_ONLY`.
- `ITEMIZED` entries contain one or more item rows; `TOTAL_ONLY` entries store the total and optional description without item rows.
- Money Utang transactions have no entry mode.
- Transaction status should be explicit and never a hard delete.

### 2.4 transaction_items

For store-item debt entries. Historical product records must not change when future prices change.

```sql
CREATE TABLE transaction_items (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  item_name TEXT NOT NULL,
  quantity NUMERIC(18,3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(18,2) NOT NULL CHECK (unit_price >= 0),
  subtotal NUMERIC(18,2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.5 payments

Stores payment receipts from customers.

```sql
CREATE TYPE payment_status AS ENUM ('POSTED', 'VOIDED', 'REVERSED');

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  notes TEXT,
  status payment_status NOT NULL DEFAULT 'POSTED',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.6 payment_allocations

Maps payments to specific transactions.

```sql
CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES payments(id),
  transaction_id UUID NOT NULL REFERENCES transactions(id),
  allocated_amount NUMERIC(18,2) NOT NULL CHECK (allocated_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, transaction_id)
);
```

Business rules:

- a payment may be split across multiple transactions
- a payment may be split across Money Utang and Store Items Utang
- total allocation for a payment must equal the payment amount
- allocation must never exceed the outstanding amount of the target transaction
- the backend must also verify that payment and target transaction belong to the same customer

### 2.7 audit_logs

Records important edits and reversals.

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.8 idempotency_records

Stores the response for a financial create request so network retries cannot create duplicate debt or payments.

```sql
CREATE TABLE idempotency_records (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  key VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_status INTEGER,
  response_body JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, key)
);
```

The idempotency record and financial write must commit atomically. Reusing the same key with the same request returns the stored result; reusing it for a different request returns a conflict. Retain the record long enough to cover realistic client retries; cleanup must not remove active records.

## 3. Financial calculation model

The core financial rule is:

```text
Outstanding balance for a debt category =
  total active debt transactions for category
  - valid payment allocations applied to those transactions
```

This should be calculated in the database or through a backend service using a consistent decimal model, never via JavaScript float values.

### 3.1 Per-transaction outstanding balance

For each transaction:

```text
transaction_outstanding = transaction.total_amount - total_allocated_amount_for_transaction
```

### 3.2 Customer category summary

For each customer, grouped by transaction type:

```text
money_utang_balance = sum(active MONEY_LOAN transactions outstanding)
store_items_balance = sum(active STORE_ITEMS transactions outstanding)
combined_balance = money_utang_balance + store_items_balance
```

### 3.3 Payment allocation validation

The system must ensure:

- each payment allocation refers to an existing active transaction
- total allocations for the payment equal the payment amount exactly
- each allocation is less than or equal to the available outstanding amount on the transaction
- payment amounts are not silently left unallocated

## 4. Recommended relational relationships

```text
customers 1---n transactions
customers 1---n payments
users 1---n transactions
users 1---n payments
users 1---n audit_logs
transactions 1---n transaction_items
transactions 1---n payment_allocations
payments 1---n payment_allocations
```

## 5. Important implementation notes

### 5.1 No hard delete for financial records

Financial records should never be permanently removed from the system. Instead:

- mark a transaction as voided or reversed
- mark a payment as voided or reversed
- preserve the original values in the audit log

### 5.2 Payments are not automatically attached to a debt type

The system must explicitly capture allocated amounts per transaction and per category. This avoids false assumptions such as:

- a payment to a customer always goes to one category
- a payment without allocation is acceptable
- category totals can be inferred without traceable payment lines

### 5.3 Historical item prices are snapshots

When a product is sold on credit, the system should store the item description and final price at the moment of sale. Later product pricing updates must not change historical debt records.

## 6. Suggested edge cases to model

- customer has both money debt and item debt
- customer makes a partial payment that covers both categories
- customer overpays a single transaction and must be prevented or handled explicitly
- payment allocation exceeds remaining balance
- voiding a transaction that already has payment allocations
- reversing a payment after it was allocated
- customer with a stale or archived record still having debt history

## 7. Database transaction workflow recommendations

All financial writes should happen in a database transaction:

1. validate transaction or payment input
2. ensure balances remain valid
3. write primary record
4. write allocation records
5. write audit log
6. commit only if all checks pass

This protects against partial financial corruption.

## 8. Open design recommendation

For the first release, keep the model intentionally simple and accounting-safe rather than highly abstract. Avoid generic ledger tooling until business usage proves more complexity is required.
