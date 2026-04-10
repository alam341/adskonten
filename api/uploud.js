// api/upload.js — CommonJS, Vercel Serverless Function

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KIE_API_KEY belum diset di Vercel Environment Variables.' });
  }

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 diperlukan.' });

    // Bersihkan data URL prefix jika ada
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');
    const type = mimeType || 'image/jpeg';
    const ext  = type.split('/')[1] || 'jpg';

    // Build multipart/form-data manual
    const boundary = 'AdGenBoundary' + Date.now();
    const header   = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.${ext}"\r\nContent-Type: ${type}\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([header, binaryData, footer]);

    const uploadRes = await fetch('https://api.kie.ai/api/v1/files/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const data = await uploadRes.json();

    if (!uploadRes.ok) {
      return res.status(uploadRes.status).json({ error: data.msg || 'Upload ke kie.ai gagal.' });
    }

    return res.status(200).json({ url: data.data?.url });

  } catch (err) {
    console.error('[upload error]', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
};
