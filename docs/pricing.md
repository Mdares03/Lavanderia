# La Burbuja — Pricing System Prompt

## Business context

La Burbuja is a laundromat in Santa Catarina, Nuevo León (Monterrey metro). It operates three service lines: self-service, drop-off (encargo), and dry cleaning (tintorería). The POS system must handle all three with distinct pricing logic.

---

## Machine inventory

| Machine ID | Type | Service line | Notes |
|---|---|---|---|
| Lavadora 1–12 | LG WM22VV2S6R combo (washer + dryer stacked) | Self-service | Client-facing, coin/app activated |
| Lavadora 13–15 | LG WM22VV2S6R combo | Drop-off (encargo) | Staff-operated, back room |
| Lavadora 16 | XL combo (larger capacity) | Edredones / bulky items | Staff-operated, back room |

---

## Service line 1: Self-service (autoservicio)

**Pricing model:** Fixed price per cycle. Customer activates machine directly.

| Service | Price (MXN) | Duration | Machine |
|---|---|---|---|
| Wash | $45 | 50 min | Lavadora 1–12 |
| Dry | $45 | 50 min | Lavadora 1–12 |

- **Total per load:** $90 (wash + dry)
- **Payment methods:** Cash (coin changer), card, app (future)
- **Detergent/softener:** Included in price OR vending machine add-on (TBD)

---

## Service line 2: Drop-off / encargo

**Pricing model:** Per-kilogram, with minimum charge. Staff weighs intake, calculates price, activates machine at that price.

| Parameter | Value |
|---|---|
| Price per kg | $33 MXN |
| Minimum charge | $120 MXN (~3.6 kg) |
| Service includes | Wash + dry + fold |
| Turnaround | 24 hours standard |

### Activation logic

1. Staff receives customer's bag
2. Weigh on scale → get weight in kg
3. Calculate: `price = max(weight × $33, $120)`
4. Enter calculated price in POS activation field
5. Activate encargo machine (Lavadora 13–15) at that price
6. Price recorded in POS = actual revenue for that order

### Simulated weight (pre-scale)

Until a physical scale is purchased/connected, the system can generate a simulated weight for testing purposes:

- Random weight between 1–10 kg (uniform distribution)
- Display simulated weight to staff for confirmation
- Staff can override manually
- Flag all simulated-weight transactions for later reconciliation

### Edredones / bulky items (Lavadora 16 — XL)

**Pricing model:** Fixed price per item (premium, not per-kg).

| Item | Price (MXN) | Notes |
|---|---|---|
| Edredón individual | $150 | Single/twin comforter |
| Edredón matrimonial | $180 | Queen size |
| Edredón king | $200 | King size |
| Cobija gruesa | $120 | Heavy blanket |
| Almohada (par) | $80 | Pillow pair |

- These are drop-off only (staff-operated)
- Machine activated at the fixed item price
- If customer brings multiple items, sum the individual prices

---

## Service line 3: Dry cleaning / tintorería

**Pricing model:** Per-piece, fixed price by garment type. This is a future service line — prices are estimates based on Monterrey market research and will be confirmed before launch. Dry cleaning will likely be outsourced to a partner tintorería initially, with La Burbuja acting as a drop-off/pick-up point and adding a margin.

### Estimated price list (MXN)

| Category | Item | Estimated price |
|---|---|---|
| **Básico** | Camisa / blusa | $65 |
| | Pantalón | $65 |
| | Falda | $65 |
| | Suéter / sudadera | $75 |
| **Formal** | Saco | $80 |
| | Traje 2 piezas | $150 |
| | Traje 3 piezas | $200 |
| | Corbata | $55 |
| | Chaleco | $65 |
| **Vestidos** | Vestido sencillo | $100 |
| | Vestido de noche | $150 |
| | Vestido con aplicaciones | $200 |
| **Abrigos** | Chamarra ligera | $100 |
| | Chamarra gruesa / pluma | $180 |
| | Abrigo / gabardina | $130 |
| **Hogar** | Mantel (pieza) | $60 |
| | Juego de sábanas | $80 |
| | Cortinas (por metro) | $50 |
| **Especial** | Tenis / zapatos | $120 |
| | Vestido de novia (consultar) | $500+ |

### Operational notes

- Turnaround: 48–72 hours (dependent on outsource partner schedule)
- Minimum order: 3 pieces or $150 MXN
- Urgent service (24 hrs): +50% surcharge
- Items received with visible stains: customer notified, desmanchado quoted separately
- Items received on hangers with plastic cover (cubre polvo)

---

## Pricing summary by service line

| Service | Pricing logic | Who operates | Where |
|---|---|---|---|
| Self-service | Fixed per cycle ($45 wash / $45 dry) | Customer | Main floor, Lavadoras 1–12 |
| Drop-off (ropa) | Per-kg ($33/kg, min $120) | Staff | Back room, Lavadoras 13–15 |
| Drop-off (edredones) | Fixed per item ($120–$200) | Staff | Back room, Lavadora 16 XL |
| Dry cleaning | Fixed per piece ($55–$200+) | Staff (outsourced) | Reception at cashier |

---

## Future considerations

- **Loyalty / frequency discounts:** e.g., 10th wash free, or bulk kg discount for encargo regulars
- **Express encargo:** 4-hour turnaround at +30% premium
- **Detergent upsell:** premium detergent/softener options at $15–25 per dose via vending
- **Scale integration:** digital scale connected to POS for automatic weight → price calculation
- **Seasonal pricing:** edredón wash promotions in spring/fall (seasonal demand spikes)