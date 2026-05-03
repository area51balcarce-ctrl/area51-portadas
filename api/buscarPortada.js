export default async function handler(req, res) {
  const { juego } = req.query;

  if (!juego) {
    return res.status(400).json({ ok: false, error: "Falta el nombre del juego" });
  }

  try {
    const buscarUrl = `https://www.steamgriddb.com/search/grids?term=${encodeURIComponent(juego)}`;
    const htmlRes = await fetch(buscarUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      }
    });

    const html = await htmlRes.text();

    const urls = [...html.matchAll(/https:\/\/cdn\.steamgriddb\.com\/grid\/[^"'\\\s<>]+?\.(?:png|jpg|jpeg|webp)/gi)]
      .map(m => m[0])
      .filter(Boolean);

    const unicas = [...new Set(urls)];

    if (!unicas.length) {
      return res.status(404).json({ ok: false, error: "No se encontraron portadas verticales" });
    }

    const candidatas = unicas.filter(url =>
      url.includes("600x900") ||
      url.includes("512x768") ||
      url.includes("342x482")
    );

    const imagen = candidatas[0] || unicas[0];

    return res.status(200).json({
      ok: true,
      juego,
      imagen,
      total: unicas.length
    });

  } catch (err) {
    console.error("Error SteamGridDB:", err);
    return res.status(500).json({
      ok: false,
      error: "Error consultando SteamGridDB"
    });
  }
}
