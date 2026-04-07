import "server-only";

import type { RelayController } from "@/lib/relay/types";

export class MockRelayController implements RelayController {
  private connected = false;
  private states = new Map<number, boolean>();

  async connect(): Promise<void> {
    this.connected = true;
  }

  async turnOn(channel: number): Promise<void> {
    this.assertConnected();
    this.states.set(channel, true);
  }

  async turnOff(channel: number): Promise<void> {
    this.assertConnected();
    this.states.set(channel, false);
  }

  async getStatus(channel: number): Promise<boolean> {
    this.assertConnected();
    return this.states.get(channel) ?? false;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  private assertConnected() {
    if (!this.connected) {
      throw new Error("Mock relay no conectado");
    }
  }
}
