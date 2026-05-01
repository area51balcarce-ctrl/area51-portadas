export default async function handler(req, res) {
  const { juego } = req.query;

  if (!juego) {
    return res.status(400).json({ error: "Falta juego" });
  }

  try {
    // 1. Token Twitch
    const tokenRes = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.CLIENT_ID}&client_secret=${process.env.CLIENT_SECRET}&grant_type=client_credentials`, {
      method: "POST"
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Buscar juego en IGDB
    const igdbRes = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": process.env.CLIENT_ID,
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "text/plain"
      },
      body: `search "${juego}"; fields name, cover.url; limit 1;`
    });

    const data = await igdbRes.json();

    if (!data.length || !data[0].cover) {
      return res.status(404).json({ error: "No encontrada" });
    }

    let img = data[0].cover.url;

    // mejorar calidad
    img = img.replace("t_thumb", "t_cover_big");

    return res.status(200).json({
      juego: data[0].name,
      imagen: "https:" + img
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Error interno" });
  }
}
