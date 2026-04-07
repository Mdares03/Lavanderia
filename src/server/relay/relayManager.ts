import "server-only";

import { APP_DEFAULTS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { MockRelayController } from "@/lib/relay/mockRelayController";
import { SerialRelayController } from "@/lib/relay/serialRelayController";
import type { RelayController, RelayHealth } from "@/lib/relay/types";

class RelayManager {
  private controller: RelayController | null = null;
  private health: RelayHealth = {
    connected: false,
    mode: "mock"
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
    await this.connectWithSettings(config.relayMockMode, config.serialPortPath, config.serialBaudRate);
  }

  async connectWithSettings(mockMode: boolean, port: string, baudRate: number) {
    if (this.controller) {
      try {
        await this.controller.disconnect();
      } catch (error) {
        logger.warn("Error al cerrar relay previo", { error: String(error) });
      }
    }

    this.controller = mockMode ? new MockRelayController() : new SerialRelayController();
    this.health = {
      connected: false,
      mode: mockMode ? "mock" : "serial",
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
          relayMockMode: mockMode,
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
          relayMockMode: mockMode,
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

  async reconnect() {
    this.initialized = false;
    await this.init();
  }

  async getHealth() {
    await this.init();
    return this.health;
  }

  async listSerialPorts() {
    try {
      return await SerialRelayController.listPorts();
    } catch (error) {
      logger.warn("No se pudieron listar puertos seriales", {
        error: String(error)
      });
      return [];
    }
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
