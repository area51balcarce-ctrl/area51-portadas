// api/buscarPortada.js
// AREA 51 - Buscador/descargador de portadas públicas de GamesFull
// V3: prioriza PORTADA/POSTER real y penaliza wallpapers/banners.

const BASE_URL = "https://gamesfull.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 AREA51-CoverTool/2.0";

function json(res, status, payload) { res.status(status).json(payload); }
function limpiarHtml(texto = "") {
  return texto.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function normalizar(texto = "") {
  return texto.toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function slugify(texto = "") { return normalizar(texto).replace(/\s+/g, "-"); }
function absolutizar(url, base = BASE_URL) {
  if (!url) return "";
  const clean = url.replace(/\\/g, "").trim();
  if (clean.startsWith("//")) return "https:" + clean;
  if (/^https?:\/\//i.test(clean)) return clean;
  try { return new URL(clean, base).href; } catch { return ""; }
}
async function fetchTexto(url) {
  const r = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*", "Accept-Language": "es-AR,es;q=0.9,en;q=0.8", "Referer": BASE_URL + "/" } });
  const text = await r.text();
  return { ok: r.ok, status: r.status, url: r.url || url, text };
}
function extraerTitulo(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) return limpiarHtml(h1);
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i)?.[1];
  if (og) return limpiarHtml(og).replace(/\s*GamesFull.*$/i, "").trim();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) return limpiarHtml(title).replace(/^Descargar\s+/i, "").replace(/\s*\|\s*torrent.*$/i, "").replace(/\s*Gamesfull.*$/i, "").trim();
  return "";
}
function extraerLinksDeJuegos(html) {
  const links = new Map();
  const re = /<a[^>]+href=["']([^"']*\/juegos\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = absolutizar(m[1]);
    const text = limpiarHtml(m[2]);
    if (href && href.includes("/juegos/")) links.set(href, text);
  }
  return [...links.entries()].map(([url, title]) => ({ url, title }));
}
function puntuarLink(link, query) {
  const q = normalizar(query), slug = slugify(query), title = normalizar(link.title), urlText = normalizar(decodeURIComponent(link.url));
  let score = 0;
  if (title === q) score += 120;
  if (title.includes(q)) score += 70;
  if (decodeURIComponent(link.url).toLowerCase().includes(`/juegos/${slug}`)) score += 100;
  for (const word of q.split(" ").filter(Boolean)) { if (title.includes(word)) score += 10; if (urlText.includes(word)) score += 5; }
  return score;
}
async function buscarPaginaJuego(game) {
  const q = slugify(game);
  const directos = [`${BASE_URL}/juegos/${q}`, `${BASE_URL}/juegos/${q}-elamigos`, `${BASE_URL}/juegos/${q}-deluxe-edition`, `${BASE_URL}/juegos/${q}-premium-edition`, `${BASE_URL}/juegos/${q}-gold-edition`, `${BASE_URL}/juegos/${q}-definitive-edition`, `${BASE_URL}/juegos/${q}-remastered`];
  for (const url of directos) {
    const page = await fetchTexto(url);
    if (page.ok && /<h1|<title/i.test(page.text) && !/404|not found/i.test(page.text.slice(0, 1200))) return { ...page, title: extraerTitulo(page.text) };
  }
  const busquedas = [`${BASE_URL}/`, `${BASE_URL}/juegos`, `${BASE_URL}/juegos?search=${encodeURIComponent(game)}`, `${BASE_URL}/buscar?query=${encodeURIComponent(game)}`, `${BASE_URL}/search?q=${encodeURIComponent(game)}`];
  const links = [];
  for (const url of busquedas) { const page = await fetchTexto(url); if (page.ok) links.push(...extraerLinksDeJuegos(page.text)); }
  const ordenados = links.map((link) => ({ ...link, score: puntuarLink(link, game) })).filter((link) => link.score > 0).sort((a, b) => b.score - a.score);
  for (const link of ordenados.slice(0, 8)) { const page = await fetchTexto(link.url); if (page.ok) return { ...page, title: extraerTitulo(page.text) || link.title }; }
  return null;
}
function extraerImagenes(html, pageUrl) {
  const urls = [];
  const add = (u) => { const full = absolutizar(u, pageUrl); if (full && !urls.includes(full)) urls.push(full); };
  const patrones = [/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi, /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/gi, /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi, /["'](\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi];
  for (const re of patrones) { let m; while ((m = re.exec(html))) add(m[1]); }
  const imgRe = /<img\b[^>]*>/gi; let tag;
  while ((tag = imgRe.exec(html))) {
    const t = tag[0];
    for (const attr of ["src", "data-src", "data-lazy-src", "data-original"]) { const val = t.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"))?.[1]; add(val); }
    const srcset = t.match(/(?:srcset|data-srcset)=["']([^"']+)["']/i)?.[1];
    if (srcset) for (const part of srcset.split(",")) add(part.trim().split(/\s+/)[0]);
  }
  return urls;
}
function elegirMejorImagen(urls, title = "", pageUrl = "") {
  const titleSlug = slugify(title);
  const pageSlug = (pageUrl.match(/\/juegos\/([^/?#]+)/i)?.[1] || "").toLowerCase();
  const words = normalizar(title).split(" ").filter((w) => w.length >= 3);
  const malas = ["avatar", "logo", "user", "profile", "placeholder", "icon", "favicon", "banner-ads", "discord", "telegram", "whatsapp", "youtube", "facebook", "instagram", "default", "loading", "sprite"];
  const limpias = urls.filter((url) => {
    const u = url.toLowerCase();
    return /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u) && !malas.some((bad) => u.includes(bad));
  });
  const puntuar = (url, index) => {
    const u = decodeURIComponent(url).toLowerCase();
    let score = 100 - index;
    const relevant = (titleSlug && u.includes(titleSlug)) || (pageSlug && u.includes(pageSlug)) || words.some((w) => u.includes(w));
    if (relevant) score += 260;
    if (titleSlug && u.includes(titleSlug)) score += 160;
    if (pageSlug && u.includes(pageSlug)) score += 160;
    for (const w of words) if (u.includes(w)) score += 20;
    if (u.includes("poster")) score += 520;
    if (u.includes("cover")) score += 420;
    if (u.includes("portada")) score += 420;
    if (u.includes("boxart")) score += 360;
    if (u.includes("capsule")) score += 160;
    if (/\b(193x288|300x450|512x768|600x900|400x600|450x650|600x800)\b/.test(u)) score += 300;
    if (u.includes("wallpaper")) score -= 650;
    if (u.includes("background")) score -= 450;
    if (u.includes("hero")) score -= 360;
    if (u.includes("banner")) score -= 300;
    if (u.includes("screenshot")) score -= 320;
    if (u.includes("gallery")) score -= 220;
    if (u.includes("slider")) score -= 220;
    if (!relevant) score -= 220;
    if (u.includes("thumb")) score -= 20;
    if (u.includes("small")) score -= 25;
    if (u.includes("150x") || u.includes("100x")) score -= 60;
    return score;
  };
  return (limpias.length ? limpias : urls).map((url, index) => ({ url, score: puntuar(url, index) })).sort((a, b) => b.score - a.score)[0]?.url || "";
}

async function existeImagen(url) {
  try {
    const r = await fetch(url, { method: "GET", headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/", "Accept": "image/*,*/*;q=0.8" } });
    const ct = r.headers.get("content-type") || "";
    return r.ok && ct.startsWith("image/");
  } catch { return false; }
}

async function buscarPosterPorConvencion(imageUrl) {
  if (!imageUrl) return "";
  const candidatos = [
    imageUrl.replace("/wallpaper/", "/poster/").replace(/-wallpaper-/i, "-poster-"),
    imageUrl.replace("/wallpaper/", "/cover/").replace(/-wallpaper-/i, "-cover-"),
    imageUrl.replace(/-wallpaper-/i, "-poster-"),
    imageUrl.replace(/-wallpaper-/i, "-cover-")
  ];
  for (const c of [...new Set(candidatos)]) {
    if (c !== imageUrl && await existeImagen(c)) return c;
  }
  return "";
}

async function proxyImagen(req, res) {
  const imageUrl = req.query.url;
  const name = req.query.name || "portada";
  const mode = req.query.mode === "preview" ? "preview" : "download";
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return json(res, 400, { ok: false, error: "URL de imagen inválida." });
  const r = await fetch(imageUrl, { headers: { "User-Agent": USER_AGENT, "Referer": BASE_URL + "/", "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" } });
  if (!r.ok) return json(res, 502, { ok: false, error: "No se pudo descargar la imagen origen.", status: r.status });
  const contentType = r.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const buffer = Buffer.from(await r.arrayBuffer());
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Disposition", mode === "preview" ? "inline" : `attachment; filename="${name}.${ext}"`);
  return res.status(200).send(buffer);
}
export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return json(res, 405, { ok: false, error: "Method not allowed" });
    if (req.query.download === "1") return proxyImagen(req, res);
    const game = (req.query.game || "").toString().trim();
    if (!game) return json(res, 400, { ok: false, error: "Falta el parámetro game." });
    const page = await buscarPaginaJuego(game);
    if (!page) return json(res, 404, { ok: false, error: "No encontré el juego en GamesFull. Probá con el nombre más exacto." });
    const title = page.title || extraerTitulo(page.text) || game;
    const imageUrls = extraerImagenes(page.text, page.url);
    let imageUrl = elegirMejorImagen(imageUrls, title, page.url);
    if (imageUrl && /wallpaper|background|hero|banner/i.test(imageUrl)) {
      const posterConvencion = await buscarPosterPorConvencion(imageUrl);
      if (posterConvencion) imageUrl = posterConvencion;
    }
    if (!imageUrl) return json(res, 404, { ok: false, error: "Encontré el juego, pero no pude detectar una portada descargable.", gameUrl: page.url, title });
    const safeName = slugify(title || game) || "portada";
    const proxyBase = `/api/buscarPortada?download=1&name=${encodeURIComponent(safeName)}&url=${encodeURIComponent(imageUrl)}`;
    return json(res, 200, { ok: true, title, gameUrl: page.url, imageUrl, previewUrl: proxyBase + "&mode=preview", downloadUrl: proxyBase, foundImages: imageUrls.length });
  } catch (err) {
    console.error("Error en buscarPortada:", err);
    return json(res, 500, { ok: false, error: "Error interno buscando la portada.", detail: err.message });
  }
}
