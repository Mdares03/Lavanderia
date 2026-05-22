import { addMinutes } from "@/lib/time";

export type WasherCandidate = {
  machineId: string;
  machineName: string;
  machineSize: "normal" | "xl";
  relayChannel: number;
  ready: boolean;
  running: boolean;
  availableAt: Date;
  capacityKg: number;
  durationMinutes: number;
};

export type DryerCandidate = {
  machineId: string;
  machineName: string;
  availableAt: Date;
  durationMinutes: number;
};

export type WasherPlanItem = {
  loadIndex: number;
  washer: {
    machineId: string;
    machineName: string;
    machineSize: "normal" | "xl";
    relayChannel: number;
    capacityKg: number;
    durationMinutes: number;
    expectedEndAt: Date;
  };
};

export type ShortageInfo = {
  requiredLoads: number;
  availableLoadsNow: number;
  etaWhenEnoughWashers: string | null;
};

export function selectWashersNow(input: {
  weightKg: number;
  normalCapacityKg: number;
  candidates: WasherCandidate[];
  now: Date;
}) {
  const availableNow = input.candidates
    .filter((row) => row.ready && !row.running)
    .sort((a, b) => {
      if (a.machineSize !== b.machineSize) {
        return a.machineSize === "normal" ? -1 : 1;
      }
      return a.relayChannel - b.relayChannel;
    });

  const selected: WasherPlanItem[] = [];
  let remainingKg = input.weightKg;

  for (const row of availableNow.filter((item) => item.machineSize === "normal")) {
    if (remainingKg <= 0) break;
    selected.push({
      loadIndex: selected.length + 1,
      washer: {
        machineId: row.machineId,
        machineName: row.machineName,
        machineSize: row.machineSize,
        relayChannel: row.relayChannel,
        capacityKg: row.capacityKg,
        durationMinutes: row.durationMinutes,
        expectedEndAt: addMinutes(input.now, row.durationMinutes)
      }
    });
    remainingKg -= row.capacityKg;
  }

  for (const row of availableNow.filter((item) => item.machineSize === "xl")) {
    if (remainingKg <= 0) break;
    selected.push({
      loadIndex: selected.length + 1,
      washer: {
        machineId: row.machineId,
        machineName: row.machineName,
        machineSize: row.machineSize,
        relayChannel: row.relayChannel,
        capacityKg: row.capacityKg,
        durationMinutes: row.durationMinutes,
        expectedEndAt: addMinutes(input.now, row.durationMinutes)
      }
    });
    remainingKg -= row.capacityKg;
  }

  const totalCapacityKg = selected.reduce((sum, item) => sum + item.washer.capacityKg, 0);
  const requiredLoads = Math.max(1, Math.ceil(input.weightKg / Math.max(input.normalCapacityKg, 0.1)));

  return {
    selected,
    totalCapacityKg,
    remainingKg,
    requiredLoads,
    availableLoadsNow: availableNow.length
  };
}

export function computeShortageEta(input: {
  weightKg: number;
  selectedCapacityKg: number;
  requiredLoads: number;
  availableLoadsNow: number;
  candidates: WasherCandidate[];
}) {
  let projectedCapacity = input.selectedCapacityKg;
  let eta: Date | null = null;

  const upcoming = input.candidates
    .filter((row) => row.ready && row.running)
    .sort((a, b) => a.availableAt.getTime() - b.availableAt.getTime());

  for (const row of upcoming) {
    projectedCapacity += row.capacityKg;
    if (projectedCapacity >= input.weightKg) {
      eta = row.availableAt;
      break;
    }
  }

  const shortage: ShortageInfo = {
    requiredLoads: input.requiredLoads,
    availableLoadsNow: input.availableLoadsNow,
    etaWhenEnoughWashers: eta ? eta.toISOString() : null
  };

  return shortage;
}

export function assignDryersByForecast(loads: WasherPlanItem[], dryers: DryerCandidate[]) {
  const mutableDryers = dryers.map((dryer) => ({ ...dryer }));
  return loads.map((load) => {
    if (mutableDryers.length === 0) {
      return {
        ...load,
        dryer: null as { machineId: string; machineName: string } | null
      };
    }

    let bestIndex = 0;
    let bestStartAt = new Date(Math.max(mutableDryers[0]!.availableAt.getTime(), load.washer.expectedEndAt.getTime()));

    for (let index = 1; index < mutableDryers.length; index += 1) {
      const candidate = mutableDryers[index]!;
      const startAt = new Date(Math.max(candidate.availableAt.getTime(), load.washer.expectedEndAt.getTime()));
      if (startAt.getTime() < bestStartAt.getTime()) {
        bestStartAt = startAt;
        bestIndex = index;
      }
    }

    const chosen = mutableDryers[bestIndex]!;
    chosen.availableAt = addMinutes(bestStartAt, chosen.durationMinutes);

    return {
      ...load,
      dryer: {
        machineId: chosen.machineId,
        machineName: chosen.machineName
      }
    };
  });
}
