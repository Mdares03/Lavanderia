import "server-only";

import { HttpPrinterController } from "@/lib/printer/httpPrinterController";
import { type PrinterHealth, type ThermalTicketPayload } from "@/lib/printer/types";
import { prisma } from "@/lib/db";

class PrinterManager {
  private controller = new HttpPrinterController();

  async getConfig() {
    const config = await prisma.appConfig.findUnique({
      where: { id: 1 },
      select: {
        ticketAutoPrintEnabled: true,
        ticketPrinterTransport: true,
        ticketPrinterEndpoint: true,
        ticketPrinterProfile: true,
        ticketPrinterTimeoutMs: true
      }
    });

    if (!config) {
      throw new Error("Configuracion no disponible");
    }

    return config;
  }

  async print(payload: Omit<ThermalTicketPayload, "profile">) {
    const config = await this.getConfig();
    if (!config.ticketAutoPrintEnabled) {
      return { skipped: true as const };
    }

    if (config.ticketPrinterTransport !== "node_red_http") {
      throw new Error(`Transporte de impresion no soportado: ${config.ticketPrinterTransport}`);
    }

    await this.controller.print(
      {
        ...payload,
        profile: config.ticketPrinterProfile
      },
      config.ticketPrinterEndpoint,
      config.ticketPrinterTimeoutMs
    );

    return { skipped: false as const };
  }

  async getHealth(): Promise<PrinterHealth> {
    const config = await this.getConfig();
    return {
      connected: config.ticketAutoPrintEnabled,
      transport: "node_red_http",
      endpoint: config.ticketPrinterEndpoint
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var printerManagerGlobal: PrinterManager | undefined;
}

export const printerManager = global.printerManagerGlobal ?? new PrinterManager();

if (process.env.NODE_ENV !== "production") {
  global.printerManagerGlobal = printerManager;
}
