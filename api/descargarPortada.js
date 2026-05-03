export default async function handler(req, res) {
  const { url, nombre } = req.query;

  if (!url) {
    return res.status(400).send("Falta URL de imagen");
  }

  try {
    const imageRes = await fetch(url);

    if (!imageRes.ok) {
      return res.status(500).send("No se pudo descargar la imagen");
    }

    const contentType = imageRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await imageRes.arrayBuffer());

    const filename = (nombre || "portada.jpg")
      .replace(/[^a-z0-9._-]/gi, "_");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(buffer);

  } catch (error) {
    console.error("Error descargando portada:", error);
    return res.status(500).send("Error descargando portada");
  }
}
