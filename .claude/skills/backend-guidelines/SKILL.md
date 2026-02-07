---
name: backend-guidelines
description: Best practices for backend development. Use when building APIs, working with databases, designing data models, implementing authentication, or writing server-side logic.
---

# Backend Guidelines

## Database query best practices

- **Prevent Injection**: Use parameterized queries / prepared statements / ORM query builders; never interpolate untrusted input into queries.
- **Validate Query Inputs**: Constrain sort fields, filter keys, and page sizes to an allowlist; reject unknown operators/fields.
- **Avoid N+1 Queries**: Batch, join, or eager-load related data where appropriate; profile and fix hot paths.
- **Select Only Needed Data**: Fetch only required columns/fields; avoid `SELECT *` and over-fetching large blobs.
- **Use the Right Pagination**: Prefer cursor/keyset pagination for large datasets; avoid deep offset pagination in hot paths.
- **Index to Match Access Patterns**: Add indexes that support real WHERE/JOIN/ORDER BY patterns; periodically review and remove unused indexes.
- **Keep Queries Predictable**: Avoid query shapes that change drastically with input (e.g., unbounded `IN` lists); cap complexity and sizes.
- **Be Careful with Text Search**: Use purpose-built search (DB indexes/FTS/external search) rather than `%LIKE%` scans on large tables.
- **Transactions for Related Writes**: Wrap related changes in transactions when atomicity is required; keep transactions short.
- **Concurrency & Locking Awareness**: Avoid long-running transactions/locks; choose appropriate isolation/locking strategies for the use case.
- **Set Query Timeouts**: Enforce timeouts and sensible limits (rows scanned/returned) to prevent runaway queries.
- **Handle Partial Failures**: Make retries safe (idempotent writes, dedupe where needed); avoid retrying non-transient errors.
- **Cache Where It Helps**: Cache expensive or high-frequency reads when appropriate; define TTLs and invalidation strategies.
- **Measure and Observe**: Log query timing and key metadata (not sensitive data); use EXPLAIN/profilers to optimize before guessing.
- **Avoid Doing Heavy Work in the DB by Accident**: Push large computations/formatting to the app layer unless the DB is the right tool (aggregations, filtering, sorting).
- **NoSQL-specific**: Design queries around indexes/partitions; avoid full scans; understand consistency guarantees and use the appropriate read/write consistency level.


---

## API endpoint standards and conventions

- **Resource-Oriented Design**: Model endpoints around resources and relationships; avoid RPC-style endpoints unless there’s a clear reason.
- **RESTful Methods**: Use HTTP methods correctly (GET, POST, PUT, PATCH, DELETE) and keep semantics consistent.
- **Consistent Naming**: Use consistent naming for paths (lowercase, hyphenated or underscored) and stick to it across the API.
- **Plural Nouns**: Use plural nouns for collections (e.g., `/users`, `/products`) and stable identifiers for items (e.g., `/users/{id}`).
- **Versioning**: Use an explicit versioning strategy (path or header) for breaking changes; avoid breaking existing clients unintentionally.
- **Limit Nested Resources**: Keep nesting shallow (typically ≤ 2 levels). Prefer linking/filters over deeply nested URLs.
- **Query Parameters for Retrieval**: Use query params for filtering, sorting, search, and pagination rather than new endpoints.
- **Consistent Pagination**: Standardize pagination inputs/outputs (limit/offset or cursor-based). Return pagination metadata consistently.
- **Idempotency Where Needed**: Ensure PUT/DELETE are idempotent; support idempotency keys for retryable POST operations that create resources.
- **Consistent Status Codes**: Return accurate status codes (200/201/204, 400/401/403/404/409/422, 429, 5xx) and use them consistently.
- **Standard Error Envelope**: Return a consistent error shape across endpoints (stable error code, human message, optional details, request/trace id).
- **Validation & Sanitization**: Validate request body, query, and path params at the boundary; reject invalid inputs with clear, consistent errors.
- **Authentication & Authorization**: Enforce authn/authz consistently; never rely on the client; return 401 vs 403 correctly.
- **Content Negotiation**: Be explicit about content types (e.g., JSON). Avoid surprising behavior based on implicit defaults.
- **Caching**: For cacheable GETs, define caching behavior (ETag/If-None-Match, Cache-Control) where it helps.
- **Rate Limiting**: Apply rate limiting as needed and include rate limit information in headers (and 429 with retry guidance).
- **Observability**: Include correlation/request ids; log key request metadata and timing (without sensitive data).
- **Documentation by Contract**: Keep an API spec up to date (OpenAPI/JSON schema equivalent), including examples and error cases.


---

## Data modeling best practices

### General (applies to relational + NoSQL)

- **Model the Domain, Not the UI**: Start from real domain concepts and workflows; don’t shape the schema around a single screen or endpoint.
- **Stable Identifiers**: Use stable primary identifiers for entities; avoid identifiers derived from mutable attributes.
- **Explicit Ownership & Boundaries**: Define which entity “owns” which data; avoid unclear shared/mirrored ownership.
- **Consistency Rules as Invariants**: Write down invariants (e.g., “an order total equals sum of line items”) and enforce them in one place (DB constraints, transactions, or application layer).
- **Schema Evolution**: Assume the schema will change. Prefer additive changes; avoid breaking existing readers/writers; plan migrations/rollouts.
- **Avoid Duplication Unless Intentional**: Duplicate only for performance/read reasons, and document the source of truth + sync strategy.
- **Indexing Strategy**: Add indexes to support critical queries; remove unused indexes; keep indexes aligned with actual access patterns.
- **Keep Writes Simple & Safe**: Prefer simple, atomic writes; make multi-step writes transactional or compensating where possible.
- **Auditability**: Track `created_at`, `updated_at`, and (when needed) `created_by`/`updated_by`. Use soft delete only when required and define retention rules.
- **Security & Data Access**: Model authorization needs early (tenant_id/org_id ownership, row/doc access rules). Don’t rely on obscurity.
- **PII/Secrets Hygiene**: Minimize stored sensitive data; encrypt where required; avoid storing derived secrets; apply least-privilege access.
- **Validation at Boundaries**: Validate data before persisting; treat DB as the last line of defense, not the first.
- **Plan for Scale Drivers**: Identify growth axes (users, events, files) and ensure the model won’t hit obvious limits.


---

### Document / NoSQL modeling guidelines (Firestore, DynamoDB, Mongo, etc.)

- **Design from Access Patterns**: Start with the queries you must support. Model to avoid expensive scans and cross-collection joins.
- **Denormalize Intentionally**: Duplicate data to serve reads when needed, but define the source of truth and how duplicates stay consistent.
- **Keep Documents Bounded**: Avoid “unbounded arrays” and ever-growing documents. Use subcollections/partitioning for high-cardinality data.
- **Sharding & Hotspots**: Avoid write hotspots (single doc updated by many clients). Partition counters/feeds/timelines.
- **Atomicity Limits**: Respect transaction/batch limits; design workflows so that partial failure is recoverable and idempotent.
- **Consistent Timestamps & Ordering**: Use server-side timestamps where possible; design for pagination (cursor-like fields).
- **Security Rules Compatibility**: Model documents so that access control can be enforced cleanly (per-tenant/per-user paths, explicit owner fields).


---

### Relational modeling guidelines (SQL / relational ORMs)

- **Normalize by Default**: Keep a normalized core model; denormalize only for proven performance needs.
- **Use Constraints**: Prefer DB constraints where possible (NOT NULL, UNIQUE, CHECK, FOREIGN KEY) to enforce invariants.
- **Relationships Explicitness**: Model relations explicitly (1:1, 1:N, N:M via join tables). Prefer join tables over arrays for N:M.
- **Transactions for Consistency**: Use transactions for multi-row invariants and multi-step writes.
- **Clear Cascades**: Be explicit about cascade behavior (delete/update). Avoid accidental cascading deletes.
- **Migration Discipline**: Migrations must be reversible when possible and safe for production (additive first; backfill; then enforce constraints).

