# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Existing Nx monorepo: `apps/web` uses Next.js, React, TypeScript, Tailwind, Ant Design, TanStack Query, Zustand, and React Hook Form; `apps/api` uses NestJS, Prisma, and PostgreSQL with Redis infrastructure; `apps/mini` is the WeChat mini-program client; `packages/shared` contains shared types and contracts.

## Users

The primary users are owners and managers of paint-protection-film stores, along with sales, finance, warehouse, and construction staff. They use the product in day-to-day store operations to coordinate customers, orders, inventory, construction, quality inspection, warranties, after-sales work, commissions, and finance.

## Product Purpose

MallBay is an integrated SaaS system for paint-protection-film stores. It makes the full order-to-delivery workflow visible and actionable across roles, from customer and order creation through inventory allocation, construction, inspection, warranty activation, final payment, delivery, and after-sales. Success means fewer cross-role omissions, clearer operational ownership, and reliable business records.

## Positioning

MallBay is differentiated by linking the complete paint-protection-film store workflow in one operational system: order fulfillment status, inventory and material handling, construction records and inspection, warranty timing, payment settlement, notifications, and audit history are coordinated rather than managed as disconnected modules.

## Operating Context

The Web management app is used for store administration and cross-role workbench operations. The WeChat mini-program supports construction staff, including work in environments with unreliable connectivity and offline queue/synchronization needs. The product operates across multiple stores and role permissions.

The authoritative order fulfillment sequence is: order creation, inventory matching and locking, outbound material handling, construction assignment and work, construction completion, quality inspection, warranty-card generation, final payment, and final delivery. Construction completion is not equivalent to order completion; final delivery follows cleared final payment and performs the related warranty, order, task, and audit updates transactionally.

## Capabilities and Constraints

- Authentication, store membership, role permissions, notifications, and audit events are core product capabilities.
- Business domains include customers, products, sales quotes, orders, inventory, purchasing, construction, warranties, after-sales, commissions, finance, invoices, rebates, reports, and system settings.
- Failed quality inspection enters a separate rework path using construction and audit snapshots; the product does not invent a separate rework-record entity.
- A warranty may be created before final payment, but its validity period begins only at final delivery.
- Procurement receipt increases available inventory but does not automatically reserve stock for an order.
- Final-payment work items are deduplicated per order; reading a notification is not the same as completing the task.
- Current workflow stage is derived from existing order, construction, inspection, warranty, and payment facts rather than expanded into an excessive status enum.
- Preserve Chinese business terminology and the distinction between the Web management experience and the construction mini-program experience.
- Existing project behavior and database migrations are the source of truth when historical plans conflict with implementation.

## Evidence on Hand

The repository contains the current system overview at `docs/current-system-overview.md`, the V1.7 requirements specification at `docs/漆面保护膜施工管理系统-需求规格说明书-V1.7.docx`, implementation plans and acceptance checklists under `docs/`, current Web and API code under `apps/web/` and `apps/api/`, the WeChat mini-program under `apps/mini/`, and prototype construction/authentication assets under `apps/web/public/prototype-assets/`.

Future work must not fabricate testimonials, customers, benchmarks, pricing, or other external proof. Existing images and documents are evidence of product workflows or prototypes, not automatically approved marketing claims.

## Product Principles

- Keep the whole store workflow coherent across roles and devices.
- Make operational ownership and the next required action explicit.
- Preserve business truth across inventory, construction, quality, payment, warranty, and audit records.
- Support real construction conditions, including intermittent connectivity and later synchronization.
- Prefer derived, explainable workflow state over redundant status proliferation.

## Accessibility & Inclusion

No product-specific accessibility standard has been confirmed. Future interface work should preserve accessible labels, keyboard-operable Web workflows, readable Chinese text, clear status communication, and touch-friendly controls in the construction mini-program.
