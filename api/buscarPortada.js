// api/buscarPortada.js
// AREA 51 - Buscador/descargador de portadas públicas de GamesFull
// Módulo independiente para Vercel. No toca tus otros HTML ni APIs.

const BASE_URL = "https://gamesfull.app";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 AREA51-CoverTool/1.0";

function json(res, status, payload) {
  res.status(status).json(payload);
}

function limpiarHtml(texto = "") {
  return texto
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizar(texto = "") {
  return texto
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(texto = "") {
  return normalizar(texto).replace(/\s+/g, "-");
}

function absolutizar(url, base = BASE_URL) {
  if (!url) return "";
  const clean = url.replace(/\\/g, "").trim();
  if (clean.startsWith("//")) return "https:" + clean;
  if (/^https?:\/\//i.test(clean)) return clean;
  try {
    return new URL(clean, base).href;
  } catch {
    return "";
  }
}

async function fetchTexto(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    },
  });

  const text = await r.text();
  return { ok: r.ok, status: r.status, url: r.url || url, text };
}

function extraerTitulo(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) return limpiarHtml(h1);

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title) {
    return limpiarHtml(title)
      .replace(/^Descargar\s+/i, "")
      .replace(/\s*\|\s*torrent.*$/i, "")
      .replace(/\s*Gamesfull.*$/i, "")
      .trim();
  }

  return "";
}

function extraerLinksDeJuegos(html) {
  const links = new Map();
  const re = /<a[^>]+href=["']([^"']*\/juegos\/[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;

  while ((m = re.exec(html))) {
    const href = absolutizar(m[1]);
    const text = limpiarHtml(m[2]);
    if (!href || !href.includes("/juegos/")) continue;
    links.set(href, text);
  }

  return [...links.entries()].map(([url, title]) => ({ url, title }));
}

function puntuarLink(link, query) {
  const q = normalizar(query);
  const title = normalizar(link.title);
  const urlText = normalizar(decodeURIComponent(link.url));

  let score = 0;
  if (title === q) score += 100;
  if (title.includes(q)) score += 60;
  if (urlText.includes(q.replace(/\s+/g, " "))) score += 35;

  for (const word of q.split(" ").filter(Boolean)) {
    if (title.includes(word)) score += 8;
    if (urlText.includes(word)) score += 4;
  }

  return score;
}

async function buscarPaginaJuego(game) {
  const q = slugify(game);

  // 1) Probar URLs comunes. GamesFull suele usar slugs más release.
  const releases = [
    "elamigos",
    "deluxe-edition",
    "premium-edition",
    "gold-edition",
    "definitive-edition",
    "remastered",
    "",
  ];

  const candidatosDirectos = releases.map((release) => {
    const suffix = release ? `-${release}` : "";
    return `${BASE_URL}/juegos/${q}${suffix}`;
  });

  for (const url of candidatosDirectos) {
    const page = await fetchTexto(url);
    if (page.ok && /<h1|<title/i.test(page.text) && !/404|not found/i.test(page.text.slice(0, 1000))) {
      const title = extraerTitulo(page.text);
      const nTitle = normalizar(title);
      const nGame = normalizar(game);
      if (!title || nTitle.includes(nGame.split(" ")[0]) || page.url.includes(q)) {
        return { ...page, title };
      }
    }
  }

  // 2) Buscar dentro de páginas públicas del sitio.
  const busquedas = [
    `${BASE_URL}/`,
    `${BASE_URL}/juegos`,
    `${BASE_URL}/juegos?search=${encodeURIComponent(game)}`,
    `${BASE_URL}/buscar?query=${encodeURIComponent(game)}`,
    `${BASE_URL}/search?q=${encodeURIComponent(game)}`,
  ];

  const links = [];
  for (const url of busquedas) {
    const page = await fetchTexto(url);
    if (page.ok) links.push(...extraerLinksDeJuegos(page.text));
  }

  const ordenados = links
    .map((link) => ({ ...link, score: puntuarLink(link, game) }))
    .filter((link) => link.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const link of ordenados.slice(0, 6)) {
    const page = await fetchTexto(link.url);
    if (page.ok) {
      return { ...page, title: extraerTitulo(page.text) || link.title };
    }
  }

  return null;
}

function extraerImagenes(html, pageUrl) {
  const urls = new Set();

  const patrones = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/gi,
    /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["'][^>]*>/gi,
    /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi,
    /["'](\/[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?)["']/gi,
  ];

  for (const re of patrones) {
    let m;
    while ((m = re.exec(html))) {
      const full = absolutizar(m[1], pageUrl);
      if (full) urls.add(full);
    }
  }

  return [...urls];
}

function elegirMejorImagen(urls) {
  const malas = [
    "avatar",
    "logo",
    "user",
    "profile",
    "placeholder",
    "icon",
    "favicon",
    "banner-ads",
    "discord",
  ];

  const limpias = urls.filter((url) => {
    const u = url.toLowerCase();
    if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)) return false;
    return !malas.some((bad) => u.includes(bad));
  });

  const puntuar = (url) => {
    const u = url.toLowerCase();
    let score = 0;
    if (u.includes("cover")) score += 40;
    if (u.includes("portada")) score += 40;
    if (u.includes("poster")) score += 35;
    if (u.includes("juegos")) score += 20;
    if (u.includes("games")) score += 10;
    if (u.includes("thumb")) score -= 10;
    if (u.includes("small")) score -= 15;
    if (u.includes("150x") || u.includes("100x")) score -= 30;
    if (u.endsWith(".webp")) score += 3;
    return score;
  };

  return (limpias.length ? limpias : urls).sort((a, b) => puntuar(b) - puntuar(a))[0] || "";
}

async function descargarImagen(req, res) {
  const imageUrl = req.query.url;
  const name = req.query.name || "portada";

  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return json(res, 400, { ok: false, error: "URL de imagen inválida." });
  }

  const r = await fetch(imageUrl, {
    headers: {
      "User-Agent": USER_AGENT,
      "Referer": BASE_URL + "/",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  if (!r.ok) {
    return json(res, 502, { ok: false, error: "No se pudo descargar la imagen origen." });
  }

  const contentType = r.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await r.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.jpg"`);
  return res.status(200).send(buffer);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }

    if (req.query.download === "1") {
      return descargarImagen(req, res);
    }

    const game = (req.query.game || "").toString().trim();
    if (!game) {
      return json(res, 400, { ok: false, error: "Falta el parámetro game." });
    }

    const page = await buscarPaginaJuego(game);
    if (!page) {
      return json(res, 404, {
        ok: false,
        error: "No encontré el juego en GamesFull. Probá con el nombre más exacto.",
      });
    }

    const title = page.title || extraerTitulo(page.text) || game;
    const imageUrls = extraerImagenes(page.text, page.url);
    const imageUrl = elegirMejorImagen(imageUrls);

    if (!imageUrl) {
      return json(res, 404, {
        ok: false,
        error: "Encontré el juego, pero no pude detectar una portada descargable.",
        gameUrl: page.url,
        title,
      });
    }

    const safeName = slugify(title || game) || "portada";
    const downloadUrl =
      `/api/buscarPortada?download=1&name=${encodeURIComponent(safeName)}` +
      `&url=${encodeURIComponent(imageUrl)}`;

    return json(res, 200, {
      ok: true,
      title,
      gameUrl: page.url,
      imageUrl,
      downloadUrl,
      foundImages: imageUrls.length,
    });
  } catch (err) {
    console.error("Error en buscarPortada:", err);
    return json(res, 500, {
      ok: false,
      error: "Error interno buscando la portada.",
      detail: err.message,
    });
  }
}
