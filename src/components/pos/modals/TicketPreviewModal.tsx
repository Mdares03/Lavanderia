"use client";

import { useMemo, useState } from "react";

import type { TicketPreviewData } from "@/components/pos/types";
import { APP_DEFAULTS } from "@/lib/config";
import { formatCurrency } from "@/lib/format";

type TicketPreviewModalProps = {
  ticket: TicketPreviewData;
  onClose: () => void;
};

const serviceLabels: Record<TicketPreviewData["serviceType"], string> = {
  autoservicio: "Autoservicio",
  encargo: "Encargo",
  xl: "XL"
};

const paymentLabels: Record<TicketPreviewData["paymentMethod"], string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia"
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function TicketPreviewModal({ ticket, onClose }: TicketPreviewModalProps) {
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const ticketDate = useMemo(() => new Date(ticket.dateTimeIso), [ticket.dateTimeIso]);

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(APP_DEFAULTS.locale, {
        dateStyle: "medium",
        timeZone: APP_DEFAULTS.timezone
      }).format(ticketDate),
    [ticketDate]
  );

  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(APP_DEFAULTS.locale, {
        timeStyle: "short",
        timeZone: APP_DEFAULTS.timezone
      }).format(ticketDate),
    [ticketDate]
  );

  const addonLines = useMemo(
    () => [
      { label: "Detergente", qty: ticket.addons.detergentQty },
      { label: "Suavizante", qty: ticket.addons.softenerQty },
      { label: "Cloro", qty: ticket.addons.bleachQty }
    ].filter((line) => line.qty > 0),
    [ticket.addons]
  );

  const ticketText = useMemo(() => {
    const lines: string[] = [];
    lines.push("LA BURBUJA POS");
    lines.push("------------------------------");
    lines.push(`TICKET #${ticket.ticketNumber}`);
    lines.push("------------------------------");
    lines.push(`Cliente: ${ticket.customerName}`);
    lines.push(`Servicio: ${serviceLabels[ticket.serviceType]}`);
    lines.push(`Pago: ${paymentLabels[ticket.paymentMethod]}`);
    lines.push(`Cajero: ${ticket.cashierName}`);
    lines.push(`Fecha: ${dateLabel}`);
    lines.push(`Hora: ${timeLabel}`);
    lines.push("------------------------------");
    lines.push("ADD-ONS");
    if (addonLines.length === 0) {
      lines.push("Sin add-ons");
    } else {
      for (const line of addonLines) {
        lines.push(`${line.label}: x${line.qty}`);
      }
    }
    lines.push("------------------------------");
    lines.push(`Lealtad: ${ticket.loyaltyApplied ? `Si (-${formatCurrency(ticket.discountCents)})` : "No"}`);
    lines.push(`Subtotal: ${formatCurrency(ticket.subtotalCents)}`);
    lines.push(`IVA 16%: ${formatCurrency(ticket.ivaCents)}`);
    lines.push(`TOTAL: ${formatCurrency(ticket.totalCents)}`);
    return lines.join("\n");
  }, [addonLines, dateLabel, timeLabel, ticket]);

  const handlePrint = () => {
    const popup = window.open("", "_blank", "width=420,height=680");
    if (!popup) {
      setShareStatus("No se pudo abrir ventana de impresion.");
      return;
    }

    const safeText = escapeHtml(ticketText).replaceAll("\n", "<br>");
    popup.document.write(`
      <html>
      <head>
        <title>Ticket #${ticket.ticketNumber}</title>
        <style>
          body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin: 16px; color: #111827; }
          .wrap { max-width: 320px; margin: 0 auto; }
          .num { text-align: center; font-size: 28px; font-weight: 700; margin-bottom: 12px; }
          .text { font-size: 13px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="num">#${ticket.ticketNumber}</div>
          <div class="text">${safeText}</div>
        </div>
      </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();
    popup.close();
  };

  const handleShare = async () => {
    setShareStatus(null);

    try {
      const nav = window.navigator;
      if (typeof nav.share === "function") {
        await nav.share({
          title: `Ticket #${ticket.ticketNumber}`,
          text: ticketText
        });
        return;
      }

      if (nav.clipboard?.writeText) {
        await nav.clipboard.writeText(ticketText);
      } else {
        throw new Error("Clipboard no disponible");
      }
      setShareStatus("Ticket copiado al portapapeles.");
    } catch {
      setShareStatus("No se pudo compartir el ticket.");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Vista previa ticket</p>
        <p className="mt-1 text-center text-4xl font-bold text-slate-900">#{ticket.ticketNumber}</p>

        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="grid grid-cols-[auto_1fr] gap-x-2">
            <span className="font-semibold">Cliente:</span>
            <span>{ticket.customerName}</span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-2">
            <span className="font-semibold">Servicio:</span>
            <span>{serviceLabels[ticket.serviceType]}</span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-2">
            <span className="font-semibold">Cajero:</span>
            <span>{ticket.cashierName}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-2">
            <p><span className="font-semibold">Fecha:</span> {dateLabel}</p>
            <p><span className="font-semibold">Hora:</span> {timeLabel}</p>
          </div>

          <div className="border-t border-slate-200 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add-ons</p>
            {addonLines.length === 0 ? (
              <p className="text-xs text-slate-500">Sin add-ons</p>
            ) : (
              <div className="mt-1 space-y-1">
                {addonLines.map((line) => (
                  <div key={line.label} className="flex items-center justify-between text-xs">
                    <span>{line.label}</span>
                    <span>x{line.qty}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 pt-2 text-xs">
            <div className="flex items-center justify-between">
              <span>Lealtad aplicada</span>
              <span>{ticket.loyaltyApplied ? `Si (-${formatCurrency(ticket.discountCents)})` : "No"}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(ticket.subtotalCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>IVA (16%)</span>
              <span>{formatCurrency(ticket.ivaCents)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-slate-300 pt-1 text-sm font-bold text-slate-900">
              <span>Total</span>
              <span>{formatCurrency(ticket.totalCents)}</span>
            </div>
          </div>
        </div>

        {!ticket.relayOk && (
          <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-800">
            Activacion registrada pero relay no confirmado. Revisa estado de la maquina.
          </p>
        )}

        {shareStatus && <p className="mt-2 text-xs text-slate-600">{shareStatus}</p>}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button onClick={handlePrint} className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white">Imprimir</button>
          <button onClick={() => void handleShare()} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white">Compartir</button>
          <button onClick={onClose} className="rounded-lg bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
