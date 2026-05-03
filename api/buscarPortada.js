export default async function handler(req, res) {
  const { juego } = req.query;

  if (!juego) {
    return res.status(400).json({ ok: false, error: "Falta juego" });
  }

  const API_KEY = process.env.STEAMGRIDDB_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "Falta STEAMGRIDDB_API_KEY en Vercel"
    });
  }

  try {
    const headers = {
      Authorization: `Bearer ${API_KEY}`
    };

    const searchRes = await fetch(
      `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(juego)}`,
      { headers }
    );

    const searchData = await searchRes.json();

    if (!searchData.success || !searchData.data || searchData.data.length === 0) {
      return res.status(404).json({ ok: false, error: "Juego no encontrado" });
    }

    const game = searchData.data[0];

    const gridsRes = await fetch(
      `https://www.steamgriddb.com/api/v2/grids/game/${game.id}?dimensions=600x900&types=static`,
      { headers }
    );

    const gridsData = await gridsRes.json();

    if (!gridsData.success || !gridsData.data || gridsData.data.length === 0) {
      return res.status(404).json({
        ok: false,
        error: "No se encontraron portadas verticales"
      });
    }

    const portadas = gridsData.data.slice(0, 12).map((img, index) => ({
      id: img.id || index,
      url: img.url,
      thumb: img.thumb || img.url,
      width: img.width,
      height: img.height
    }));

    return res.status(200).json({
      ok: true,
      juego: game.name,
      portadas
    });

  } catch (err) {
    console.error("Error SteamGridDB:", err);
    return res.status(500).json({
      ok: false,
      error: "Error consultando SteamGridDB"
    });
  }
}
