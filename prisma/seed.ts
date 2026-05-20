import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ComboLabel = "Encargo" | "XL";

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
      relayMockMode: true
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
      { number: 13, label: "Encargo" as const },
      { number: 14, label: "Encargo" as const },
      { number: 15, label: "Encargo" as const },
      { number: 16, label: "XL" as const }
    ];

    const washers = combos.map((combo, index) => ({
      name: buildMachineName("washer", combo.number, combo.label),
      type: "washer" as const,
      relayChannel: index,
      defaultPriceCents: 8000,
      defaultDurationMinutes: 35
    }));
    const dryers = combos.map((combo, index) => ({
      name: buildMachineName("dryer", combo.number, combo.label),
      type: "dryer" as const,
      relayChannel: index + combos.length,
      defaultPriceCents: 6000,
      defaultDurationMinutes: 45
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
