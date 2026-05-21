import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ComboLabel = "XL";

function buildMachineName(type: "washer" | "dryer", number: number, label?: ComboLabel) {
  const base = type === "washer" ? `Lavadora ${number}` : `Secadora ${number}`;
  return label ? `${base} (${label})` : base;
}

async function main() {
  await prisma.appConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      businessName: "La Burbuja",
      timezone: "America/Monterrey",
      currency: "MXN",
      serialPortPath: "COM3",
      serialBaudRate: 9600,
      relayMockMode: false,
      washerNormalCycleMinutes: 35,
      washerXlCycleMinutes: 45,
      dryerNormalCycleMinutes: 45,
      dryerXlCycleMinutes: 55
    }
  });

  await prisma.employee.upsert({
    where: { id: "admin-default" },
    update: {
      name: "Marcelo Dares",
      isAdmin: true,
      isActive: true
    },
    create: {
      id: "admin-default",
      name: "Marcelo Dares",
      pin: "1234",
      isAdmin: true
    }
  });

  const existingMachineCount = await prisma.machine.count();

  if (existingMachineCount === 0) {
    const combos = [
      ...Array.from({ length: 12 }, (_, index) => ({ number: index + 1 as number, label: undefined as ComboLabel | undefined })),
      { number: 13, label: "XL" as const }
    ];

    const washers = combos.map((combo, index) => ({
      name: buildMachineName("washer", combo.number, combo.label),
      type: "washer" as const,
      size: combo.label ? ("xl" as const) : ("normal" as const),
      relayChannel: index + 1,
      defaultPriceCents: 8000,
      defaultDurationMinutes: combo.label ? 45 : 35
    }));
    const dryers = combos.map((combo, index) => ({
      name: buildMachineName("dryer", combo.number, combo.label),
      type: "dryer" as const,
      size: combo.label ? ("xl" as const) : ("normal" as const),
      relayChannel: index + combos.length + 1,
      defaultPriceCents: 6000,
      defaultDurationMinutes: combo.label ? 55 : 45
    }));
    const machines = [...washers, ...dryers];
    await prisma.machine.createMany({ data: machines });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
