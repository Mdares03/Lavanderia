export type ServiceType = "autoservicio" | "encargo" | "xl";

export type Machine = {
  id: string;
  name: string;
  type: "washer" | "dryer";
  relayChannel: number;
  defaultPriceCents: number;
  defaultDurationMinutes: number;
  status: "available" | "running" | "out_of_service";
  transaction: {
    id: string;
    ticketNumber: number;
    customerId: string;
    customerName: string;
    baseAmountCents: number;
    discountCents: number;
    loyaltyDiscountApplied: boolean;
    addonDetergentQty: number;
    addonSoftenerQty: number;
    addonBleachQty: number;
    addonAmountCents: number;
    serviceType: ServiceType;
    amountCents: number;
    paymentMethod: "cash" | "card" | "transfer";
    startedAt: string;
    expectedEndAt: string;
    employeeId: string;
  } | null;
};

export type CustomerRecord = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  eligibleTransactionCount: number;
  totalSpentCents: number;
  nextDiscountTransactionNumber: number;
  isNextTransactionDiscount: boolean;
};

export type LoyaltyRule = {
  everyNTransactions: number;
  discountPct: number;
};

export type RelayHealth = {
  connected: boolean;
  mode: "mock" | "serial";
  error?: string;
};

export type Employee = {
  id: string;
  name: string;
  isAdmin: boolean;
};

export type ActiveShiftPayload = {
  shift: {
    id: string;
    startTime: string;
    startingCashCents: number;
  } | null;
  summary: {
    totals: {
      totalSalesCents: number;
      expectedCashCents: number;
      transactionCount: number;
      byPaymentMethod: Array<{ paymentMethod: string; amountCents: number; count: number }>;
    };
  } | null;
};

export type ReportSummary = {
  totals: {
    totalRevenueCents: number;
    transactionCount: number;
    avgTicketCents: number;
  };
  byPaymentMethod: Array<{ paymentMethod: string; amountCents: number; count: number }>;
  byMachine: Array<{ machineName: string; amountCents: number; count: number }>;
};

export type UtilizationRow = {
  machineId: string;
  machineName: string;
  usedMinutes: number;
  totalWindowMinutes: number;
  utilizationPct: number;
};

export type PricingVariables = {
  selfServiceWashPriceCents: number;
  selfServiceDryPriceCents: number;
  selfServiceCycleMinutes: number;
  encargoPricePerKgCents: number;
  encargoMinimumChargeCents: number;
  xlEdredonIndividualCents: number;
  xlEdredonMatrimonialCents: number;
  xlEdredonKingCents: number;
  xlCobijaGruesaCents: number;
  xlAlmohadaParCents: number;
  dryCleaningMinimumCents: number;
  dryCleaningUrgentSurchargePct: number;
  detergentAddonCents: number;
  softenerAddonCents: number;
  bleachAddonCents: number;
  loyaltyEveryNTransactions: number;
  loyaltyDiscountPct: number;
};

export type TicketPreviewData = {
  ticketNumber: number;
  customerName: string;
  serviceType: ServiceType;
  addons: {
    detergentQty: number;
    softenerQty: number;
    bleachQty: number;
  };
  loyaltyApplied: boolean;
  discountCents: number;
  subtotalCents: number;
  ivaCents: number;
  totalCents: number;
  dateTimeIso: string;
  cashierName: string;
  machineName: string;
  paymentMethod: "cash" | "card" | "transfer";
  relayOk: boolean;
};
