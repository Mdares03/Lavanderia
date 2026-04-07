import { z } from "zod";

import { fail, ok } from "@/lib/http";
import { createCustomer, listCustomers } from "@/server/services/customerService";
import { ensureSystemBootstrapped } from "@/server/system/bootstrap";

const createSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(8).max(30),
  email: z
    .string()
    .trim()
    .email()
    .max(120)
    .optional()
});

export async function GET(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("query") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const payload = await listCustomers({ query, limit });
    return ok(payload);
  } catch (error) {
    return fail("No fue posible cargar clientes", 400, String(error));
  }
}

export async function POST(request: Request) {
  await ensureSystemBootstrapped();
  try {
    const payload = createSchema.parse(await request.json());
    const customer = await createCustomer(payload);
    const lookup = await listCustomers({
      query: customer.phone,
      limit: 1
    });
    return ok(
      {
        customer: lookup.customers[0] ?? null,
        loyalty: lookup.loyalty
      },
      201
    );
  } catch (error) {
    return fail("No fue posible registrar cliente", 400, String(error));
  }
}
