# La Burbuja — Laundry POS System Specification

## Project North Star

This is a **local-first POS system** for a single-location attended laundromat. A cashier operates the system from a touchscreen PC or tablet. The software controls power to residential washing machines and dryers via USB relay board (connected to a Raspberry Pi or mini PC). The system does NOT need internet to function — it runs on localhost. Keep it simple, reliable, and fast.

**If a feature doesn't directly help the cashier process a transaction or help the owner see how the business is doing, it probably doesn't belong in v1.**

---

## Tech Stack

- **Frontend + Backend:** Next.js with TypeScript (App Router)
- **Database:** SQLite (via Prisma or Drizzle) — single file, no external DB server
- **Relay Communication:** Serial (USB) to relay board — simple write commands via `serialport` npm package
- **Runs on:** Raspberry Pi 4/5 or any mini PC running Node.js, serving on `localhost:3000`
- **UI:** Tailwind CSS, optimized for touch (large buttons, clear status colors)

---

## Architecture Overview

```
[Touchscreen / Browser]
        |
   localhost:3000
        |
  [Next.js App on Raspi / Mini PC]
        |
  [SQLite DB]        [USB Serial → Relay Board]
                            |
              [12 Contactors → Machine Power Lines]
```

There is ONE user interface. The cashier sees everything on one screen or minimal navigation. No customer-facing UI in v1.

---

## Core Concepts

### Machines
- Each machine has: `id`, `name` (e.g., "Lavadora 1", "Secadora 3"), `type` (washer | dryer), `status` (available | running | out_of_service), `relayChannel` (0-15), `defaultPrice`, `defaultDurationMinutes`
- Machines are configured once at setup, rarely changed
- Status is derived: if a timer is active → running. If not → available. Manual override for out_of_service.

### Transactions
- Each transaction records: `id`, `machineId`, `amount`, `paymentMethod` (cash | card | transfer), `startedAt`, `expectedEndAt`, `employeeId`, `createdAt`
- A transaction = one machine activation. If a customer uses 1 washer + 1 dryer, that's 2 transactions.
- Transactions are immutable once created (no editing, only voiding with reason).

### Employees / Shifts
- Simple employee list with PIN login (4-digit)
- Shift = period between cash register open and close (corte de caja)
- Each shift tracks: `employeeId`, `startTime`, `endTime`, `startingCash`, `cashDeposits`, `cashWithdrawals`, `expectedCash` (calculated), `actualCash` (entered at corte)

---

## Screens

### 1. Main Dashboard (primary screen — cashier lives here)
- Grid of all 12 machines as large, tappable cards
- Each card shows: machine name, type icon (washer/dryer), status color (green=available, blue=running with countdown timer, red=out of service), remaining time if running
- Tapping an available machine opens the **Activate Modal**
- Tapping a running machine shows transaction details + option to add time
- This screen should feel like a control panel, not a spreadsheet

### 2. Activate Modal
- Shows: machine name, default price (editable), default duration (editable), payment method selector (cash / card / transfer)
- Big "ACTIVAR" button
- On confirm: creates transaction, sends relay command to power on the machine, starts countdown timer
- Timer runs in the app — when it hits zero, relay command powers off the machine
- **Keep this to 2 taps maximum: select machine → confirm activation**

### 3. Cash Register / Corte de Caja
- Current shift summary: total sales, breakdown by payment method, number of transactions
- Button to register cash deposit or withdrawal (with reason field)
- "Cerrar Turno" button: prompts for actual cash count, calculates difference vs expected, prints/saves corte summary
- Historical cortes viewable by date

### 4. Reports / Metrics
- Date range selector (today / this week / this month / custom)
- Key metrics: total revenue, transaction count, average ticket, revenue by machine, revenue by payment method
- Machine utilization: % of operating hours each machine was running
- Simple bar charts or summary cards — no complex dashboards
- Export to CSV option

### 5. Settings
- Machine configuration (add/edit/disable machines, assign relay channels, set prices)
- Employee management (add/remove, reset PIN)
- Serial port configuration (select USB port for relay board)
- Business info (store name, for receipt headers)

---

## Relay Board Communication

- The relay board connects via USB and appears as a serial port (e.g., `/dev/ttyUSB0`)
- Communication is simple serial write commands — the exact protocol depends on the board chosen, but typically:
  - Turn on relay N: send a specific byte sequence
  - Turn off relay N: send a different byte sequence
  - Some boards use ASCII commands like `relay on 3\n`
- **Abstract this behind a simple interface:**
  ```typescript
  interface RelayController {
    connect(port: string, baudRate: number): Promise<void>
    turnOn(channel: number): Promise<void>
    turnOff(channel: number): Promise<void>
    getStatus(channel: number): Promise<boolean>
    disconnect(): Promise<void>
  }
  ```
- Include a **mock/simulator mode** for development and testing without hardware
- On application startup, restore state: check DB for any transactions with unexpired timers and re-activate those relays
- On unexpected shutdown/restart: same recovery logic — check timers, restore relay states
- **Timer expiration must trigger relay off even if nobody is looking at the screen.** Use a server-side interval/scheduler, not just frontend timers.

---

## Critical Reliability Rules

1. **The relay off-command on timer expiry is the most important operation in the system.** If the app crashes, the machine keeps running on the owner's dime. Use a server-side scheduler (e.g., `node-cron` or `setTimeout` with persistence) and verify relay state on restart.
2. **Database writes before relay commands.** Always save the transaction first, then activate the relay. If the relay command fails, the transaction exists and can be retried. Never the reverse.
3. **No internet dependency.** Everything works offline. The clock is the Raspi's system clock.
4. **Graceful serial port handling.** If the relay board disconnects, show a clear error on screen but don't crash the app. Allow reconnection without restart.

---

## What This Project is NOT

- NOT a customer-facing self-service kiosk (cashier operates everything)
- NOT a multi-location system (single store, single database)
- NOT a billing/invoicing system (no CFDI, no tax calculations in v1)
- NOT an inventory management system
- NOT connected to the internet for operation (metrics export is manual/CSV)
- NOT integrated with a bill acceptor in v1 (cash is handled by the cashier physically, software just records the payment method)

---

## Language & Locale

- UI text in **Spanish (Mexico)**
- Currency: **MXN**, formatted as `$XX.XX`
- Dates: `DD/MMM/YYYY` format
- Timezone: `America/Monterrey` (CST/CDT)

---

## v2 Ideas (do NOT build these now, but don't make architecture decisions that prevent them)

- Bill acceptor integration (USB serial, similar to relay board)
- Customer-facing status screen (second monitor showing machine availability)
- SMS/WhatsApp notification when cycle is done
- Remote monitoring dashboard (simple web view of today's metrics, requires internet)
- NFC loyalty card system
- Multi-store support
- Washer/dryer current sensing for actual cycle-complete detection instead of timer-only

---

## Summary for the AI

You are building a laundry POS that controls washing machines via relay. Think of it as a **timer-based power switch with a cash register attached.** The cashier taps a machine, confirms payment, and the machine gets power for X minutes. When time is up, power cuts. Everything is logged. At end of shift, cashier counts cash and closes out. Owner can see reports.

Keep the codebase small. Keep the UI obvious. Keep the system reliable. That's it.