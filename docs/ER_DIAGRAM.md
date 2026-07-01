# ER Diagram - Jotun Billing System

## Normalized Design

ក្នុង project នេះ `invoice_items`, `invoice_payments`, និង `stock_movements`
ត្រូវបានបំបែកជា tables ដាច់ដោយឡែក ដើម្បីបង្ហាញ normalized relational design
សម្រាប់ MySQL/Sequelize។ JSON fields នៅក្នុង `invoices` និង `products` ត្រូវបានរក្សាទុក
សម្រាប់ backward compatibility និង backup migration ប៉ុន្តែ tables ខាងក្រោមគឺជារចនាសម្ព័ន្ធសំខាន់សម្រាប់សារណា។

```mermaid
erDiagram
  ADMINS {
    uuid id PK
    string username
    string passwordHash
    string role
    boolean active
    datetime lastLoginAt
  }

  CUSTOMERS {
    uuid id PK
    string name
    string phone
    text address
    datetime deletedAt
  }

  SALESPEOPLE {
    uuid id PK
    string name
    string phone
    text notes
    datetime deletedAt
  }

  PRODUCTS {
    uuid id PK
    string name
    string itemCode
    string colorCode
    string unit
    decimal unitPrice
    decimal stockQuantity
    decimal lowStockThreshold
    datetime deletedAt
  }

  INVOICES {
    uuid id PK
    string invoiceNumber
    string shareToken
    datetime invoiceDate
    datetime dueDate
    uuid customerId FK
    string salesChannel
    uuid salespersonId FK
    decimal subtotal
    decimal discount
    decimal taxAmount
    decimal deliveryFee
    decimal depositAmount
    decimal grandTotal
    decimal paidAmount
    decimal balanceDue
    string status
    string paymentStatus
    boolean stockApplied
    datetime deletedAt
  }

  INVOICE_ITEMS {
    string id PK
    uuid invoiceId FK
    uuid productId FK
    string description
    string itemCode
    string colorCode
    decimal quantity
    string unit
    decimal unitPrice
    decimal discount
    decimal total
    int sortOrder
  }

  INVOICE_PAYMENTS {
    string id PK
    uuid invoiceId FK
    decimal amount
    datetime paidAt
    string receivedBy
    text note
    string recordedBy
  }

  STOCK_MOVEMENTS {
    string id PK
    uuid productId FK
    uuid invoiceId FK
    string type
    decimal quantity
    decimal previousStock
    decimal resultingStock
    text note
    string recordedBy
    datetime recordedAt
    string source
    string referenceNumber
  }

  AUDIT_LOGS {
    uuid id PK
    string actorUsername
    string action
    string entityType
    string entityId
    text summary
    json details
    datetime createdAt
  }

  BACKUP_SNAPSHOTS {
    uuid id PK
    string type
    string label
    string createdBy
    json counts
    json payload
    datetime createdAt
  }

  SYSTEM_SETTINGS {
    uuid id PK
    string key
    string companyName
    json phones
    text address
    text sellerSignature
  }

  COUNTERS {
    string id PK
    int sequence
  }

  CUSTOMERS ||--o{ INVOICES : has
  SALESPEOPLE ||--o{ INVOICES : handles
  INVOICES ||--|{ INVOICE_ITEMS : contains
  PRODUCTS ||--o{ INVOICE_ITEMS : sold_as
  INVOICES ||--o{ INVOICE_PAYMENTS : receives
  PRODUCTS ||--o{ STOCK_MOVEMENTS : tracks
  INVOICES ||--o{ STOCK_MOVEMENTS : adjusts
  ADMINS ||--o{ AUDIT_LOGS : performs
```

## Key Rules

- `invoices.invoiceNumber` មាន unique sequence ជា `INV-YYYY-00001`។
- `invoice_items.invoiceId` ជា foreign key ទៅ `invoices.id` ហើយលុបតាម invoice។
- `invoice_payments.invoiceId` ជា foreign key ទៅ `invoices.id` សម្រាប់ payment history។
- `stock_movements.productId` ជា foreign key ទៅ `products.id` សម្រាប់ stock audit trail។
- `stock_movements.invoiceId` ត្រូវបានប្រើពេល stock កាត់/សងវិញដោយសារ invoice។
- `invoices.stockApplied` ការពារ stock មិនឲ្យកាត់ស្ទួនពេល invoice ត្រូវបាន update។
