import type { Config, Context } from "https://edge.netlify.com";

// Relays the latest snapshot of the meteo365 cams, shown as each cam's cover on our pages (the live video only plays
// on meteo365.es, where the play button takes visitors):
//   /proxy/<host>/snap/<name>.webp  →  https://<host>.meteo365.es/livecams/<name>/current.webp
// plus a fixed list of other cams' snapshots (FIXED_SNAPS), e.g. /proxy/9pies/snap/elpalmar.jpg
//
// Locked down so it can't be used as a general relay: only the two cam hosts and the fixed snapshots, only a cam's
// current snapshot with a plain name, only GET, and a per-IP request limit (see config below).
const ALLOWED_HOSTS = new Set(["webcam", "webcam2"]);
const SNAP_RE = /^([A-Za-z0-9_-]{1,64})\.webp$/;
const FIXED_SNAPS = new Map([
  ["9pies/elpalmar.jpg", "https://www.escueladesurf9pies.com/webcam/snapshot.jpg"], // 9 Pies Escuela de Surf, El Palmar
]);

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

  const parts = new URL(request.url).pathname.split("/"); // ["", "proxy", host, "snap", file]
  const host = parts[2];
  const file = parts.length === 5 && parts[3] === "snap" ? parts[4] : "";
  const fixed = FIXED_SNAPS.get(`${host}/${file}`);
  const snap = SNAP_RE.exec(file);
  if (!fixed && (!ALLOWED_HOSTS.has(host) || !snap)) return new Response("Not found", { status: 404 });

  try {
    const upstream = await fetch(fixed || `https://${host}.meteo365.es/livecams/${snap![1]}/current.webp`);

    // Only pass on the picture, never the upstream's cookies or other headers.
    // No Access-Control-Allow-Origin: our pages load it from the same origin, so they don't need CORS.
    // The cams refresh their snapshot every minute; browsers keep it 5 min and Netlify's CDN 15 min
    // (Netlify-CDN-Cache-Control, config.cache = "manual"), so when several people look at the same cam this function
    // runs and hits the cam's owner once, not once per viewer.
    const headers = new Headers({
      "Content-Type": fixed ? "image/jpeg" : "image/webp",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    });
    if (upstream.ok) {
      headers.set("Netlify-CDN-Cache-Control", "public, s-maxage=900");
      // Cached copies are kept apart per Sec-Fetch-Site, so a cross-site request never gets our cached answer
      // without running the check above
      headers.set("Netlify-Vary", "header=Sec-Fetch-Site");
    }
    return new Response(upstream.ok ? upstream.body : null, { status: upstream.ok ? 200 : upstream.status, headers });
  } catch (_err) {
    return new Response("Cam unavailable", { status: 502 });
  }
};

// A page asks for one snapshot per cam on it (6 at most), so 400 a minute per IP leaves plenty of room for real use
// while cutting off floods. Free plan: 2 rules max.
export const config: Config = {
  path: "/proxy/*",
  cache: "manual", // responses may be cached by the CDN (see Netlify-CDN-Cache-Control above)
  rateLimit: {
    windowLimit: 400,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};
