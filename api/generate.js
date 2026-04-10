// api/generate.js
// Proxy untuk membuat generate task ke kie.ai
// API key aman di server, tidak terekspos ke browser

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key belum dikonfigurasi di server.' });
  }

  try {
    const { model, imageUrl, prompt, ratio, negPrompt, strength } = req.body;
    if (!model || !prompt || !imageUrl) {
      return res.status(400).json({ error: 'model, prompt, dan imageUrl diperlukan.' });
    }

    let kieUrl, kieBody;

    // ---- Flux Kontext ----
    if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
      kieUrl  = 'https://api.kie.ai/api/v1/flux/kontext/generate';
      kieBody = { prompt, model, aspectRatio: ratio || '1:1', outputFormat: 'jpeg', promptUpsampling: false, safetyTolerance: 2, imageUrl };
    }

    // ---- GPT Image 1.5 ----
    else if (model === 'gpt-image/1-5-image-to-image') {
      const sizeMap = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };
      kieUrl  = 'https://api.kie.ai/api/v1/4o-image/generate';
      kieBody = { prompt, size: sizeMap[ratio] || '1024x1024', quality: 'high', nVariants: 1, image_url: imageUrl };
    }

    // ---- Generic /jobs/createTask (Qwen, Grok, Nano Banana) ----
    else {
      kieUrl = 'https://api.kie.ai/api/v1/jobs/createTask';
      const input = { prompt, image_url: imageUrl, aspect_ratio: ratio || '1:1', output_format: 'png' };

      if (model === 'qwen/image-to-image') {
        Object.assign(input, {
          strength: strength ?? 0.8,
          negative_prompt: negPrompt || 'blurry, ugly, low quality',
          num_inference_steps: 30,
          guidance_scale: 2.5,
          enable_safety_checker: true,
        });
      }

      if (model.startsWith('nano-banana')) {
        delete input.image_url;
        input.image_input = [imageUrl];
        input.resolution   = '1K';
      }

      if (model === 'grok-imagine/image-to-image') {
        delete input.image_url;
        delete input.aspect_ratio;
        input.image_urls   = [imageUrl];
        input.quality_mode = true;
      }

      kieBody = { model, input };
    }

    const kieRes  = await fetch(kieUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(kieBody),
    });

    const data = await kieRes.json();

    if (!kieRes.ok) {
      return res.status(kieRes.status).json({ error: data.msg || 'Request ke kie.ai gagal.' });
    }

    // Normalize taskId dari berbagai response shape
    const taskId = data.data?.taskId || data.data?.id || data.data?.recordId;
    return res.status(200).json({ taskId, model });

  } catch (err) {
    console.error('[generate]', err);
    return res.status(500).json({ error: err.message });
  }
}
