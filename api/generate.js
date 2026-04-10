// api/generate.js — CommonJS, Vercel Serverless Function

module.exports = async function handler(req, res) {
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
    const { model, imageUrl, prompt, ratio, negPrompt, strength } = req.body;

    if (!model)    return res.status(400).json({ error: 'model diperlukan.' });
    if (!prompt)   return res.status(400).json({ error: 'prompt diperlukan.' });
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl diperlukan.' });

    let kieUrl, kieBody;

    // Flux Kontext
    if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
      kieUrl  = 'https://api.kie.ai/api/v1/flux/kontext/generate';
      kieBody = {
        prompt, model,
        aspectRatio: ratio || '1:1',
        outputFormat: 'jpeg',
        promptUpsampling: false,
        safetyTolerance: 2,
        imageUrl,
      };
    }

    // GPT Image 1.5
    else if (model === 'gpt-image/1-5-image-to-image') {
      const sizeMap = { '1:1': '1024x1024', '16:9': '1792x1024', '9:16': '1024x1792' };
      kieUrl  = 'https://api.kie.ai/api/v1/4o-image/generate';
      kieBody = {
        prompt,
        size: sizeMap[ratio] || '1024x1024',
        quality: 'high',
        nVariants: 1,
        image_url: imageUrl,
      };
    }

    // Generic: Qwen, Grok, Nano Banana
    else {
      kieUrl = 'https://api.kie.ai/api/v1/jobs/createTask';
      const input = {
        prompt,
        image_url: imageUrl,
        aspect_ratio: ratio || '1:1',
        output_format: 'png',
      };

      if (model === 'qwen/image-to-image') {
        input.strength             = typeof strength === 'number' ? strength : 0.8;
        input.negative_prompt      = negPrompt || 'blurry, ugly, low quality';
        input.num_inference_steps  = 30;
        input.guidance_scale       = 2.5;
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
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(kieBody),
    });

    const data = await kieRes.json();

    if (!kieRes.ok) {
      return res.status(kieRes.status).json({ error: data.msg || 'Request ke kie.ai gagal.' });
    }

    const taskId = data.data?.taskId || data.data?.id || data.data?.recordId;
    return res.status(200).json({ taskId });

  } catch (err) {
    console.error('[generate error]', err);
    return res.status(500).json({ error: err.message });
  }
};
