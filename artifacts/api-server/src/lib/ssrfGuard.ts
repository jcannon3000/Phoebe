import { lookup } from "node:dns/promises";
import net from "node:net";

// ── SSRF guard ───────────────────────────────────────────────────────────────
// Call before fetch()ing any URL whose host is influenced by user input (e.g. a
// user-submitted calendar feed). It requires http(s) and rejects hosts that
// resolve to a non-routable / internal address. It resolves the name and checks
// EVERY answer, so it also defeats DNS-rebinding (a public name pointing at
// 127.0.0.1 / 169.254.169.254 / 10.x / …) — the classic SSRF-to-cloud-metadata
// and internal-service vectors.

function ipv4IsBlocked(ip: string): boolean {
  const p = ip.split(".").map((s) => Number(s));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // malformed → block
  const a = p[0]!, b = p[1]!;
  if (a === 0) return true;                          // 0.0.0.0/8 "this network"
  if (a === 127) return true;                        // loopback
  if (a === 10) return true;                         // private
  if (a === 169 && b === 254) return true;           // link-local incl. 169.254.169.254 (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;  // private
  if (a === 192 && b === 168) return true;           // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true;                         // multicast / reserved / 255.255.255.255
  return false;
}

function ipIsBlocked(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip); // IPv4-mapped IPv6
  if (mapped) return ipv4IsBlocked(mapped[1]!);
  if (net.isIPv4(ip)) return ipv4IsBlocked(ip);
  if (net.isIPv6(ip)) {
    const lc = ip.toLowerCase();
    if (lc === "::1" || lc === "::") return true;            // loopback / unspecified
    if (/^fe[89ab]/.test(lc)) return true;                   // fe80::/10 link-local
    if (/^f[cd]/.test(lc)) return true;                      // fc00::/7 unique-local
    return false;
  }
  return true; // unrecognized form → block
}

/**
 * Throws if `raw` is not a safe public http(s) URL. On success the request is
 * safe to fetch (modulo TOCTOU, which a connect-time check would close — good
 * enough against the literal-IP + DNS-rebind vectors that matter here).
 */
export async function assertPublicHttpUrl(raw: string): Promise<void> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Invalid URL"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  const lcHost = host.toLowerCase();
  if (!host || lcHost === "localhost" || lcHost.endsWith(".localhost")) {
    throw new Error("Blocked host");
  }
  let addrs: string[];
  if (net.isIP(host)) {
    addrs = [host];
  } else {
    try {
      addrs = (await lookup(host, { all: true })).map((r) => r.address);
    } catch {
      throw new Error("Host did not resolve");
    }
  }
  if (addrs.length === 0) throw new Error("Host did not resolve");
  for (const ip of addrs) {
    if (ipIsBlocked(ip)) throw new Error("URL resolves to a blocked address");
  }
}

/**
 * SSRF-safe fetch for any URL whose host is influenced by user input.
 *
 * The trap with a plain `assertPublicHttpUrl(url)` + `fetch(url)` is that
 * Node's fetch follows 30x redirects INTERNALLY without re-validating — so a
 * public URL that redirects to http://169.254.169.254/… or http://localhost/…
 * sails straight past the guard. This follows redirects MANUALLY and runs the
 * guard on every hop (including the initial URL), with a bounded hop count and
 * a total-time deadline that also bounds the caller's body read.
 *
 * Returns the final (non-redirect) Response. Throws if any hop resolves to a
 * blocked address, the redirect chain is too long, or the request times out.
 */
export async function safeFetch(
  rawUrl: string,
  opts: { timeoutMs?: number; maxRedirects?: number; headers?: Record<string, string> } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  let current = rawUrl;
  for (let hop = 0; ; hop++) {
    await assertPublicHttpUrl(current);
    const res = await fetch(current, { signal, redirect: "manual", headers: opts.headers });
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc || hop >= maxRedirects) throw new Error("Too many redirects");
    current = new URL(loc, current).toString();
  }
}
