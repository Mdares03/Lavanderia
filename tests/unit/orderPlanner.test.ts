import { describe, expect, it } from "vitest";

import {
  assignDryersByForecast,
  computeShortageEta,
  selectWashersNow,
  type WasherCandidate
} from "@/server/services/orderPlanner";
import { buildTicketDocuments } from "@/server/services/ticketTemplates";

describe("orderPlanner", () => {
  it("calcula cargas para 17kg con capacidad 5kg", () => {
    const now = new Date("2026-05-22T10:00:00.000Z");
    const candidates: WasherCandidate[] = [1, 2, 3, 4].map((n) => ({
      machineId: `w${n}`,
      machineName: `Lavadora ${n}`,
      machineSize: "normal",
      relayChannel: n,
      ready: true,
      running: false,
      availableAt: now,
      capacityKg: 5,
      durationMinutes: 35
    }));

    const result = selectWashersNow({
      weightKg: 17,
      normalCapacityKg: 5,
      candidates,
      now
    });

    expect(result.selected).toHaveLength(4);
    expect(result.requiredLoads).toBe(4);
    expect(result.remainingKg).toBeLessThanOrEqual(0);
  });

  it("prefiere lavadoras normales antes de XL", () => {
    const now = new Date("2026-05-22T10:00:00.000Z");
    const candidates: WasherCandidate[] = [
      {
        machineId: "xl-1",
        machineName: "Lavadora XL",
        machineSize: "xl",
        relayChannel: 20,
        ready: true,
        running: false,
        availableAt: now,
        capacityKg: 7,
        durationMinutes: 45
      },
      {
        machineId: "n-1",
        machineName: "Lavadora 1",
        machineSize: "normal",
        relayChannel: 1,
        ready: true,
        running: false,
        availableAt: now,
        capacityKg: 5,
        durationMinutes: 35
      },
      {
        machineId: "n-2",
        machineName: "Lavadora 2",
        machineSize: "normal",
        relayChannel: 2,
        ready: true,
        running: false,
        availableAt: now,
        capacityKg: 5,
        durationMinutes: 35
      }
    ];

    const result = selectWashersNow({
      weightKg: 8,
      normalCapacityKg: 5,
      candidates,
      now
    });

    expect(result.selected.map((load) => load.washer.machineId)).toEqual(["n-1", "n-2"]);
  });

  it("calcula ETA con la N-esima finalizacion de lavadoras", () => {
    const now = new Date("2026-05-22T10:00:00.000Z");
    const runningA = new Date("2026-05-22T10:10:00.000Z");
    const runningB = new Date("2026-05-22T10:22:00.000Z");

    const candidates: WasherCandidate[] = [
      {
        machineId: "n-now",
        machineName: "Lavadora 1",
        machineSize: "normal",
        relayChannel: 1,
        ready: true,
        running: false,
        availableAt: now,
        capacityKg: 5,
        durationMinutes: 35
      },
      {
        machineId: "n-run-a",
        machineName: "Lavadora 2",
        machineSize: "normal",
        relayChannel: 2,
        ready: true,
        running: true,
        availableAt: runningA,
        capacityKg: 5,
        durationMinutes: 35
      },
      {
        machineId: "n-run-b",
        machineName: "Lavadora 3",
        machineSize: "normal",
        relayChannel: 3,
        ready: true,
        running: true,
        availableAt: runningB,
        capacityKg: 5,
        durationMinutes: 35
      }
    ];

    const shortage = computeShortageEta({
      weightKg: 14,
      selectedCapacityKg: 5,
      requiredLoads: 3,
      availableLoadsNow: 1,
      candidates
    });

    expect(shortage.etaWhenEnoughWashers).toBe(runningB.toISOString());
  });

  it("asigna secadoras por forecast de disponibilidad", () => {
    const base = new Date("2026-05-22T10:00:00.000Z");
    const loads = [
      {
        loadIndex: 1,
        washer: {
          machineId: "w1",
          machineName: "Lavadora 1",
          machineSize: "normal" as const,
          relayChannel: 1,
          capacityKg: 5,
          durationMinutes: 35,
          expectedEndAt: new Date("2026-05-22T10:30:00.000Z")
        }
      },
      {
        loadIndex: 2,
        washer: {
          machineId: "w2",
          machineName: "Lavadora 2",
          machineSize: "normal" as const,
          relayChannel: 2,
          capacityKg: 5,
          durationMinutes: 35,
          expectedEndAt: new Date("2026-05-22T10:40:00.000Z")
        }
      }
    ];

    const withDryers = assignDryersByForecast(loads, [
      { machineId: "d1", machineName: "Secadora 1", availableAt: base, durationMinutes: 40 }
    ]);

    expect(withDryers[0]?.dryer?.machineId).toBe("d1");
    expect(withDryers[1]?.dryer?.machineId).toBe("d1");
  });
});

describe("ticket templates", () => {
  it("genera master x2 + load tags con order number grande", () => {
    const docs = buildTicketDocuments({
      workOrderId: "wo_1",
      orderNumber: 325,
      serviceType: "encargo",
      customerName: "Maria Lopez",
      cashierName: "Ana",
      paymentMethod: "cash",
      createdAt: new Date("2026-05-22T10:00:00.000Z"),
      weightKg: 17,
      requiredLoads: 2,
      baseAmountCents: 10000,
      discountCents: 500,
      addonAmountCents: 200,
      amountCents: 9700,
      loads: [
        { loadIndex: 1, washerName: "Lavadora 1", dryerName: "Secadora 1" },
        { loadIndex: 2, washerName: "Lavadora 2", dryerName: "Secadora 2" }
      ]
    });

    expect(docs).toHaveLength(4);
    expect(docs[0]?.ticketType).toBe("master_customer");
    expect(docs[1]?.ticketType).toBe("master_store");
    expect(docs[2]?.ticketType).toBe("load_tag");
    expect(docs[3]?.ticketType).toBe("load_tag");
    for (const doc of docs) {
      expect(doc.text).toContain("ORDEN #325");
    }
  });
});
