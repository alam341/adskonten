// api/status.js
// Proxy untuk cek status task dari kie.ai
// API key aman di server, tidak terekspos ke browser

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key belum dikonfigurasi di server.' });
  }

  const { taskId, model } = req.query;
  if (!taskId || !model) {
    return res.status(400).json({ error: 'taskId dan model diperlukan.' });
  }

  try {
    let kieUrl;

    if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
      kieUrl = `https://api.kie.ai/api/v1/flux/kontext/detail?taskId=${taskId}`;
    } else if (model === 'gpt-image/1-5-image-to-image') {
      kieUrl = `https://api.kie.ai/api/v1/4o-image/detail?recordId=${taskId}`;
    } else {
      kieUrl = `https://api.kie.ai/api/v1/jobs/task?taskId=${taskId}`;
    }

    const kieRes = await fetch(kieUrl, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const data = await kieRes.json();

    if (!kieRes.ok) {
      return res.status(kieRes.status).json({ error: data.msg || 'Gagal cek status.' });
    }

    const d      = data.data;
    const status = d?.status || d?.state;

    // Normalize image URL dari berbagai response shape
    let imageUrl = null;
    if (['SUCCESS', 'success', 'completed', 'COMPLETED'].includes(status)) {
      const tries = [
        d?.output?.image_url, d?.output?.url, d?.output?.image,
        d?.output?.images?.[0], d?.output?.images?.[0]?.url,
        d?.imageUrl, d?.image_url, d?.url,
        d?.images?.[0], d?.images?.[0]?.url,
        d?.result?.image_url, d?.result?.url, d?.result?.images?.[0],
      ];
      imageUrl = tries.find(c => typeof c === 'string' && c.startsWith('http')) || null;
    }

    return res.status(200).json({ status, imageUrl });

  } catch (err) {
    console.error('[status]', err);
    return res.status(500).json({ error: err.message });
  }
}
