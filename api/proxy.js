module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'KIE_API_KEY belum diset di Vercel Environment Variables.' });
  }

  const action = req.query.action;

  try {
    // ============================================
    // ACTION: upload
    // ============================================
    if (action === 'upload') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 diperlukan.' });

      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
      const binaryData = Buffer.from(base64Data, 'base64');
      const type       = mimeType || 'image/jpeg';
      const ext        = type.split('/')[1] || 'jpg';

      const boundary = 'AdGenBoundary' + Date.now();
      const header   = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.${ext}"\r\nContent-Type: ${type}\r\n\r\n`
      );
      const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
      const body   = Buffer.concat([header, binaryData, footer]);

      const kieRes = await fetch('https://api.kie.ai/api/v1/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });

      const data = await kieRes.json();
      if (!kieRes.ok) return res.status(kieRes.status).json({ error: data.msg || 'Upload gagal.' });
      return res.status(200).json({ url: data.data?.url });
    }

    // ============================================
    // ACTION: generate
    // ============================================
    if (action === 'generate') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

      const { model, imageUrl, prompt, ratio, negPrompt, strength } = req.body;
      if (!model || !prompt || !imageUrl) {
        return res.status(400).json({ error: 'model, prompt, imageUrl diperlukan.' });
      }

      let kieUrl, kieBody;

      if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
        kieUrl  = 'https://api.kie.ai/api/v1/flux/kontext/generate';
        kieBody = { prompt, model, aspectRatio: ratio || '1:1', outputFormat: 'jpeg', promptUpsampling: false, safetyTolerance: 2, imageUrl };
      }
      else if (model === 'gpt-image/1-5-image-to-image') {
        const sizeMap = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };
        kieUrl  = 'https://api.kie.ai/api/v1/4o-image/generate';
        kieBody = { prompt, size: sizeMap[ratio] || '1024x1024', quality: 'high', nVariants: 1, image_url: imageUrl };
      }
      else {
        kieUrl = 'https://api.kie.ai/api/v1/jobs/createTask';
        const input = { prompt, image_url: imageUrl, aspect_ratio: ratio || '1:1', output_format: 'png' };

        if (model === 'qwen/image-to-image') {
          input.strength              = typeof strength === 'number' ? strength : 0.8;
          input.negative_prompt       = negPrompt || 'blurry, ugly, low quality';
          input.num_inference_steps   = 30;
          input.guidance_scale        = 2.5;
          input.enable_safety_checker = true;
        }
        if (model.startsWith('nano-banana')) {
          delete input.image_url;
          input.image_input = [imageUrl];
          input.resolution  = '1K';
        }
        if (model === 'grok-imagine/image-to-image') {
          delete input.image_url;
          delete input.aspect_ratio;
          input.image_urls   = [imageUrl];
          input.quality_mode = true;
        }

        kieBody = { model, input };
      }

      const kieRes = await fetch(kieUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(kieBody),
      });

      const data = await kieRes.json();
      if (!kieRes.ok) return res.status(kieRes.status).json({ error: data.msg || 'Generate gagal.' });

      const taskId = data.data?.taskId || data.data?.id || data.data?.recordId;
      return res.status(200).json({ taskId });
    }

    // ============================================
    // ACTION: status
    // ============================================
    if (action === 'status') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

      const { taskId, model } = req.query;
      if (!taskId || !model) return res.status(400).json({ error: 'taskId dan model diperlukan.' });

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
      if (!kieRes.ok) return res.status(kieRes.status).json({ error: data.msg || 'Status check gagal.' });

      const d      = data.data;
      const status = d?.status || d?.state || 'PENDING';

      let imageUrl = null;
      const DONE = ['SUCCESS', 'success', 'completed', 'COMPLETED'];
      if (DONE.includes(status)) {
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
    }

    // Unknown action
    return res.status(400).json({ error: `Action tidak dikenal: ${action}` });

  } catch (err) {
    console.error('[proxy error]', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
};
