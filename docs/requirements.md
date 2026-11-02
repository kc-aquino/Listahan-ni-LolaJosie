# Requirements Document

## 1. Project overview

The application is a digital replacement for Lola Josie's handwritten utang notebooks. It will support two debt categories:

- Money Utang: cash loans issued to customers.
- Store Items Utang: products given on credit without immediate payment.

The system must track each category separately while still allowing a combined summary when needed.

## 2. Business problem

Lola Josie currently keeps separate handwritten notebooks for:

1. money lending
2. store-item credit

The current process is manual and vulnerable to mistakes such as:

- missing previous balances
- confusion between debt types
- unclear payment allocation
- poor search and customer history retrieval
- inability to easily reconcile records

The digital system should improve transparency, reduce recordkeeping errors, and keep the workflow quick and usable for a senior citizen.

## 3. Core business rules

### 3.1 Separate debt categories

A customer may have both Money Utang and Store Items Utang, but each category must remain independent.

- customer balance must be computed by category
- each category must have its own transaction history
- payments must be allocated intentionally
- combined balance may be shown as a convenience view, but it is not a replacement for category-specific balances

### 3.2 Payment allocation

A payment is never assumed to belong to a single category automatically. The user must choose how the payment is distributed.

Examples:

- full payment to Money Utang
- full payment to Store Items Utang
- split payment across both categories

The application must validate that the allocation total matches the payment amount and never exceeds the active balance of a debt transaction.

### 3.3 Financial integrity

Financial records must be immutable in practice. Instead of deleting records, the system should mark them as reversed or voided with audit trails. A void identifies an erroneous entry; a reversal cancels an otherwise valid entry. Both retain the original record and remove its effect from the balance. This protects traceability and prevents accidental loss of business history.

### 3.4 Monetary values

All money values must be calculated using precise decimal arithmetic. The application must not depend on JavaScript floats for authoritative financial calculations.

## 4. Primary users

### Lola Josie

- shop owner
- senior citizen
- comfortable with basic smartphone usage
- familiar with Facebook, Shopee, and Lazada
- not expected to manage technical complexity

### Secondary users

- family members helping with bookkeeping
- future employees or assistants

## 5. Functional requirements

### 5.1 Customer management

- create customer
- update customer details
- search customers
- list customers
- archive or deactivate customers if needed
- view customer profile and balances

### 5.2 Money Utang transactions

- create a debt transaction for cash borrowed
- capture customer, amount, date, and optional description
- calculate current outstanding balance
- view transaction history
- void or reverse incorrect entries

### 5.3 Store Items Utang transactions

- create a debt transaction for product credit
- capture customer, item name, quantity, unit price, subtotal, date
- allow multiple items in one transaction
- provide simple total-only entry as fallback when itemization is not needed
- view transaction history
- void or reverse incorrect entries

### 5.4 Payment recording

- record payment received from a customer
- choose payment date and optional notes
- allocate payment to one or more debt transactions
- distribute payment across Money Utang and Store Items Utang
- display pre-save balance effects
- prevent incomplete allocations or over-allocation

### 5.5 Reporting

- total outstanding debt
- total Money Utang debt
- total Store Items Utang debt
- customer summaries
- daily and monthly report views

### 5.6 Audit trail

- record user action history
- record changes to financial records
- preserve a ledger of reversals and voids

## 6. Non-functional requirements

### Usability

- mobile-first design
- large readable text
- large touch targets
- high contrast
- simple navigation
- Filipino/Taglish labels
- simplified confirmation steps

### Reliability

- financial validation on the backend
- atomic update behavior for related records
- no silent customer credits
- no permanent deletion of financial history

### Maintainability

- TypeScript throughout
- clean backend module structure
- clear separation of concerns
- Prisma for database access
- server-side validation and ownership logic

## 7. Source-of-truth assumptions

These assumptions are intentionally written as explicit design decisions and should be reviewed before implementation:

1. Money Utang and Store Items Utang are separate ledger categories.
2. A single customer can have both categories active simultaneously.
3. Payment allocation is explicit and manual at the point of entry.
4. Financial corrections use reversal/void mechanisms instead of deletion.
5. Customer debts are tracked as transactions, not just as current balances.
6. Product prices are historical snapshots stored in the transaction record.

## 8. Confirmed business decisions

The following decisions were confirmed before implementation:

1. Launch with a single owner login. Keep the user model extensible, but defer employee accounts and roles until needed.
2. Preserve financial records. Record reversals and audit entries rather than deleting records. Reverse payments allocated to a debt before reversing that debt.
3. Archiving hides a customer from the default list but retains the profile and all history for lookup.
4. Archived customers may still make payments against existing debts; archiving prevents new debts, not settlement.
5. Period reports show gross debt/payment records, even if later voided or reversed, separately from outstanding balance as of each period end.

The user approved implementing all Phase 7 improvements after the core is stable: offline queue/synchronization, printable statements, QR customer lookup, inventory, and employee roles.

## Phase 7 implementation defaults

These are conservative initial choices for the approved Phase 7 scope:

- Offline financial entries remain visibly marked as pending until the server confirms them. Use idempotency keys, never silently merge conflicting updates, and ask the user to resolve a conflict before retrying.
- Printable statements use the browser print dialog and include a selected date range, transaction/payment history, separate category balances, and combined balance.
- QR codes encode an opaque customer lookup identifier, not customer names, balances, or contact details. Require an authenticated session to resolve a code and retain manual search as a fallback.
- Inventory is an internal catalog and stock count with auditable adjustments. Itemized credit entries may decrement stock only when a catalog product is explicitly selected; free-text item snapshots remain supported.
- Employee roles are added after the single-owner launch is stable; employees do not receive owner permissions by default.

## 9. Open questions / unresolved business requirements

The following items should be clarified before the related later-phase work:

1. Is there a receipt or nightly-reconciliation workflow that should affect how payments and reports are recorded?
2. Are there approved Tagalog/Taglish labels beyond “Pautang na Pera” and “Utang na Paninda”?
3. Should inventory later track product purchases/restocking in addition to stock adjustments?

## 10. Recommended implementation priority

The first milestone should not be a dashboard. The first milestone should be a working customer profile with:

- Money Utang balance
- Store Items Utang balance
- combined balance
- transaction history
- payment history

This is the foundation that makes later reporting and UI features reliable.

## 11. Acceptance direction

The application should be considered successful when:

- Lola can record customer debt without confusion
- Lola can allocate payments clearly
- balances are accurate per category
- records remain traceable over time
- financial history can be reviewed without ambiguity
- the interface is understandable to a senior user
