import { type PrinterController, type ThermalTicketPayload } from "@/lib/printer/types";

export class HttpPrinterController implements PrinterController {
  async print(payload: ThermalTicketPayload, endpoint: string, timeoutMs: number): Promise<void> {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      }).catch(() => null);

      if (!res) {
        throw new Error(`Ticket printer endpoint unavailable: ${endpoint}`);
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `Ticket printer error (${res.status})`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
