# SPEC-ADMIN-UI-UX — Clickable Data Table

| Field | Value |
|-------|-------|
| ID | SPEC-ADMIN-UI-UX |
| Status | Done |
| Owner | Product |
| Target repository | `master-admin` |
| Depends on | SPEC-ADMIN-UI-00 |
| Created | 2026-07-19 |

## Spec name

**ID:** SPEC-ADMIN-UI-UX  
**Title:** Clickable Ops Data Table  
**One line:** Shared list table: whole-row navigate to detail, hover/focus highlight, keyboard, minimize clicks.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Rows with a detail `href` are wholly clickable. | Must |
| FR-2 | Hover + `:focus-visible` highlight. | Must |
| FR-3 | Enter/Space on focused row navigates. | Must |
| FR-4 | Nested action buttons use `stopPropagation`. | Must |
| FR-5 | Empty state: one sentence + optional CTA. | Must |
| FR-6 | `StatusChip` for catalog / rental / customer statuses. | Must |
| FR-7 | `RowActionsMenu` (⋮) with `data-row-stop` so row click still works. | Must |

## Non-functional requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Reused by all Ops MVP list screens. | Must |
| NFR-2 | Plain-language empty copy (non-tech). | Must |

## Acceptance criteria

| Done | Requirement | Observable acceptance | Test / evidence |
|------|-------------|----------------------|-----------------|
| [x] | FR-1…7 | Shared kit under `components/features/data-table/` | Code + build |

## Changelog

- 2026-07-19 — Ops MVP shared table contract.
- 2026-07-19 — StatusChip + RowActionsMenu.
