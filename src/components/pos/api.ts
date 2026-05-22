export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  let data: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    const text = await response.text();
    data = text.length > 0 ? text : null;
  }

  if (!response.ok) {
    if (data && typeof data === "object" && "error" in data) {
      const payload = data as { error: unknown; detail?: unknown };
      const errorMessage = String(payload.error);
      const detail = payload.detail;
      if (typeof detail === "string" && detail.trim().length > 0) {
        throw new Error(`${errorMessage}: ${detail}`);
      }
      if (detail && typeof detail === "object") {
        throw new Error(`${errorMessage}: ${JSON.stringify(detail)}`);
      }
      throw new Error(errorMessage);
    }
    if (typeof data === "string" && data.length > 0) {
      throw new Error(data);
    }
    throw new Error(`Error de API (${response.status})`);
  }
  return data as T;
}
