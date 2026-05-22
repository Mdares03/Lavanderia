import { formatCurrency } from "@/lib/format";

export type LoadAssignment = {
  loadIndex: number;
  washerName: string;
  dryerName: string | null;
};

export type TicketContext = {
  workOrderId: string;
  orderNumber: number;
  serviceType: string;
  customerName: string;
  cashierName: string;
  paymentMethod: string;
  createdAt: Date;
  weightKg: number;
  requiredLoads: number;
  baseAmountCents: number;
  discountCents: number;
  addonAmountCents: number;
  amountCents: number;
  loads: LoadAssignment[];
};

export type TicketDocument = {
  ticketType: "master_customer" | "master_store" | "load_tag";
  title: string;
  text: string;
  loadIndex?: number;
};

function paymentLabel(method: string) {
  if (method === "card") return "Tarjeta";
  if (method === "transfer") return "Transferencia";
  return "Efectivo";
}

function serviceLabel(serviceType: string) {
  if (serviceType === "encargo") return "Encargo";
  if (serviceType === "xl") return "XL";
  return "Autoservicio";
}

function renderMasterTicket(context: TicketContext, mode: "customer" | "store") {
  const lines: string[] = [];
  lines.push("PUNTO LAVADO POS");
  lines.push("--------------------------------");
  lines.push(`ORDEN #${context.orderNumber}`);
  lines.push(mode === "customer" ? "COPIA CLIENTE" : "COPIA TIENDA");
  lines.push("--------------------------------");
  lines.push(`Cliente: ${context.customerName}`);
  lines.push(`Servicio: ${serviceLabel(context.serviceType)}`);
  lines.push(`Peso: ${context.weightKg.toFixed(1)} kg`);
  lines.push(`Cargas: ${context.requiredLoads}`);
  lines.push(`Pago: ${paymentLabel(context.paymentMethod)}`);
  lines.push(`Cajero: ${context.cashierName}`);
  lines.push(`Fecha: ${context.createdAt.toLocaleString("es-MX")}`);
  lines.push("--------------------------------");
  lines.push(`Base: ${formatCurrency(context.baseAmountCents)}`);
  lines.push(`Descuento: -${formatCurrency(context.discountCents)}`);
  lines.push(`Add-ons: ${formatCurrency(context.addonAmountCents)}`);
  lines.push(`TOTAL: ${formatCurrency(context.amountCents)}`);
  lines.push("--------------------------------");
  lines.push("Asignaciones");
  for (const load of context.loads) {
    if (load.dryerName) {
      lines.push(`L${load.loadIndex}: ${load.washerName} -> ${load.dryerName}`);
    } else {
      lines.push(`L${load.loadIndex}: ${load.washerName}`);
    }
  }

  return lines.join("\n");
}

function renderLoadTag(context: TicketContext, load: LoadAssignment) {
  const lines: string[] = [];
  lines.push("PUNTO LAVADO POS");
  lines.push("--------------------------------");
  lines.push(`ORDEN #${context.orderNumber}`);
  lines.push(`CARGA ${load.loadIndex}/${context.requiredLoads}`);
  lines.push("--------------------------------");
  lines.push(`Cliente: ${context.customerName}`);
  lines.push(`Servicio: ${serviceLabel(context.serviceType)}`);
  lines.push(`Lavadora: ${load.washerName}`);
  if (load.dryerName) {
    lines.push(`Secadora: ${load.dryerName}`);
  }
  lines.push(`Fecha: ${context.createdAt.toLocaleString("es-MX")}`);
  lines.push(`Cajero: ${context.cashierName}`);
  lines.push("Bolsa etiquetada - no mezclar");
  return lines.join("\n");
}

export function buildTicketDocuments(context: TicketContext): TicketDocument[] {
  const docs: TicketDocument[] = [
    {
      ticketType: "master_customer",
      title: `Orden #${context.orderNumber} - Cliente`,
      text: renderMasterTicket(context, "customer")
    },
    {
      ticketType: "master_store",
      title: `Orden #${context.orderNumber} - Tienda`,
      text: renderMasterTicket(context, "store")
    }
  ];

  for (const load of context.loads) {
    docs.push({
      ticketType: "load_tag",
      title: `Orden #${context.orderNumber} - Carga ${load.loadIndex}`,
      text: renderLoadTag(context, load),
      loadIndex: load.loadIndex
    });
  }

  return docs;
}
