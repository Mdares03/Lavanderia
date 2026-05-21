export interface RelayController {
  connect(port: string, baudRate: number): Promise<void>;
  turnOn(channel: number): Promise<void>;
  turnOff(channel: number): Promise<void>;
  getStatus(channel: number): Promise<boolean>;
  getMap(): Promise<RelayChannelMap[]>;
  getStatusAll(): Promise<RelayChannelStatus[]>;
  getConfigChannels(token: string): Promise<RelayChannelConfig[]>;
  updateConfigChannels(token: string, updates: RelayChannelConfigUpdate[]): Promise<RelayChannelConfig[]>;
  disconnect(): Promise<void>;
}

export interface RelayHealth {
  connected: boolean;
  mode: "mock" | "http";
  port?: string;
  error?: string;
}

export type RelayBackend = "i2c" | "modbus" | "pending";

export interface RelayChannelMap {
  channel: number;
  label: string;
  enabled: boolean;
  backend: RelayBackend;
}

export interface RelayChannelStatus extends RelayChannelMap {
  state: boolean | null;
  error?: string;
}

export interface RelayChannelConfig extends RelayChannelMap {
  board?: number;
  addr?: number;
  relay?: number;
}

export interface RelayChannelConfigUpdate {
  channel: number;
  label?: string;
  enabled?: boolean;
}

export class RelayApiError extends Error {
  status: number;
  code: string;
  detail?: unknown;

  constructor(message: string, status: number, code: string, detail?: unknown) {
    super(message);
    this.name = "RelayApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}
