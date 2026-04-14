module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY_IMAGE  = process.env.KIE_API_KEY_IMAGE;
  const KEY_VIDEO  = process.env.KIE_API_KEY_VIDEO;
  const KEY_SPEECH = process.env.KIE_API_KEY_SPEECH;
  const SUPA_URL   = process.env.SUPABASE_URL;
  const SUPA_ANON  = process.env.SUPABASE_ANON_KEY;
  const SUPA_SVC   = process.env.SUPABASE_SERVICE_KEY;

  function getKey(type) {
    if (type === 'video')  return KEY_VIDEO  || KEY_IMAGE || KEY_SPEECH;
    if (type === 'speech') return KEY_SPEECH || KEY_IMAGE || KEY_VIDEO;
    return KEY_IMAGE || KEY_VIDEO || KEY_SPEECH;
  }

  const action = req.query.action;

  // ── Helpers ──────────────────────────────────────────────
  async function getUser(token) {
    if (!token || !SUPA_URL) return null;
    try {
      const r = await fetch(`${SUPA_URL}/auth/v1/user`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPA_ANON }
      });
      if (!r.ok) return null;
      return await r.json();
    } catch(e) { return null; }
  }

  async function getProfile(userId) {
    try {
      const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
        headers: { 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC }
      });
      const d = await r.json();
      return Array.isArray(d) ? d[0] : null;
    } catch(e) { return null; }
  }

  async function getUserAndProfile(token) {
    const user = await getUser(token);
    if (!user) return { user: null, profile: null };
    const profile = await getProfile(user.id);
    return { user, profile };
  }

  async function uploadToStorage(userId, imageUrl, filename) {
    if (!SUPA_URL || !SUPA_SVC) return null;
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) return null;
      const buf = await imgRes.arrayBuffer();
      const path = `${userId}/${filename}`;
      const r = await fetch(`${SUPA_URL}/storage/v1/object/adgen-results/${path}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC, 'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg', 'x-upsert': 'true' },
        body: buf,
      });
      if (!r.ok) return null;
      return `${SUPA_URL}/storage/v1/object/public/adgen-results/${path}`;
    } catch(e) { return null; }
  }

  try {

    // ── REGISTER ─────────────────────────────────────────
    if (action === 'register') {
      if (req.method !== 'POST') return res.status(405).end();
      const { email, password } = req.body;
      const username = email.replace('@adgen.local', '');

      // Cek username sudah ada
      const checkR = await fetch(`${SUPA_URL}/rest/v1/profiles?username=eq.${username}&select=id`, {
        headers: { 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC }
      });
      const checkD = await checkR.json();
      if (Array.isArray(checkD) && checkD.length > 0) {
        return res.status(400).json({ error: 'Username sudah dipakai.' });
      }

      // Daftar ke Supabase Auth
      const r = await fetch(`${SUPA_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(400).json({ error: d.error_description || d.msg || 'Register gagal.' });

      const userId = d.user?.id || d.id;
      if (!userId) return res.status(400).json({ error: 'Register gagal.' });

      // Buat profile dengan status pending
      await fetch(`${SUPA_URL}/rest/v1/profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC },
        body: JSON.stringify({ id: userId, username, status: 'pending', is_admin: false }),
      });

      return res.status(200).json({ message: 'Daftar berhasil. Tunggu persetujuan admin.' });
    }

    // ── LOGIN ─────────────────────────────────────────────
    if (action === 'login') {
      if (req.method !== 'POST') return res.status(405).end();
      const { email, password } = req.body;

      const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPA_ANON },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(400).json({ error: 'Username atau password salah.' });

      // Cek status approval
      const profile = await getProfile(d.user.id);
      if (!profile) return res.status(403).json({ error: 'Akun tidak ditemukan.' });
      if (profile.status === 'pending')  return res.status(403).json({ error: 'Akun belum disetujui admin. Silakan tunggu.' });
      if (profile.status === 'rejected') return res.status(403).json({ error: 'Akun ditolak. Hubungi admin.' });

      return res.status(200).json({ access_token: d.access_token, user: d.user, profile });
    }

    // ── GET ME ────────────────────────────────────────────
    if (action === 'me') {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { user, profile } = await getUserAndProfile(token);
      if (!user) return res.status(401).json({ error: 'Tidak terautentikasi.' });
      if (!profile || profile.status !== 'approved') return res.status(403).json({ error: 'Akun belum disetujui.' });
      return res.status(200).json({ user, profile });
    }

    // ── ADMIN: GET USERS ──────────────────────────────────
    if (action === 'adminUsers') {
      if (req.method !== 'GET') return res.status(405).end();
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { profile } = await getUserAndProfile(token);
      if (!profile || !profile.is_admin) return res.status(403).json({ error: 'Bukan admin.' });

      const status = req.query.status || 'pending';
      const r = await fetch(`${SUPA_URL}/rest/v1/profiles?status=eq.${status}&order=created_at.desc&select=*`, {
        headers: { 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC }
      });
      const d = await r.json();
      return res.status(200).json({ users: d });
    }

    // ── ADMIN: APPROVE/REJECT USER ────────────────────────
    if (action === 'adminAction') {
      if (req.method !== 'POST') return res.status(405).end();
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { profile: adminProfile } = await getUserAndProfile(token);
      if (!adminProfile || !adminProfile.is_admin) return res.status(403).json({ error: 'Bukan admin.' });

      const { userId, act } = req.body; // act: 'approve' | 'reject'
      if (!userId || !['approve','reject'].includes(act)) return res.status(400).json({ error: 'Parameter salah.' });

      const newStatus = act === 'approve' ? 'approved' : 'rejected';
      const r = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC },
        body: JSON.stringify({ status: newStatus, approved_at: new Date().toISOString() }),
      });
      if (!r.ok) return res.status(500).json({ error: 'Gagal update status.' });
      return res.status(200).json({ ok: true, status: newStatus });
    }

    // ── ADMIN: ALL HISTORIES ──────────────────────────────
    if (action === 'adminHistories') {
      if (req.method !== 'GET') return res.status(405).end();
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { profile } = await getUserAndProfile(token);
      if (!profile || !profile.is_admin) return res.status(403).json({ error: 'Bukan admin.' });

      const r = await fetch(`${SUPA_URL}/rest/v1/histories?order=created_at.desc&limit=50`, {
        headers: { 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC }
      });
      const d = await r.json();
      return res.status(200).json({ histories: d });
    }

    // ── HISTORY: GET ──────────────────────────────────────
    if (action === 'history' && req.method === 'GET') {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { user, profile } = await getUserAndProfile(token);
      if (!user || !profile || profile.status !== 'approved') return res.status(401).json({ error: 'Login dulu.' });
      const page = parseInt(req.query.page || '1'), limit = 20, offset = (page-1)*limit;
      const r = await fetch(`${SUPA_URL}/rest/v1/histories?user_id=eq.${user.id}&order=created_at.desc&limit=${limit}&offset=${offset}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPA_ANON }
      });
      return res.status(200).json({ histories: await r.json(), page });
    }

    // ── HISTORY: DELETE ───────────────────────────────────
    if (action === 'historyDelete' && req.method === 'DELETE') {
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { user } = await getUserAndProfile(token);
      if (!user) return res.status(401).json({ error: 'Login dulu.' });
      const { id } = req.query;
      await fetch(`${SUPA_URL}/rest/v1/histories?id=eq.${id}&user_id=eq.${user.id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPA_ANON }
      });
      return res.status(200).json({ ok: true });
    }

    // ── SAVE RESULT ───────────────────────────────────────
    if (action === 'saveResult') {
      if (req.method !== 'POST') return res.status(405).end();
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { user } = await getUserAndProfile(token);
      if (!user) return res.status(200).json({ ok: false });
      const { type, model, prompt, ratio, resultUrls } = req.body;
      if (!resultUrls?.length) return res.status(400).json({ error: 'resultUrls diperlukan.' });
      const storageUrls = [];
      for (let i = 0; i < resultUrls.length; i++) {
        const ext = resultUrls[i].includes('.mp4')?'mp4':resultUrls[i].includes('.mp3')?'mp3':'jpg';
        const stored = await uploadToStorage(user.id, resultUrls[i], `${type}_${Date.now()}_${i}.${ext}`);
        if (stored) storageUrls.push(stored);
      }
      await fetch(`${SUPA_URL}/rest/v1/histories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC },
        body: JSON.stringify({ user_id: user.id, type, model, prompt, ratio, result_urls: resultUrls, storage_urls: storageUrls.length ? storageUrls : resultUrls }),
      });
      return res.status(200).json({ ok: true });
    }

    // ── UPLOAD ────────────────────────────────────────────
    if (action === 'upload') {
      if (req.method !== 'POST') return res.status(405).end();
      const apiKey = getKey('image');
      if (!apiKey) return res.status(500).json({ error: 'API key belum diset.' });
      const { imageBase64 } = req.body;
      const r = await fetch('https://kieai.redpandaai.co/api/file-base64-upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data: imageBase64, uploadPath: 'images' }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: 'Upload error.' });
      const url = d.data?.downloadUrl || d.data?.fileUrl || d.data?.url;
      if (!url) return res.status(500).json({ error: 'URL tidak ditemukan.' });
      return res.status(200).json({ url });
    }

    // ── GENERATE ─────────────────────────────────────────
    if (action === 'generate') {
      if (req.method !== 'POST') return res.status(405).end();
      const body = req.body, { type } = body;

      if (type === 'speech') {
        const apiKey = getKey('speech');
        const { text, model, voice, speed, stability } = body;
        const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: model||'elevenlabs/text-to-speech-multilingual-v2', input: { text, voice: voice||'Rachel', stability: stability||0.5, similarity_boost: 0.75, style: 0, speed: speed||1.0, timestamps: false, language_code: '' } }),
        });
        const d = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: 'TTS error: '+JSON.stringify(d) });
        const taskId = d.data?.taskId || d.data?.task_id || d.taskId || d.task_id || d.data?.id || d.id;
        if (!taskId) return res.status(500).json({ error: 'taskId tidak ada. Response: '+JSON.stringify(d).slice(0,200) });
        return res.status(200).json({ taskId, taskType: 'jobs' });
      }

      if (type === 'video') {
        const apiKey = getKey('video');
        const { model, imageUrl, prompt, duration, resolution } = body;
        let input = { prompt, image_urls: [imageUrl], duration: String(duration||'5') };
        if (model === 'kling-2.6/image-to-video') input.sound = false;
        else if (model === 'grok-imagine/image-to-video') { input.mode='normal'; input.resolution=resolution||'720p'; input.aspect_ratio='16:9'; }
        else if (model.startsWith('wan')) input.resolution = resolution||'720p';
        const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, input }),
        });
        const d = await r.json();
        if (!r.ok) return res.status(r.status).json({ error: 'Video error: '+JSON.stringify(d) });
        const taskId = d.data?.taskId;
        if (!taskId) return res.status(500).json({ error: 'taskId tidak ada.' });
        return res.status(200).json({ taskId, taskType: 'jobs' });
      }

      // Image
      const apiKey = getKey('image');
      const { model, imageUrl, secondImageUrl, prompt, ratio, negPrompt, strength, quantity } = body;
      const qty = Math.min(Math.max(parseInt(quantity)||1,1),20);
      const ratioVal = ratio||'1:1';
      const nanaSizeMap = { '1:1':'square_hd','9:16':'portrait','16:9':'landscape','4:5':'portrait','2:3':'portrait','3:2':'landscape' };

      let input = { prompt };
      if (model === 'gpt-image/1.5-image-to-image') {
        // GPT Image support multiple input_urls - kirim referensi + produk
        input.input_urls = secondImageUrl ? [imageUrl, secondImageUrl] : [imageUrl];
        input.aspect_ratio = ratioVal; input.quality = 'medium';
      }
      else if (model === 'google/nano-banana') { input.image_input=[imageUrl]; input.image_size=nanaSizeMap[ratioVal]||'square_hd'; input.output_format='png'; }
      else if (model === 'nano-banana-2') { input.image_input=[imageUrl]; input.aspect_ratio=ratioVal; input.resolution='1K'; input.output_format='png'; }
      else if (model === 'grok-imagine/image-to-image') { input.image_urls=[imageUrl]; input.quality_mode=true; }
      else { input.image_url=imageUrl; input.aspect_ratio=ratioVal; input.output_format='png'; }

      const tasks = await Promise.all(Array.from({length:qty},()=>
        fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method:'POST', headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},
          body: JSON.stringify({model,input}),
        }).then(r=>r.json())
      ));
      const taskIds = tasks.map(d=>d.data?.taskId).filter(Boolean);
      if (!taskIds.length) return res.status(500).json({ error: 'Semua task gagal.' });
      return res.status(200).json({ taskIds, taskType: 'jobs' });
    }

    // ── STATUS ────────────────────────────────────────────
    if (action === 'status') {
      if (req.method !== 'GET') return res.status(405).end();
      const { taskId, type } = req.query;
      const apiKey = getKey(type==='video'?'video':type==='speech'?'speech':'image');
      const r = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (!r.ok) return res.status(r.status).json({ error: 'Status error.' });
      const d = await r.json();
      const data = d.data;
      const status = data?.state || data?.status || 'waiting';
      const DONE = ['success','SUCCESS','completed','COMPLETED'];
      const FAIL = ['fail','FAIL','failed','FAILED','error','ERROR'];
      let imageUrl=null, videoUrl=null, audioUrl=null, imageUrls=[];
      if (DONE.includes(status)) {
        if (data?.resultJson) {
          try {
            const result = JSON.parse(data.resultJson);
            const allUrls = result?.resultUrls || result?.images || [];
            if (allUrls.length > 0) {
              const firstUrl = allUrls[0];
              if (firstUrl.includes('.mp4')||firstUrl.includes('.webm')) videoUrl=firstUrl;
              else if (firstUrl.includes('.mp3')||firstUrl.includes('.wav')||firstUrl.includes('.ogg')) audioUrl=firstUrl;
              else { imageUrls=allUrls; imageUrl=firstUrl; }
            } else {
              const singleAudio = result?.audio_url||result?.audioUrl||null;
              if (singleAudio) { audioUrl=singleAudio; }
              else {
                const singleUrl = result?.image_url||result?.url||null;
                if (singleUrl) { if(singleUrl.includes('.mp4')) videoUrl=singleUrl; else { imageUrl=singleUrl; imageUrls=[singleUrl]; } }
              }
            }
          } catch(e) {}
        }
        if (!imageUrl && !videoUrl && !audioUrl) {
          const audioTries = [data?.output?.audio_url, data?.output?.audioUrl, data?.audio_url, data?.audioUrl];
          const foundAudio = audioTries.find(c=>typeof c==='string'&&c.startsWith('http'));
          if (foundAudio) { audioUrl=foundAudio; }
          else {
            const tries = [
              data?.info?.resultImageUrl, data?.resultImageUrl, data?.result_image_url,
              data?.output?.image_url, data?.output?.url,
              data?.output?.images?.[0], data?.imageUrl, data?.image_url, data?.url
            ];
            const found = tries.find(c=>typeof c==='string'&&c.startsWith('http'));
            if (found) { if(found.includes('.mp4')) videoUrl=found; else { imageUrl=found; imageUrls=[found]; } }
          }
        }
      }
      return res.status(200).json({ status, imageUrl, imageUrls, videoUrl, audioUrl, isFail: FAIL.includes(status) });
    }

    // ── MOTIVATION ───────────────────────────────────────────
    if (action === 'motivation') {
      if (req.method !== 'POST') return res.status(405).end();
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset.' });
      const { mood } = req.body;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 80,
          messages: [{
            role: 'user',
            content: 'Berikan 1 kalimat motivasi baru dan unik (max 12 kata) dalam Bahasa Indonesia untuk seseorang yang merasa ' + (mood||'semangat') + ' saat bekerja sebagai tim kreatif iklan. Langsung tulis kalimatnya saja tanpa tanda kutip atau penjelasan.'
          }]
        })
      });
      const d = await r.json();
      const text = d.content?.[0]?.text || 'Semangat berkarya hari ini!';
      return res.status(200).json({ text: text.trim() });
    }

    // ── ANALYZE VIDEO FRAMES ─────────────────────────────
    if (action === 'analyze') {
      if (req.method !== 'POST') return res.status(405).end();
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset.' });

      const { frames, productInfo } = req.body;
      if (!frames || !frames.length) return res.status(400).json({ error: 'frames diperlukan.' });

      // Build content array with frames as images
      const content = [];
      content.push({
        type: 'text',
        text: `Kamu adalah analis iklan profesional. Analisis frame-frame dari video iklan kompetitor berikut ini.${productInfo ? ' Produk klien kami: ' + productInfo : ''}

Berikan analisis lengkap dalam Bahasa Indonesia dengan format:

## 🎯 Konsep & Pesan Utama
[Apa pesan utama iklan ini]

## 👥 Target Audience
[Siapa target audiencenya dan mengapa]

## 💪 Kekuatan Iklan
[Apa yang dilakukan dengan baik]

## ⚠️ Kelemahan Iklan
[Apa yang bisa diperbaiki]

## 🎨 Style & Visual
[Analisis visual, warna, komposisi, teks]

## 📝 Strategi Copywriting
[Analisis pesan, CTA, emotional appeal]

## 💡 Rekomendasi untuk Mengalahkan Iklan Ini
[Saran konkret untuk buat iklan yang lebih baik]`
      });

      // Add frames as images (max 5 frames)
      const maxFrames = Math.min(frames.length, 5);
      for (let i = 0; i < maxFrames; i++) {
        content.push({
          type: 'text',
          text: `Frame ${i + 1}/${maxFrames}:`
        });
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: frames[i].replace(/^data:image\/[a-z]+;base64,/, '')
          }
        });
      }

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content }]
        })
      });

      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Analisis gagal.' });
      const text = d.content?.[0]?.text || 'Analisis tidak tersedia.';
      return res.status(200).json({ analysis: text });
    }

    // ── COPYWRITING ──────────────────────────────────────────
    if (action === 'copywriting') {
      if (req.method !== 'POST') return res.status(405).end();
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset.' });

      const { imageBase64, productInfo, platform, tone, frameworks } = req.body;
      // productInfo opsional - bisa kosong kalau ada gambar

      const fwList = frameworks && frameworks.length ? frameworks.join(', ') : 'AIDA, PAS';
      const prompt = `Kamu adalah copywriter iklan profesional Indonesia kelas dunia. Buat copywriting iklan yang menjual.

${imageBase64 ? 'Analisis gambar/video yang dilampirkan secara mendalam — produk, keunggulan visual, warna, suasana, target audience yang terlihat — lalu buat copywriting yang sesuai.' : ''}
${productInfo ? 'Info produk tambahan: ' + productInfo : ''}
Platform: ${platform || 'Instagram'}
Tone: ${tone || 'persuasif dan emosional'}
Framework yang digunakan: ${fwList}

Buat copywriting LENGKAP untuk setiap framework yang diminta. Format output:

---

## 📌 FRAMEWORK: [NAMA FRAMEWORK]

**🎯 HEADLINE:**
[headline yang kuat, max 10 kata]

**💬 BODY COPY:**
[body copy lengkap sesuai framework]

**📣 CTA (Call to Action):**
[CTA yang kuat dan spesifik]

**#️⃣ HASHTAG:**
[5-10 hashtag relevan untuk ${platform}]

---

[ulangi untuk setiap framework]

Tulis dalam Bahasa Indonesia yang natural, menjual, dan sesuai dengan kultur lokal. Gunakan kata-kata yang powerful dan emosional.`;

      const msgContent = [];
      if (imageBase64) {
        const mediaType = imageBase64.match(/^data:([^;]+)/)?.[1] || 'image/jpeg';
        const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
        msgContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } });
      }
      msgContent.push({ type: 'text', text: prompt });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 3000, messages: [{ role: 'user', content: msgContent }] })
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Generate gagal.' });
      return res.status(200).json({ copy: d.content?.[0]?.text || '' });
    }

    // ── IMAGE EDIT ────────────────────────────────────────────
    if (action === 'imageedit') {
      if (req.method !== 'POST') return res.status(405).end();
      const apiKey = getKey('image');
      const { imageUrl, prompt, ratio } = req.body;
      if (!imageUrl || !prompt) return res.status(400).json({ error: 'imageUrl dan prompt diperlukan.' });
      const r = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'seedream/4.5-edit',
          input: {
            prompt,
            image_urls: [imageUrl],
            aspect_ratio: ratio || '1:1',
            quality: 'basic',
            max_images: 1
          }
        })
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: 'Image edit error: ' + JSON.stringify(d) });
      const taskId = d.data?.taskId;
      if (!taskId) return res.status(500).json({ error: 'taskId tidak ada.' });
      return res.status(200).json({ taskId, taskType: 'jobs' });
    }

    // ── CEK KUALITAS IKLAN ───────────────────────────────────
    if (action === 'cekiklan') {
      if (req.method !== 'POST') return res.status(405).end();
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset.' });

      const { imageBase64, platform, productInfo } = req.body;
      if (!imageBase64) return res.status(400).json({ error: 'imageBase64 diperlukan.' });

      const mediaType = imageBase64.match(/^data:([^;]+)/)?.[1] || 'image/jpeg';
      const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');

      const prompt = `Kamu adalah pakar iklan digital Indonesia berpengalaman. Analisis gambar iklan ini secara mendalam.
${platform ? 'Platform target: ' + platform : ''}
${productInfo ? 'Info produk: ' + productInfo : ''}

Berikan penilaian dalam format berikut (Bahasa Indonesia):

## 📊 SKOR KESELURUHAN: [X/10]

## ✅ Yang Sudah Bagus
[list kelebihan]

## ⚠️ Yang Perlu Diperbaiki
[list kelemahan spesifik]

## 🎨 Analisis Visual
[warna, layout, tipografi, hierarki visual]

## 📝 Analisis Copywriting
[headline, body copy, CTA - apakah kuat dan menjual?]

## 🎯 Efektivitas untuk ${platform || 'iklan digital'}
[seberapa efektif untuk platform ini]

## 💡 Saran Perbaikan Konkret
[minimal 3 saran spesifik yang bisa langsung diterapkan]

## 🚀 Potensi Performa
[prediksi performa: tinggi/sedang/rendah dan alasannya]`;

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
              { type: 'text', text: prompt }
            ]
          }]
        })
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Analisis gagal.' });
      return res.status(200).json({ analysis: d.content?.[0]?.text || 'Analisis tidak tersedia.' });
    }

    // ── VOICE PREVIEW ─────────────────────────────────────
    if (action === 'preview') {
      const { voiceId } = req.query;
      if (!voiceId) return res.status(400).json({ error: 'voiceId diperlukan.' });
      const urls = [`https://static.aiquickdraw.com/elevenlabs/voice/${voiceId}.mp3`, `https://storage.googleapis.com/eleven-public-prod/premade/voices/${voiceId}/preview.mp3`];
      let audioRes = null;
      for (const url of urls) { try { const r=await fetch(url); if(r.ok){audioRes=r;break;} } catch(e){} }
      if (!audioRes) return res.status(404).json({ error: 'Preview tidak tersedia.' });
      res.setHeader('Content-Type','audio/mpeg');
      res.setHeader('Cache-Control','public, max-age=604800');
      return res.status(200).send(Buffer.from(await audioRes.arrayBuffer()));
    }

    // ── AUDIENCE RECOMMENDER ─────────────────────────────────
    if (action === 'audienceRec') {
      if (req.method !== 'POST') return res.status(405).end();
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset.' });
      const { product } = req.body;
      if (!product) return res.status(400).json({ error: 'Nama produk diperlukan.' });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          messages: [{
            role: 'user',
            content: `Kamu adalah pakar riset pasar dan iklan digital Indonesia. Analisis produk/topik berikut dan berikan rekomendasi audience yang komprehensif.

Produk/Topik: "${product}"

Berikan output dalam format JSON yang valid seperti ini (HANYA JSON, tanpa teks lain):
{
  "audience": [
    { "segment": "nama segmen", "usia": "rentang usia", "gender": "L/P/Semua", "desc": "deskripsi singkat" }
  ],
  "ekosistem": [
    { "kategori": "nama kategori", "items": ["produk1", "produk2", "produk3"] }
  ],
  "painPoints": ["masalah1", "masalah2", "masalah3", "masalah4"],
  "keywords": ["kata kunci1", "kata kunci2", "kata kunci3", "kata kunci4", "kata kunci5"],
  "platform": [
    { "nama": "Instagram", "alasan": "alasan singkat", "format": "format konten terbaik" },
    { "nama": "TikTok", "alasan": "alasan singkat", "format": "format konten terbaik" }
  ],
  "hooks": ["hook iklan 1", "hook iklan 2", "hook iklan 3"]
}

Isi dengan data yang relevan, spesifik, dan actionable untuk tim kreatif iklan Indonesia.`
          }]
        })
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Gagal.' });
      const text = d.content?.[0]?.text || '{}';
      try {
        // Ekstrak JSON dari response meskipun ada teks tambahan
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'Format response tidak valid.' });
        const parsed = JSON.parse(match[0]);
        return res.status(200).json(parsed);
      } catch(e) {
        return res.status(500).json({ error: 'Format response tidak valid: ' + e.message });
      }
    }

    // ── ADMIN: STATISTIK PER USER ─────────────────────────────
    if (action === 'adminStats') {
      if (req.method !== 'GET') return res.status(405).end();
      const token = (req.headers.authorization || '').replace('Bearer ', '');
      const { profile } = await getUserAndProfile(token);
      if (!profile || !profile.is_admin) return res.status(403).json({ error: 'Bukan admin.' });

      const dateParam = req.query.date || new Date().toISOString().split('T')[0];
      const dateStart = dateParam + 'T00:00:00.000Z';
      const dateEnd   = dateParam + 'T23:59:59.999Z';

      const [usersR, histR] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/profiles?status=eq.approved&order=username.asc&select=*`, {
          headers: { 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC }
        }),
        fetch(`${SUPA_URL}/rest/v1/histories?created_at=gte.${dateStart}&created_at=lte.${dateEnd}&select=user_id,type`, {
          headers: { 'Authorization': `Bearer ${SUPA_SVC}`, 'apikey': SUPA_SVC }
        })
      ]);

      const users = await usersR.json();
      const histories = await histR.json();

      const statsMap = {};
      (Array.isArray(histories) ? histories : []).forEach(function(h) {
        if (!statsMap[h.user_id]) statsMap[h.user_id] = { image: 0, speech: 0, clone: 0 };
        if (h.type === 'image') statsMap[h.user_id].image++;
        else if (h.type === 'speech') statsMap[h.user_id].speech++;
        else if (h.type === 'clone') statsMap[h.user_id].clone++;
      });

      const result = (Array.isArray(users) ? users : []).map(function(u) {
        const s = statsMap[u.id] || { image: 0, speech: 0, clone: 0 };
        return { id: u.id, username: u.username, status: u.status, approved_at: u.approved_at, stats: s };
      });

      return res.status(200).json({ users: result, date: dateParam });
    }

    // ── IMAGE PROXY (untuk batch download ZIP) ────────────────
    if (action === 'imgProxy') {
      if (req.method !== 'GET') return res.status(405).end();
      const { url } = req.query;
      if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'URL tidak valid.' });
      const r = await fetch(url);
      if (!r.ok) return res.status(502).json({ error: 'Gagal fetch gambar.' });
      const contentType = r.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(Buffer.from(await r.arrayBuffer()));
    }

    return res.status(400).json({ error: 'Action tidak dikenal: '+action });

  } catch(err) {
    console.error('[proxy]', err);
    return res.status(500).json({ error: err.message });
  }
};

module.exports.config = { api: { bodyParser: { sizeLimit: '15mb' } } };
