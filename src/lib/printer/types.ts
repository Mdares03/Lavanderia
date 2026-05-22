export type PrinterHealth = {
  connected: boolean;
  transport: "node_red_http";
  endpoint: string;
  error?: string;
};

export type ThermalTicketPayload = {
  profile: string;
  ticketType: string;
  title: string;
  text: string;
  copies?: number;
  meta?: Record<string, unknown>;
};

export interface PrinterController {
  print(payload: ThermalTicketPayload, endpoint: string, timeoutMs: number): Promise<void>;
}
