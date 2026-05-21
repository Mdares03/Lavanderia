const BASE =
  process.env.NODE_RED_URL ||
  process.env.RELAY_BASE_URL ||
  "http://127.0.0.1:1880";

const channel = Number(process.argv[2] || 4);

async function call(path, options = {}) {
  const url = `${BASE}${path}`;

  console.log(`\nCalling: ${url}`);

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();

  console.log("Status:", res.status);
  console.log("Response:", text);

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main() {
  console.log("NODE_RED_URL:", BASE);
  console.log("Testing channel:", channel);

  await call(`/relay/status/${channel}`);

  await call(`/relay/on`, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });

  console.log("Relay should be ON now. Waiting 2 seconds...");
  await new Promise((resolve) => setTimeout(resolve, 2000));

  await call(`/relay/off`, {
    method: "POST",
    body: JSON.stringify({ channel }),
  });

  console.log("\nDone. Relay test completed successfully.");
}

main().catch((err) => {
  console.error("\nRelay code test failed:");
  console.error(err);
  process.exit(1);
});
