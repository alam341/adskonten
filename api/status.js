// api/status.js — CommonJS, Vercel Serverless Function

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KIE_API_KEY belum diset di Vercel Environment Variables.' });
  }

  const { taskId, model } = req.query;
  if (!taskId) return res.status(400).json({ error: 'taskId diperlukan.' });
  if (!model)  return res.status(400).json({ error: 'model diperlukan.' });

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
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    const data = await kieRes.json();

    if (!kieRes.ok) {
      return res.status(kieRes.status).json({ error: data.msg || 'Gagal cek status.' });
    }

    const d      = data.data;
    const status = d?.status || d?.state || 'PENDING';

    // Cari image URL dari berbagai kemungkinan response shape
    let imageUrl = null;
    const DONE = ['SUCCESS', 'success', 'completed', 'COMPLETED'];
    if (DONE.includes(status)) {
      const tries = [
        d?.output?.image_url,
        d?.output?.url,
        d?.output?.image,
        d?.output?.images?.[0],
        d?.output?.images?.[0]?.url,
        d?.imageUrl,
        d?.image_url,
        d?.url,
        d?.images?.[0],
        d?.images?.[0]?.url,
        d?.result?.image_url,
        d?.result?.url,
        d?.result?.images?.[0],
      ];
      imageUrl = tries.find(c => typeof c === 'string' && c.startsWith('http')) || null;
    }

    return res.status(200).json({ status, imageUrl });

  } catch (err) {
    console.error('[status error]', err);
    return res.status(500).json({ error: err.message });
  }
};
