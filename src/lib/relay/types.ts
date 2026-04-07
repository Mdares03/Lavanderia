export interface RelayController {
  connect(port: string, baudRate: number): Promise<void>;
  turnOn(channel: number): Promise<void>;
  turnOff(channel: number): Promise<void>;
  getStatus(channel: number): Promise<boolean>;
  disconnect(): Promise<void>;
}

export interface RelayHealth {
  connected: boolean;
  mode: "mock" | "serial";
  port?: string;
  error?: string;
}
