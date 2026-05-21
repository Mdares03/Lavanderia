import "server-only";

import { APP_DEFAULTS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { HttpRelayController } from "@/lib/relay/httpRelayController";
import {
  RelayApiError,
  type RelayChannelConfig,
  type RelayChannelConfigUpdate,
  type RelayChannelMap,
  type RelayChannelStatus,
  type RelayController,
  type RelayHealth
} from "@/lib/relay/types";

class RelayManager {
  private controller: RelayController | null = null;
  private health: RelayHealth = {
    connected: false,
    mode: "http"
  };
  private initialized = false;

  async init() {
    if (this.initialized) {
      return;
    }
    await this.reloadFromConfig();
    this.initialized = true;
  }

  async reloadFromConfig() {
    const config = await prisma.appConfig.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        businessName: "La Burbuja"
      }
    });
    await this.connectWithSettings(false, config.serialPortPath, config.serialBaudRate);
  }

  async connectWithSettings(_mockMode: boolean, port: string, baudRate: number) {
    if (this.controller) {
      try {
        await this.controller.disconnect();
      } catch (error) {
        logger.warn("Error al cerrar relay previo", { error: String(error) });
      }
    }

    this.controller = new HttpRelayController();
    this.health = {
      connected: false,
      mode: "http",
      port
    };

    try {
      await this.controller.connect(port, baudRate || APP_DEFAULTS.serialBaudRate);
      this.health.connected = true;
      this.health.error = undefined;
      await prisma.appConfig.update({
        where: { id: 1 },
        data: {
          relayConnected: true,
          relayMockMode: false,
          serialPortPath: port,
          serialBaudRate: baudRate || APP_DEFAULTS.serialBaudRate
        }
      });
      logger.info("Relay conectado", { mode: this.health.mode, port });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.health.connected = false;
      this.health.error = message;
      await prisma.appConfig.update({
        where: { id: 1 },
        data: {
          relayConnected: false,
          relayMockMode: false,
          serialPortPath: port,
          serialBaudRate: baudRate || APP_DEFAULTS.serialBaudRate
        }
      });
      logger.error("Fallo conexion relay", { message, mode: this.health.mode, port });
    }
  }

  async turnOn(channel: number) {
    await this.init();
    if (!this.controller) {
      throw new Error("Relay no inicializado");
    }
    try {
      await this.controller.turnOn(channel);
    } catch (error) {
      this.health.connected = false;
      this.health.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async turnOff(channel: number) {
    await this.init();
    if (!this.controller) {
      throw new Error("Relay no inicializado");
    }
    try {
      await this.controller.turnOff(channel);
    } catch (error) {
      this.health.connected = false;
      this.health.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async getChannelStatus(channel: number) {
    await this.init();
    if (!this.controller) {
      return false;
    }
    return this.controller.getStatus(channel);
  }

  async getRelayMap() {
    await this.init();
    if (!this.controller) {
      return [] as RelayChannelMap[];
    }
    return this.controller.getMap();
  }

  async getAllRelayStatuses() {
    await this.init();
    if (!this.controller) {
      return [] as RelayChannelStatus[];
    }
    return this.controller.getStatusAll();
  }

  async getRelayConfigChannels(adminToken: string) {
    await this.init();
    if (!this.controller) {
      return [] as RelayChannelConfig[];
    }
    return this.controller.getConfigChannels(adminToken);
  }

  async updateRelayConfigChannels(adminToken: string, updates: RelayChannelConfigUpdate[]) {
    await this.init();
    if (!this.controller) {
      return [] as RelayChannelConfig[];
    }
    return this.controller.updateConfigChannels(adminToken, updates);
  }

  async assertChannelReady(channel: number) {
    await this.init();
    const statuses = await this.getAllRelayStatuses();
    const found = statuses.find((item) => item.channel === channel);

    if (!found) {
      throw new RelayApiError(`Canal ${channel} no existe`, 400, "invalid_channel");
    }
    if (!found.enabled || found.backend === "pending") {
      throw new RelayApiError(`Canal ${channel} pendiente de hardware`, 409, "channel_not_wired");
    }
    if (found.error) {
      throw new RelayApiError(`Canal ${channel} no disponible`, 503, found.error);
    }
    return found;
  }

  async listSerialPorts() {
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: { serialPortPath: true }
    });

    const ports = new Set<string>([
      "/dev/serial0",
      "/dev/ttyAMA0",
      "/dev/ttyAMA10"
    ]);

    if (config?.serialPortPath) {
      ports.add(config.serialPortPath);
    }

    return Array.from(ports);
  }

  async reconnect() {
    this.initialized = false;
    await this.init();
  }

  async getHealth() {
    await this.init();
    return this.health;
  }

  
}

declare global {
  // eslint-disable-next-line no-var
  var relayManagerGlobal: RelayManager | undefined;
}

export const relayManager = global.relayManagerGlobal ?? new RelayManager();

if (process.env.NODE_ENV !== "production") {
  global.relayManagerGlobal = relayManager;
}
