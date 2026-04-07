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
      throw new Error(String((data as { error: unknown }).error));
    }
    if (typeof data === "string" && data.length > 0) {
      throw new Error(data);
    }
    throw new Error(`Error de API (${response.status})`);
  }
  return data as T;
}
