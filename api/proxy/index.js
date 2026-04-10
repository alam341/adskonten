module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'KIE_API_KEY belum diset di Vercel.' });

  const action = req.query.action;

  try {

    // ── UPLOAD ──────────────────────────────────────────────
    if (action === 'upload') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 diperlukan.' });

      const r = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: imageBase64, uploadPath: 'images' }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: 'Upload error: ' + JSON.stringify(d) });
      const url = d.data?.downloadUrl || d.data?.fileUrl || d.data?.url;
      if (!url) return res.status(500).json({ error: 'URL tidak ditemukan: ' + JSON.stringify(d) });
      return res.status(200).json({ url });
    }

    // ── GENERATE ─────────────────────────────────────────────
    if (action === 'generate') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { model, imageUrl, prompt, ratio, negPrompt, strength, quantity } = req.body;
      if (!model || !prompt || !imageUrl) return res.status(400).json({ error: 'model, prompt, imageUrl diperlukan.' });

      const qty = Math.min(Math.max(parseInt(quantity) || 1, 1), 4);

      // ── Flux Kontext (endpoint berbeda) ──
      if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
        const r = await fetch('https://api.kie.ai/api/v1/flux/kontext/generate', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt, model,
            aspectRatio: ratio || '1:1',
            outputFormat: 'jpeg',
            promptUpsampling: false,
            safetyTolerance: 2,
            imageUrl,
          }),
        });
        const d = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: 'Flux error: ' + JSON.stringify(d) });
        const taskId = d.data?.taskId || d.data?.id;
        if (!taskId) return res.status(500).json({ error: 'taskId tidak ada: ' + JSON.stringify(d) });
        return res.status(200).json({ taskId, type: 'flux' });
      }

      // ── Semua model lain pakai /jobs/createTask ──
      let input = { prompt, aspect_ratio: ratio || '1:1' };

      // GPT Image 1.5 — model ID: gpt-image/1.5-image-to-image, field: input_urls
      if (model === 'gpt-image/1.5-image-to-image') {
        input.input_urls = [imageUrl];
        input.quality    = 'medium';
      }
      // Nano Banana 1 — model ID: google/nano-banana, field: image_input + image_size
      else if (model === 'google/nano-banana') {
        input.image_input  = [imageUrl];
        input.image_size   = ratio || '1:1';
        input.output_format = 'png';
        delete input.aspect_ratio;
      }
      // Nano Banana 2 — model ID: nano-banana-2, field: image_input + aspect_ratio + resolution
      else if (model === 'nano-banana-2') {
        input.image_input   = [imageUrl];
        input.resolution    = '1K';
        input.output_format = 'png';
      }
      // Qwen
      else if (model === 'qwen/image-to-image') {
        input.image_url             = imageUrl;
        input.strength              = typeof strength === 'number' ? strength : 0.8;
        input.negative_prompt       = negPrompt || 'blurry, ugly, low quality';
        input.num_inference_steps   = 30;
        input.guidance_scale        = 2.5;
        input.enable_safety_checker = true;
        input.output_format         = 'png';
      }
      // Grok Imagine
      else if (model === 'grok-imagine/image-to-image') {
        input.image_urls   = [imageUrl];
        input.quality_mode = true;
        delete input.aspect_ratio;
      }
      else {
        input.image_url     = imageUrl;
        input.output_format = 'png';
      }

      // Generate qty tasks secara paralel
      const tasks = await Promise.all(
        Array.from({ length: qty }, () =>
          fetch('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, input }),
          }).then(r => r.json())
        )
      );

      const taskIds = tasks.map(d => d.data?.taskId).filter(Boolean);
      if (!taskIds.length) return res.status(500).json({ error: 'Semua task gagal: ' + JSON.stringify(tasks) });
      return res.status(200).json({ taskIds, type: 'jobs' });
    }

    // ── STATUS ───────────────────────────────────────────────
    if (action === 'status') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const { taskId, type } = req.query;
      if (!taskId) return res.status(400).json({ error: 'taskId diperlukan.' });

      let kieUrl;
      if (type === 'flux') {
        kieUrl = `https://api.kie.ai/api/v1/flux/kontext/detail?taskId=${taskId}`;
      } else {
        kieUrl = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;
      }

      const r = await fetch(kieUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: 'Status error: ' + JSON.stringify(d) });

      const data   = d.data;
      const status = data?.state || data?.status || 'waiting';
      const DONE   = ['success', 'SUCCESS', 'completed', 'COMPLETED'];
      const FAIL   = ['fail', 'FAIL', 'failed', 'FAILED', 'error', 'ERROR'];

      let imageUrl = null;
      if (DONE.includes(status)) {
        // Market models: resultJson string
        if (data?.resultJson) {
          try {
            const result = JSON.parse(data.resultJson);
            imageUrl = result?.resultUrls?.[0] || result?.images?.[0] || result?.image_url || null;
          } catch(e) {}
        }
        // Flux Kontext fallback
        if (!imageUrl) {
          const tries = [data?.output?.image_url, data?.output?.url, data?.output?.images?.[0], data?.imageUrl, data?.image_url, data?.url];
          imageUrl = tries.find(c => typeof c === 'string' && c.startsWith('http')) || null;
        }
      }

      return res.status(200).json({ status, imageUrl, isFail: FAIL.includes(status) });
    }

    return res.status(400).json({ error: 'Action tidak dikenal: ' + action });

  } catch (err) {
    console.error('[proxy]', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
};
