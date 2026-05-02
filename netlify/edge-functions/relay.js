// -----------------------------------------------------------------------------
// Simple reverse handler for Net Edge Functions
// -----------------------------------------------------------------------------
// This handler forwards incoming requests to a target domain specified by the
// environment variable `TARGET_DOMAIN`.  It strips a set of hop‑by‑proxy
// headers, forwards the rest (preserving their case), and returns the
// upstream response back to the client.
//
// The main flow:
//   1. Read and validate `TARGET_DOMAIN`
//   2. Build the target URL using the original request path/search
//   3. Copy request headers, stripping hop‑by‑proxy and Netlify‑specific ones
//   4. Forward the request (with body for non‑GET/HEAD)
//   5. Copy the upstream response headers (except transfer‑encoding)
//   6. Return the upstream body/status to the caller
//
// -----------------------------------------------------------------------------
// 1️⃣  Read the target base domain from environment
const TARGET_BASE = (Netlify.env.get("TARGET_DOMAIN") || "").replace(/\/$/, "");

// -----------------------------------------------------------------------------
// 2️⃣  Set of headers that should NOT be forwarded (hop‑by‑proxy, etc.)
const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

// Main request handler exported for the Netlify Edge Function
export default async function handler(request) {
  // If TARGET_DOMAIN isn't set, we can't proxy – return 500
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", {
      status: 500,
    });
  }

  try {
    // 3️⃣  Construct the URL to which we will forward the request
    const url = new URL(request.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    // -----------------------------------------------------------------------
    // 4️⃣  Prepare headers for the upstream request
    const headers = new Headers();
    let clientIp = null;

    // Copy headers from the incoming request, stripping unwanted ones
    for (const [key, value] of request.headers) {
      const k = key.toLowerCase();

      // Skip hop‑by‑proxy headers
      if (STRIP_HEADERS.has(k)) continue;

      // Skip Netlify‑specific headers
      if (k.startsWith("x-nf-")) continue;
      if (k.startsWith("x-netlify-")) continue;

      // Capture client IP from the first header that provides it
      if (k === "x-real-ip") {
        clientIp = value;
        continue;
      }
      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = value;
        continue;
      }

      // Preserve all other headers
      headers.set(k, value);
    }

    // Ensure the X-Forwarded-For header is set to the captured client IP
    if (clientIp) headers.set("x-forwarded-for", clientIp);

    // -----------------------------------------------------------------------
    // 5️⃣  Set up the fetch options
    const method = request.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const fetchOptions = {
      method,
      headers,
      redirect: "manual", // We don't want fetch to follow redirects automatically
    };

    if (hasBody) {
      // Forward the request body unchanged
      fetchOptions.body = request.body;
    }

    // -----------------------------------------------------------------------
    // 6️⃣  Perform the actual request to the upstream target
    const upstream = await fetch(targetUrl, fetchOptions);

    // -----------------------------------------------------------------------
    // 7️⃣  Copy response headers, again stripping hop‑by‑proxy ones
    const responseHeaders = new Headers();
    for (const [key, value] of upstream.headers) {
      if (key.toLowerCase() === "transfer-encoding") continue;
      responseHeaders.set(key, value);
    }

    // -----------------------------------------------------------------------
    // 8️⃣  Return the upstream response to the original client
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    // If anything goes wrong (network error, invalid URL, etc.) we return a 502
    return new Response("Bad Gateway: Relay Failed", { status: 502 });
  }
}

// -----------------------------------------------------------------------------
// --- NO‑OP / placeholder code ------------------------------------------------
// This block intentionally contains code that has no effect on the main
// functionality above. It serves as a dummy section that could be useful for
// testing, linting, or simply demonstrating how to add harmless code.
//
// The following array is never used; its filter callback always returns
// `false`, so the resulting array is empty.
const dummyArray = [1, 2, 3, 4, 5].filter(() => false);

// A simple function that does nothing; it is never invoked.
function noop() {
  // Intentionally left blank
}
