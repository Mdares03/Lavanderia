export const MACHINE_TYPES = {
  washer: "washer",
  dryer: "dryer"
} as const;

export const PAYMENT_METHODS = {
  cash: "cash",
  card: "card",
  transfer: "transfer"
} as const;

export const SERVICE_TYPES = {
  autoservicio: "autoservicio",
  encargo: "encargo",
  xl: "xl"
} as const;

export const TRANSACTION_STATUS = {
  pendingRelay: "pending_relay",
  running: "running",
  completed: "completed",
  relayFailed: "relay_failed",
  voided: "voided"
} as const;

export const CASH_MOVEMENT_TYPE = {
  deposit: "deposit",
  withdrawal: "withdrawal"
} as const;

export const ENCARGO_ORDER_STATUS = {
  recibido: "recibido",
  lavando: "lavando",
  secando: "secando",
  doblando: "doblando",
  listo: "listo",
  entregado: "entregado"
} as const;

export const ENCARGO_PAYMENT_MODE = {
  now: "now",
  pickup: "pickup"
} as const;

export const ENCARGO_PAYMENT_STATUS = {
  pending: "pending",
  paid: "paid"
} as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];
export type ServiceTypeValue = (typeof SERVICE_TYPES)[keyof typeof SERVICE_TYPES];
export type TransactionStatusValue = (typeof TRANSACTION_STATUS)[keyof typeof TRANSACTION_STATUS];
export type CashMovementTypeValue = (typeof CASH_MOVEMENT_TYPE)[keyof typeof CASH_MOVEMENT_TYPE];
export type EncargoOrderStatusValue = (typeof ENCARGO_ORDER_STATUS)[keyof typeof ENCARGO_ORDER_STATUS];
export type EncargoPaymentModeValue = (typeof ENCARGO_PAYMENT_MODE)[keyof typeof ENCARGO_PAYMENT_MODE];
export type EncargoPaymentStatusValue = (typeof ENCARGO_PAYMENT_STATUS)[keyof typeof ENCARGO_PAYMENT_STATUS];
