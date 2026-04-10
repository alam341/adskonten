module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // API key terpisah per fitur — fallback ke KIE_API_KEY jika yang spesifik tidak diset
  const KEY_IMAGE  = process.env.KIE_API_KEY_IMAGE  || process.env.KIE_API_KEY;
  const KEY_VIDEO  = process.env.KIE_API_KEY_VIDEO  || process.env.KIE_API_KEY;
  const KEY_SPEECH = process.env.KIE_API_KEY_SPEECH || process.env.KIE_API_KEY;

  if (!KEY_IMAGE && !KEY_VIDEO && !KEY_SPEECH) {
    return res.status(500).json({ error: 'Tidak ada API key. Set KIE_API_KEY_IMAGE/VIDEO/SPEECH di Vercel.' });
  }

  function getKey(type) {
    if (type === 'video')  return KEY_VIDEO  || KEY_IMAGE;
    if (type === 'speech') return KEY_SPEECH || KEY_IMAGE;
    return KEY_IMAGE;
  }

  const action = req.query.action;

  try {

    // ── UPLOAD ───────────────────────────────────────────
    if (action === 'upload') {
      if (req.method !== 'POST') return res.status(405).end();
      const { imageBase64 } = req.body;
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 diperlukan.' });

      const r = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getKey('image')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: imageBase64, uploadPath: 'images' }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: 'Upload error: ' + JSON.stringify(d) });
      const url = d.data?.downloadUrl || d.data?.fileUrl || d.data?.url;
      if (!url) return res.status(500).json({ error: 'URL tidak ditemukan: ' + JSON.stringify(d) });
      return res.status(200).json({ url });
    }

    // ── GENERATE ─────────────────────────────────────────
    if (action === 'generate') {
      if (req.method !== 'POST') return res.status(405).end();
      const body = req.body;
      const { type } = body;

      // === TEXT TO SPEECH (ElevenLabs) ===
      if (type === 'speech') {
        const { text, model, voice, speed, stability, languageCode } = body;
        if (!text) return res.status(400).json({ error: 'text diperlukan.' });

        const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getKey('speech')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model || 'elevenlabs/text-to-speech-turbo-2-5',
            input: {
              text,
              voice:            voice || 'Rachel',
              stability:        typeof stability === 'number' ? stability : 0.5,
              similarity_boost: 0.75,
              style:            0,
              speed:            typeof speed === 'number' ? speed : 1.0,
              timestamps:       false,
              language_code:    languageCode || '',
            },
          }),
        });
        const d = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: 'TTS error: ' + JSON.stringify(d) });
        const taskId = d.data?.taskId;
        if (!taskId) return res.status(500).json({ error: 'taskId tidak ada: ' + JSON.stringify(d) });
        return res.status(200).json({ taskId });
      }

      // === VIDEO ===
      if (type === 'video') {
        const { model, imageUrl, prompt, duration, resolution } = body;
        let input = { prompt, image_urls: [imageUrl], duration: String(duration || '5') };

        if (model === 'kling-2.6/image-to-video') {
          input.sound = false;
        } else if (model === 'grok-imagine/image-to-video') {
          input.mode       = 'normal';
          input.resolution = resolution || '720p';
          input.aspect_ratio = '16:9';
        } else if (model === 'wan-2.6/image-to-video' || model.startsWith('wan')) {
          input.resolution = resolution || '720p';
        }

        const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getKey('video')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input }),
        });
        const d = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: 'Video error: ' + JSON.stringify(d) });
        const taskId = d.data?.taskId;
        if (!taskId) return res.status(500).json({ error: 'taskId tidak ada: ' + JSON.stringify(d) });
        return res.status(200).json({ taskId, taskType: 'jobs' });
      }

      // === IMAGE ===
      const { model, imageUrl, prompt, ratio, negPrompt, strength, quantity } = body;
      if (!model || !prompt || !imageUrl) return res.status(400).json({ error: 'model, prompt, imageUrl diperlukan.' });
      const qty = Math.min(Math.max(parseInt(quantity) || 1, 1), 20);

      // Flux Kontext (endpoint berbeda)
      if (model === 'flux-kontext-pro' || model === 'flux-kontext-max') {
        const r = await fetch('https://api.kie.ai/api/v1/flux/kontext/generate', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getKey('image')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model, aspectRatio: ratio || '1:1', outputFormat: 'jpeg', promptUpsampling: false, safetyTolerance: 2, imageUrl }),
        });
        const d = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: 'Flux error: ' + JSON.stringify(d) });
        const taskId = d.data?.taskId || d.data?.id;
        if (!taskId) return res.status(500).json({ error: 'taskId tidak ada: ' + JSON.stringify(d) });
        return res.status(200).json({ taskIds: [taskId], taskType: 'flux' });
      }

      // Semua model lain
      let input = { prompt, aspect_ratio: ratio || '1:1' };
      if (model === 'gpt-image/1.5-image-to-image') {
        input.input_urls = [imageUrl]; input.quality = 'medium';
      } else if (model === 'qwen/image-to-image') {
        input.image_url = imageUrl;
        input.strength = typeof strength === 'number' ? strength : 0.8;
        input.negative_prompt = negPrompt || 'blurry, ugly, low quality';
        input.num_inference_steps = 30; input.guidance_scale = 2.5;
        input.enable_safety_checker = true; input.output_format = 'png';
      } else if (model === 'google/nano-banana') {
        input.image_input = [imageUrl]; input.image_size = ratio || '1:1'; input.output_format = 'png'; delete input.aspect_ratio;
      } else if (model === 'nano-banana-2') {
        input.image_input = [imageUrl]; input.resolution = '1K'; input.output_format = 'png';
      } else if (model === 'grok-imagine/image-to-image') {
        input.image_urls = [imageUrl]; input.quality_mode = true; delete input.aspect_ratio;
      } else {
        input.image_url = imageUrl; input.output_format = 'png';
      }

      const tasks = await Promise.all(Array.from({ length: qty }, () =>
        fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getKey('image')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input }),
        }).then(r => r.json())
      ));

      const taskIds = tasks.map(d => d.data?.taskId).filter(Boolean);
      if (!taskIds.length) return res.status(500).json({ error: 'Semua task gagal: ' + JSON.stringify(tasks[0]) });
      return res.status(200).json({ taskIds, taskType: 'jobs' });
    }

    // ── STATUS (image/video) ──────────────────────────────
    if (action === 'status') {
      if (req.method !== 'GET') return res.status(405).end();
      const { taskId, type } = req.query;
      if (!taskId) return res.status(400).json({ error: 'taskId diperlukan.' });

      const kieUrl = type === 'flux'
        ? `https://api.kie.ai/api/v1/flux/kontext/detail?taskId=${taskId}`
        : `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;

      // Gunakan key sesuai type task
      const statusKey = (type === 'flux') ? getKey('image') : (req.query.taskType === 'video' ? getKey('video') : KEY_IMAGE || KEY_VIDEO || KEY_SPEECH);
      const r = await fetch(kieUrl, { headers: { 'Authorization': `Bearer ${statusKey}` } });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: 'Status error: ' + JSON.stringify(d) });

      const data   = d.data;
      const status = data?.state || data?.status || 'waiting';
      const DONE   = ['success','SUCCESS','completed','COMPLETED'];
      const FAIL   = ['fail','FAIL','failed','FAILED','error','ERROR'];

      let imageUrl = null, videoUrl = null;
      if (DONE.includes(status)) {
        if (data?.resultJson) {
          try {
            const result = JSON.parse(data.resultJson);
            const firstUrl = result?.resultUrls?.[0] || result?.images?.[0] || result?.image_url || result?.audio_url || result?.url || null;
            if (firstUrl) {
              if (firstUrl.includes('.mp4') || firstUrl.includes('.webm')) videoUrl = firstUrl;
              else if (firstUrl.includes('.mp3') || firstUrl.includes('.wav') || firstUrl.includes('.ogg') || firstUrl.includes('audio')) imageUrl = firstUrl;
              else imageUrl = firstUrl;
            }
          } catch(e) {}
        }
        if (!imageUrl && !videoUrl) {
          const tries = [data?.output?.image_url, data?.output?.url, data?.output?.images?.[0], data?.imageUrl, data?.image_url, data?.url];
          const found = tries.find(c => typeof c === 'string' && c.startsWith('http'));
          if (found) {
            if (found.includes('.mp4') || found.includes('.webm')) videoUrl = found;
            else imageUrl = found;
          }
        }
      }

      return res.status(200).json({ status, imageUrl, videoUrl, isFail: FAIL.includes(status) });
    }



    // ── VOICE PREVIEW ─────────────────────────────────────
    if (action === 'preview') {
      if (req.method !== 'GET') return res.status(405).end();
      const { voiceId } = req.query;
      if (!voiceId) return res.status(400).json({ error: 'voiceId diperlukan.' });

      const previewUrl = `https://static.aiquickdraw.com/elevenlabs/voice/${voiceId}.mp3`;
      const audioRes = await fetch(previewUrl);
      if (!audioRes.ok) return res.status(404).json({ error: 'Preview tidak tersedia.' });

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=604800');
      const buf = await audioRes.arrayBuffer();
      return res.status(200).send(Buffer.from(buf));
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
