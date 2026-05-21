import "server-only";

import {
  RelayApiError,
  type RelayChannelConfig,
  type RelayChannelConfigUpdate,
  type RelayChannelMap,
  type RelayChannelStatus,
  type RelayController
} from "@/lib/relay/types";

const NODE_RED_BASE_URL = process.env.NODE_RED_URL ?? process.env.RELAY_BASE_URL ?? "http://127.0.0.1:1880";

export class HttpRelayController implements RelayController {
  async connect(port: string, baudRate: number): Promise<void> {
    void port;
    void baudRate;
    const res = await fetch(`${NODE_RED_BASE_URL}/relay/map`, { method: "GET" }).catch(() => null);
    if (!res || !res.ok) {
      throw new Error(`Node-RED unreachable at ${NODE_RED_BASE_URL}`);
    }
  }

  async disconnect(): Promise<void> {
    return Promise.resolve();
  }

  async turnOn(channel: number): Promise<void> {
    await this.call("on", channel);
  }

  async turnOff(channel: number): Promise<void> {
    await this.call("off", channel);
  }

  async getStatus(channel: number): Promise<boolean> {
    const data = await this.readJson<{
      ok: boolean;
      state: boolean | null;
      error?: string;
      code?: string;
    }>(`/relay/status/${channel}`);

    if (!data.ok || data.state === null) {
      throw new RelayApiError("No fue posible consultar estado del canal", 502, data.code ?? "relay_command_failed", data);
    }

    return data.state;
  }

  async getMap(): Promise<RelayChannelMap[]> {
    const data = await this.readJson<{
      ok: boolean;
      channels: RelayChannelMap[];
    }>("/relay/map");
    return data.channels ?? [];
  }

  async getStatusAll(): Promise<RelayChannelStatus[]> {
    const data = await this.readJson<{
      ok: boolean;
      channels: RelayChannelStatus[];
    }>("/relay/status/all");
    return data.channels ?? [];
  }

  async getConfigChannels(token: string): Promise<RelayChannelConfig[]> {
    const data = await this.readJson<{
      ok: boolean;
      channels: RelayChannelConfig[];
    }>("/relay/config/channels", {
      method: "GET",
      headers: {
        "x-relay-admin-token": token
      }
    });
    return data.channels ?? [];
  }

  async updateConfigChannels(token: string, updates: RelayChannelConfigUpdate[]): Promise<RelayChannelConfig[]> {
    const data = await this.readJson<{
      ok: boolean;
      channels: RelayChannelConfig[];
    }>("/relay/config/channels", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-relay-admin-token": token
      },
      body: JSON.stringify({ channels: updates })
    });
    return data.channels ?? [];
  }

  private async call(action: "on" | "off", channel: number): Promise<void> {
    await this.readJson(`/relay/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel })
    });
  }

  private async readJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${NODE_RED_BASE_URL}${path}`, init).catch(() => null);
    if (!res) {
      throw new RelayApiError("Relay API unavailable", 503, "relay_api_unavailable");
    }

    const contentType = res.headers.get("content-type") ?? "";
    let payload: unknown = null;
    if (contentType.includes("application/json")) {
      payload = await res.json().catch(() => null);
    } else {
      payload = await res.text().catch(() => "");
    }

    if (!res.ok) {
      const body = payload && typeof payload === "object" ? (payload as { error?: unknown; detail?: unknown; code?: unknown }) : null;
      const code = typeof body?.code === "string" ? body.code : this.defaultCodeByStatus(res.status);
      const message = typeof body?.error === "string" ? body.error : `Relay API error (${res.status})`;
      throw new RelayApiError(message, res.status, code, body?.detail ?? payload);
    }

    return payload as T;
  }

  private defaultCodeByStatus(status: number): string {
    if (status === 400) return "invalid_channel";
    if (status === 409) return "channel_not_wired";
    if (status === 502) return "relay_command_failed";
    if (status === 503) return "relay_api_unavailable";
    return "relay_error";
  }
}
