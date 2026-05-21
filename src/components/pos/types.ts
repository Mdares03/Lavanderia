export type ServiceType = "autoservicio" | "encargo" | "xl";
export type PaymentMethod = "cash" | "card" | "transfer";
export type TransactionStatus = "pending_relay" | "running" | "completed" | "relay_failed" | "voided";

export type Machine = {
  id: string;
  name: string;
  type: "washer" | "dryer";
  size: "normal" | "xl";
  relayChannel: number;
  defaultPriceCents: number;
  defaultDurationMinutes: number;
  status: "available" | "running" | "finished" | "out_of_service" | "pending_hardware";
  hardware: {
    enabled: boolean;
    backend: "i2c" | "modbus" | "pending";
    state: boolean | null;
    ready: boolean;
    error?: string;
  };
  relayTest: {
    lastRelayTestOk: boolean | null;
    lastRelayTestAt: string | null;
    lastRelayTestError: string | null;
    hardwareValidatedAt: string | null;
  };
  transaction: {
    id: string;
    status: TransactionStatus;
    isExtension: boolean;
    parentTransactionId: string | null;
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
    paymentMethod: PaymentMethod;
    originalDurationMinutes: number;
    extensionMinutes: number;
    extensionAmountCents: number;
    startedAt: string;
    expectedEndAt: string;
    endedAt: string | null;
    createdAt: string;
    voidedAt: string | null;
    voidReason: string | null;
    employeeId: string;
  } | null;
};

export type AdminMachine = {
  id: string;
  name: string;
  type: "washer" | "dryer";
  size: "normal" | "xl";
  relayChannel: number | null;
  defaultPriceCents: number;
  defaultDurationMinutes: number;
  outOfService: boolean;
  isActive: boolean;
  awaitingRelease: boolean;
  status: "available" | "running" | "finished" | "out_of_service" | "pending_hardware";
  hardware: {
    enabled: boolean;
    backend: "i2c" | "modbus" | "pending";
    state: boolean | null;
    ready: boolean;
    error?: string;
  };
  relayTest: {
    lastRelayTestOk: boolean | null;
    lastRelayTestAt: string | null;
    lastRelayTestError: string | null;
    hardwareValidatedAt: string | null;
  };
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
  mode: "mock" | "http";
  error?: string;
};

export type RelayChannelConfig = {
  channel: number;
  label: string;
  enabled: boolean;
  backend: "i2c" | "modbus" | "pending";
  board?: number;
  addr?: number;
  relay?: number;
};

export type RelayChannelConfigUpdate = {
  channel: number;
  label?: string;
  enabled?: boolean;
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
      cashSalesCents: number;
      depositsCents: number;
      withdrawalsCents: number;
      voidedCount: number;
      voidedTotalCents: number;
      byPaymentMethod: Array<{ paymentMethod: string; amountCents: number; count: number }>;
      voidedByEmployee: Array<{ employeeId: string; employeeName: string; count: number; amountCents: number }>;
    };
    voidedTransactions: Array<{
      id: string;
      ticketNumber: number;
      machineName: string;
      amountCents: number;
      reason: string | null;
      voidedAt: string;
      employeeName: string;
    }>;
    cashMovements: Array<{
      id: string;
      type: "deposit" | "withdrawal";
      amountCents: number;
      reason: string;
      createdAt: string;
      employeeName: string;
    }>;
  } | null;
};

export type ReportSummary = {
  totals: {
    totalRevenueCents: number;
    transactionCount: number;
    avgTicketCents: number;
    voidedCount: number;
    voidedTotalCents: number;
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
  washerNormalCycleMinutes: number;
  washerXlCycleMinutes: number;
  dryerNormalCycleMinutes: number;
  dryerXlCycleMinutes: number;
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
  paymentMethod: PaymentMethod;
  relayOk: boolean;
};

export type DashboardTransaction = {
  id: string;
  ticketNumber: number;
  status: TransactionStatus;
  amountCents: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  startedAt: string;
  expectedEndAt: string;
  endedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  serviceType: ServiceType;
  isExtension: boolean;
  parentTransactionId: string | null;
  machine: {
    name: string;
  };
  employee: {
    name: string;
  };
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };
  voidedByEmployee?: {
    id: string;
    name: string;
  } | null;
  parentTransaction?: {
    id: string;
    ticketNumber: number;
  } | null;
};

export type ShiftHistoryItem = {
  id: string;
  startTime: string;
  endTime: string | null;
  expectedCashCents: number | null;
  actualCashCents: number | null;
  differenceCashCents: number | null;
  employee: {
    id: string;
    name: string;
  };
  totals: {
    totalSalesCents: number;
    transactionCount: number;
    byPaymentMethod: Array<{ paymentMethod: string; amountCents: number; count: number }>;
    voidedCount: number;
    voidedTotalCents: number;
    depositsCents: number;
    withdrawalsCents: number;
  };
};

export type EncargoStatus = "recibido" | "lavando" | "secando" | "doblando" | "listo" | "entregado";

export type EncargoOrder = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  weightKg: number;
  loads: number;
  notes: string | null;
  priceCents: number;
  paymentMode: "now" | "pickup";
  paymentStatus: "pending" | "paid";
  paymentMethod: PaymentMethod | null;
  status: EncargoStatus;
  receivedAt: string;
  readyAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmployee: {
    id: string;
    name: string;
  };
  elapsedMinutes: number;
  readyForHours: number;
  activeMachines: Array<{
    transactionId: string;
    machineId: string;
    machineName: string;
    machineType: "washer" | "dryer";
    startedAt: string;
    expectedEndAt: string;
    status: string;
  }>;
};
