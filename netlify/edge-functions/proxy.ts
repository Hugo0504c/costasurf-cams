import type { Config, Context } from "https://edge.netlify.com";

// Relays the Meteo365 live cams so the browser can show them.
//   Video (HLS):      /proxy/<host>/<file>            →  https://<host>.meteo365.es/hls_live/<file>
//   Latest snapshot:  /proxy/<host>/snap/<name>.webp  →  https://<host>.meteo365.es/livecams/<name>/current.webp
//
// Locked down so it can't be used as a general relay: only the two cam hosts, only a playlist (.m3u8), a video
// segment (.ts) or a cam's current snapshot with a plain name, only GET, and a per-IP request limit (see config below).
const ALLOWED_HOSTS = new Set(["webcam", "webcam2"]);
const FILE_RE = /^[A-Za-z0-9_-]{1,64}\.(m3u8|ts)$/;
const SNAP_RE = /^([A-Za-z0-9_-]{1,64})\.webp$/;

// Content type, browser cache and CDN cache for each kind of file.
// Netlify-CDN-Cache-Control lets Netlify's CDN keep the answer (config.cache = "manual"), so when several people
// look at the same cam this function runs and hits meteo365 once, not once per viewer.
//  · segments never change (each has its own name)
//  · the playlist changes every ~4 s, so it is kept for 2 s only
//  · the snapshot is the "what does it look like" preview shown before pressing play: 15 min old at most is fine
const KINDS = {
  playlist: { type: "application/vnd.apple.mpegurl", browser: "no-cache", cdn: "public, s-maxage=2" },
  segment: { type: "video/mp2t", browser: "public, max-age=60", cdn: "public, s-maxage=300" },
  snapshot: { type: "image/webp", browser: "public, max-age=300", cdn: "public, s-maxage=900" },
};

export default async (request: Request, _context: Context) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Only our own pages may use the proxy: browsers say where a request comes from in Sec-Fetch-Site, and another
  // site embedding our cams (and spending our bandwidth) would send "cross-site". Old browsers that don't send the
  // header are let through; scripts outside a browser are still held back by the per-IP rate limit below.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return new Response("Forbidden", { status: 403 });
  }

  const parts = new URL(request.url).pathname.split("/"); // ["", "proxy", host, file] or ["", "proxy", host, "snap", file]
  const host = parts[2];
  let upstreamUrl: string, kind: keyof typeof KINDS;
  if (!ALLOWED_HOSTS.has(host)) return new Response("Not found", { status: 404 });
  if (parts.length === 4 && FILE_RE.test(parts[3])) {
    upstreamUrl = `https://${host}.meteo365.es/hls_live/${parts[3]}`;
    kind = parts[3].endsWith(".m3u8") ? "playlist" : "segment";
  } else if (parts.length === 5 && parts[3] === "snap" && SNAP_RE.test(parts[4])) {
    upstreamUrl = `https://${host}.meteo365.es/livecams/${SNAP_RE.exec(parts[4])![1]}/current.webp`;
    kind = "snapshot";
  } else {
    return new Response("Not found", { status: 404 });
  }

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        "Referer": "https://meteo365.es/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });

    // Only pass on what the player needs, never the upstream's cookies or other headers.
    // No Access-Control-Allow-Origin: our pages call the proxy from the same origin, so they don't need CORS.
    const k = KINDS[kind];
    const headers = new Headers({
      "Content-Type": k.type,
      "Cache-Control": k.browser,
      "X-Content-Type-Options": "nosniff",
    });
    if (upstream.ok) {
      headers.set("Netlify-CDN-Cache-Control", k.cdn);
      // Cached copies are kept apart per Sec-Fetch-Site, so a cross-site request never gets our cached answer
      // without running the check above
      headers.set("Netlify-Vary", "header=Sec-Fetch-Site");
    }
    return new Response(upstream.ok ? upstream.body : null, { status: upstream.ok ? 200 : upstream.status, headers });
  } catch (_err) {
    return new Response("Cam unavailable", { status: 502 });
  }
};

// A viewer watching a cam makes ~1 request per 2 s (playlist + 4 s segments), plus one snapshot per cam on the page,
// so 400 a minute per IP leaves plenty of room for real use while cutting off floods. Free plan: 2 rules max.
export const config: Config = {
  path: "/proxy/*",
  cache: "manual", // responses may be cached by the CDN (see Netlify-CDN-Cache-Control above)
  rateLimit: {
    windowLimit: 400,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
