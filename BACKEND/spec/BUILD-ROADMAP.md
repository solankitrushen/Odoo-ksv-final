# Rental Backend — Build Roadmap

See also: [LIFECYCLE.md](./LIFECYCLE.md) for full service map.

## Status

| Spec | Status |
|------|--------|
| 001 Auth / profile | Done (+ Cloudinary `/me/photo`) |
| 002–010, 013–014 | Done |
| 011 Bonus | Done (thin) |
| 015 Delivery | Done (thin) — Borzo shipment + `/deliveries` schedule |
| 016 Risk | Done (thin) — blacklist confirm gate + incidents |
| 017 Finance | Done (thin) — ledgers + AR aging + tax payable |
| 018 Procurement | Deferred — no Must FRs |
| 019 Analytics | Done (thin) — sales + revenue endpoints |

## Check

```bash
cd BACKEND && npm test -- --no-coverage
```
