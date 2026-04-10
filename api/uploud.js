// api/upload.js
// Proxy untuk upload gambar ke kie.ai
// API key aman di server, tidak terekspos ke browser

export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key belum dikonfigurasi di server.' });
  }

  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 diperlukan.' });

    // Convert base64 ke binary
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const binaryData = Buffer.from(base64Data, 'base64');
    const type = mimeType || 'image/jpeg';
    const ext  = type.split('/')[1] || 'jpg';

    // Build FormData manual (Node.js tidak punya FormData native di semua versi)
    const boundary = '----AdGenBoundary' + Date.now().toString(16);
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="image.${ext}"\r\n`,
      `Content-Type: ${type}\r\n\r\n`,
    ];

    const header = Buffer.from(bodyParts.join(''));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body   = Buffer.concat([header, binaryData, footer]);

    const uploadRes = await fetch('https://api.kie.ai/api/v1/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      body,
    });

    const data = await uploadRes.json();

    if (!uploadRes.ok) {
      return res.status(uploadRes.status).json({ error: data.msg || 'Upload ke kie.ai gagal.' });
    }

    return res.status(200).json({ url: data.data?.url });
  } catch (err) {
    console.error('[upload]', err);
    return res.status(500).json({ error: err.message });
  }
}
