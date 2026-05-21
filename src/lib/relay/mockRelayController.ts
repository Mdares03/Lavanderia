import "server-only";

import type {
  RelayChannelConfig,
  RelayChannelConfigUpdate,
  RelayChannelMap,
  RelayChannelStatus,
  RelayController
} from "@/lib/relay/types";

export class MockRelayController implements RelayController {
  private connected = false;
  private states = new Map<number, boolean>();
  private readonly channels: RelayChannelMap[] = Array.from({ length: 26 }, (_, index) => ({
    channel: index + 1,
    label: `Canal ${index + 1}`,
    enabled: true,
    backend: "i2c"
  }));

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

  async getMap(): Promise<RelayChannelMap[]> {
    this.assertConnected();
    return this.channels;
  }

  async getStatusAll(): Promise<RelayChannelStatus[]> {
    this.assertConnected();
    return this.channels.map((channel) => ({
      ...channel,
      state: this.states.get(channel.channel) ?? false
    }));
  }

  async getConfigChannels(_token: string): Promise<RelayChannelConfig[]> {
    void _token;
    this.assertConnected();
    return this.channels.map((channel) => ({
      ...channel,
      board: 0,
      relay: channel.channel
    }));
  }

  async updateConfigChannels(_token: string, updates: RelayChannelConfigUpdate[]): Promise<RelayChannelConfig[]> {
    void _token;
    this.assertConnected();
    for (const update of updates) {
      const found = this.channels.find((channel) => channel.channel === update.channel);
      if (!found) {
        continue;
      }
      if (update.label !== undefined) {
        found.label = update.label;
      }
      if (update.enabled !== undefined) {
        found.enabled = update.enabled;
      }
    }
    return this.getConfigChannels(_token);
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
