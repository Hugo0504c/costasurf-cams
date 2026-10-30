import type { Config, Context } from "https://edge.netlify.com";

// Maintenance mode: while the owner has it on (Telegram bot → /admin → Mantenimiento), the whole site or the chosen
// sections answer with a "we're doing maintenance" page (503 + Retry-After: search engines read it as temporary).
//  · Admins see the real site at its normal address: the maintenance page gets them a signed cookie (cs_admin) from
//    functions/maintenance-pass.js, checked here with MAINT_COOKIE_SECRET. The owner also has a private link
//    (?acceso=<token>, from the bot) that leaves another cookie (cs_mantenimiento).
//  · Never blocked: /login (so admins can log in), /legal (must always be reachable), functions (/.netlify/*: the bot,
//    alerts, the switch itself), the cam proxy and static files.
//  · If the state can't be read the site is served normally: a failure here must never take the site down.
type State = { on: boolean; until: string | null; pages: string[] | null; bypassHash: string | null };
const OFF: State = { on: false, until: null, pages: null, bypassHash: null };
const TTL_MS = 10_000; // each edge instance asks at most every 10 s
let cache: { at: number; state: State } | null = null;

async function getState(origin: string): Promise<State> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.state;
  try {
    const res = await fetch(`${origin}/.netlify/functions/maintenance-state`);
    const state: State = res.ok ? await res.json() : OFF;
    cache = { at: Date.now(), state };
    return state;
  } catch (_err) {
    return OFF;
  }
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
// cs_admin = <userId>.<expiry s>.<hmac hex>: valid if the signature matches and it hasn't expired.
// crypto.subtle.verify compares in constant time (a plain === could leak, byte by byte, how much of a guess is right).
async function isAdminPass(value: string | undefined): Promise<boolean> {
  const secret = Netlify.env.get("MAINT_COOKIE_SECRET");
  if (!value || !secret || secret.length < 32) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [user, exp, sig] = parts;
  const left = Number(exp) * 1000 - Date.now(); // passes last 2 h (maintenance-pass.js): anything longer isn't ours
  if (!/^[0-9a-f-]{36}$/.test(user) || !/^\d{10}$/.test(exp) || left <= 0 || left > 2.5 * 3600_000 || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = new Uint8Array(sig.match(/../g)!.map((h) => parseInt(h, 16)));
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(`${user}.${exp}`));
}

// Which section a URL belongs to (same names as SECTIONS in netlify/shared/maintenance.js); null = never blocked.
// The path is normalised first the way Netlify serves it (decoded, any case, repeated slashes): otherwise
// //herramientas or /Herramientas would count as another section and slip past a partial maintenance.
function sectionOf(path: string): string | null {
  let p = path;
  try { p = decodeURIComponent(p); } catch (_err) { /* malformed: keep as is */ }
  p = p.toLowerCase().replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";
  if (p === "/login" || p === "/login.html" || p === "/legal" || p === "/legal.html") return null;
  if (p === "/" || p === "/index.html" || p === "/webcams" || p === "/forecast") return "home";
  if (p.startsWith("/herramientas")) return "herramientas";
  if (p.startsWith("/perfil")) return "perfil";
  if (p.startsWith("/info")) return "info";
  return "spots"; // spot.html, /misericordia, /torre-del-mar… (and unknown pages)
}

const BYPASS_COOKIE = "cs_mantenimiento";

function page(until: string | null, partial: boolean, homeOpen: boolean): string {
  const back = until
    ? `Volvemos el <strong>${new Date(until).toLocaleString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</strong> (hora de España).`
    : "Volvemos lo antes posible.";
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>En mantenimiento - CostaSurf Cams</title>
<link rel="icon" href="/favicon.svg?v=3" type="image/svg+xml">
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 24px; box-sizing: border-box; }
  main { max-width: 520px; text-align: center; }
  .logo { font-weight: 900; letter-spacing: -1px; font-size: 1.4rem; margin-bottom: 2rem; }
  svg { color: #111; }
  h1 { font-size: 1.9rem; font-weight: 900; margin: 1rem 0 0.75rem; }
  p { color: #555; line-height: 1.6; font-size: 1.05rem; margin: 0 0 0.75rem; }
  .home { display: inline-block; margin-top: 0.75rem; background: #111; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; }
  .small { font-size: 0.85rem; color: #999; margin-top: 2rem; }
  .small a { color: #999; }
</style>
</head>
<body>
<main>
  <div class="logo">COSTASURF CAMS</div>
  <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
  <h1>${partial ? "Esta sección está en mantenimiento" : "Estamos en mantenimiento"}</h1>
  <p>Estamos mejorando la web para traerte mejores previsiones y webcams. ${back}</p>
  <p>Mientras tanto, el bot de Telegram y tus alertas de olas siguen funcionando.</p>
  ${partial && homeOpen ? '<a class="home" href="/">Ir a la portada</a>' : ""}
  <p class="small">Gracias por tu paciencia. · <a href="/login?next=%2F">Acceso administradores</a></p>
</main>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js" integrity="sha384-dl/4LkSyQ4uEucc48NM6VDZLAjLLq9yMzZ5JLXumBq7Ld33XBof73hseOqPhO89+" crossorigin="anonymous"></script>
<script src="/supabase-config.js?v=7"></script>
<script src="/maintenance-admin.js?v=1"></script>
</body>
</html>`;
}

export default async (request: Request, context: Context) => {
  if (request.method !== "GET" && request.method !== "HEAD") return;
  const url = new URL(request.url);
  const section = sectionOf(url.pathname);
  if (!section) return; // login / legal: always open
  const state = await getState(url.origin);
  const active = state.on && (!state.until || Date.parse(state.until) > Date.now());
  if (!active) return; // normal site
  if (state.pages && !state.pages.includes(section)) return; // only some sections are in maintenance

  // Admins (signed pass) and the owner's private link see the real site
  if (await isAdminPass(context.cookies.get("cs_admin"))) return;
  const token = url.searchParams.get("acceso");
  if (token && state.bypassHash && (await sha256(token)) === state.bypassHash) {
    url.searchParams.delete("acceso");
    const maxAge = state.until ? Math.max(60, Math.round((Date.parse(state.until) - Date.now()) / 1000)) : 7 * 86400;
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.pathname + url.search,
        "Set-Cookie": `${BYPASS_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });
  }
  const cookie = context.cookies.get(BYPASS_COOKIE);
  if (cookie && state.bypassHash && (await sha256(cookie)) === state.bypassHash) return;

  const retryAfter = state.until ? Math.max(60, Math.round((Date.parse(state.until) - Date.now()) / 1000)) : 3600;
  const partial = !!state.pages;
  const homeOpen = partial && !state.pages!.includes("home");
  return new Response(request.method === "HEAD" ? null : page(state.until, partial, homeOpen), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(retryAfter),
      "X-Robots-Tag": "noindex",
    },
  });
};

// Pages only: functions, the cam proxy and static files always pass
export const config: Config = {
  path: "/*",
  excludedPath: ["/.netlify/*", "/proxy/*", "/*.js", "/*.css", "/*.svg", "/*.ico", "/*.png", "/*.jpg", "/*.webp", "/*.json", "/*.txt", "/*.xml"],
};
