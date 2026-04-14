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
      const DONE = ['success','SUCCESS','completed','COMPLETED'];
      const FAIL = ['fail','FAIL','failed','FAILED','error','ERROR'];
      let data = null;

      // For speech: try dedicated speech endpoint first
      if (type === 'speech') {
        try {
          const sr = await fetch(`https://api.kie.ai/api/v1/speech/jobs/${taskId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
          if (sr.ok) {
            const sd = await sr.json();
            const sdata = sd.data || sd;
            const sstatus = sdata?.state || sdata?.status || 'waiting';
            // Extract audio URL from speech endpoint response
            let audioUrl = sdata?.output?.audio_url || sdata?.output?.audioUrl ||
              sdata?.audio_url || sdata?.audioUrl || sdata?.url ||
              sdata?.result?.audio_url || sdata?.result?.audioUrl;
            // Also try resultJson
            if (!audioUrl && sdata?.resultJson) {
              try {
                const rj = JSON.parse(sdata.resultJson);
                const urls = rj?.resultUrls || rj?.audioUrls || [];
                if (urls.length > 0) audioUrl = urls[0];
                else audioUrl = rj?.audio_url || rj?.audioUrl || rj?.url;
              } catch(e) {}
            }
            // Also try resultUrls array directly
            if (!audioUrl && Array.isArray(sdata?.resultUrls) && sdata.resultUrls.length > 0) {
              audioUrl = sdata.resultUrls[0];
            }
            if (DONE.includes(sstatus) || audioUrl) {
              return res.status(200).json({ status: audioUrl ? 'success' : sstatus, audioUrl: audioUrl||null, imageUrl:null, imageUrls:[], videoUrl:null, isFail: FAIL.includes(sstatus), _raw: sdata });
            }
            if (FAIL.includes(sstatus)) {
              return res.status(200).json({ status: sstatus, audioUrl:null, imageUrl:null, imageUrls:[], videoUrl:null, isFail: true });
            }
            // Not done yet, return waiting status
            return res.status(200).json({ status: sstatus, audioUrl:null, imageUrl:null, imageUrls:[], videoUrl:null, isFail: false });
          }
        } catch(e) {}
      }

      // Default: jobs/recordInfo endpoint (image, video, fallback)
      const r = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (!r.ok) return res.status(r.status).json({ error: 'Status error.' });
      const d = await r.json();
      data = d.data;
      const status = data?.state || data?.status || 'waiting';
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

      const isMeta = platform === 'meta_ads';
      const isGoogle = platform === 'google_ads';

      const fwList = frameworks && frameworks.length ? frameworks.join(', ') : 'AIDA';

      let prompt;
      if (isMeta) {
        prompt = `Kamu adalah copywriter Meta Ads (Facebook & Instagram) terbaik Indonesia.
${imageBase64 ? 'Analisis gambar produk yang dilampirkan.' : ''}
${productInfo ? 'Info produk: ' + productInfo : ''}
Tone: ${tone || 'persuasif dan emosional'}
Framework: ${fwList}

Buat ${frameworks.length} variasi ad copy Meta Ads — satu variasi per framework.
Setiap variasi berisi:
- primaryText: ikuti struktur framework, maks 125 kata, boleh emoji
- headlines: 10 pilihan headline (maks 40 karakter tiap headline) — beragam angle
- descriptions: 4 pilihan description (maks 30 karakter tiap description)
- cta: tombol CTA yang sesuai

Output JSON (HANYA JSON):
{
  "type": "meta",
  "variants": [
    {
      "label": "Variasi [NAMA FRAMEWORK]",
      "primaryText": "...",
      "headlines": [{"text": "...", "chars": 0}],
      "descriptions": [{"text": "...", "chars": 0}],
      "cta": "Shop Now"
    }
  ]
}
Isi "chars" dengan panjang karakter teksnya.`;
      } else if (isGoogle) {
        prompt = `Kamu adalah copywriter Google Ads terbaik Indonesia.
${productInfo ? 'Info produk: ' + productInfo : ''}
Tone: ${tone || 'persuasif dan emosional'}
Framework: ${fwList}

Buat Responsive Search Ad (RSA). Tulis headlines dan descriptions dengan mengikuti prinsip framework ${fwList} — ada yang fokus pada masalah, solusi, bukti, urgensi, sesuai framework.
WAJIB: headline maks 30 karakter, description maks 90 karakter.

Output JSON (HANYA JSON):
{
  "type": "google",
  "headlines": [{"text": "...", "chars": 0}],
  "descriptions": [{"text": "...", "chars": 0}],
  "tips": "tips singkat penggunaan RSA ini"
}
Buat 15 headlines dan 4 descriptions. Isi "chars" dengan panjang karakter teks.`;
      } else {
        return res.status(400).json({ error: 'Platform tidak valid.' });
      }

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
      const rawText = d.content?.[0]?.text || '';
      if (isMeta || isGoogle) {
        try {
          const match = rawText.match(/\{[\s\S]*\}/);
          if (!match) return res.status(500).json({ error: 'Format tidak valid.' });
          return res.status(200).json(JSON.parse(match[0]));
        } catch(e) {
          return res.status(500).json({ error: 'Format tidak valid.' });
        }
      }
      return res.status(200).json({ copy: rawText });
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

    // ── VOICE PREVIEW (submit only, frontend polls) ───────
    if (action === 'preview') {
      if (req.method !== 'POST') return res.status(405).end();
      const { voiceName } = req.body;
      if (!voiceName) return res.status(400).json({ error: 'voiceName diperlukan.' });
      const apiKey = getKey('speech');
      const sampleText = 'Halo! Ini adalah suara saya. Senang berkenalan dengan Anda.';
      const genRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'elevenlabs/text-to-speech-multilingual-v2',
          input: { text: sampleText, voice: voiceName, stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1.0, timestamps: false, language_code: '' }
        }),
      });
      const genData = await genRes.json();
      const taskId = genData.data?.taskId || genData.data?.task_id || genData.taskId || genData.task_id || genData.data?.id || genData.id;
      if (!taskId) return res.status(500).json({ error: 'Gagal membuat preview: '+JSON.stringify(genData).slice(0,200) });
      return res.status(200).json({ taskId });
    }

    // ── AUDIENCE RECOMMENDER ─────────────────────────────────
    if (action === 'audienceRec') {
      if (req.method !== 'POST') return res.status(405).end();
      const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
      const FB_APP_ID = process.env.FB_APP_ID;
      const FB_APP_SECRET = process.env.FB_APP_SECRET;
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY belum diset.' });
      if (!FB_APP_ID || !FB_APP_SECRET) return res.status(500).json({ error: 'FB_APP_ID / FB_APP_SECRET belum diset.' });
      const { product } = req.body;
      if (!product) return res.status(400).json({ error: 'Nama produk diperlukan.' });

      // ── 1. Ambil interest dari Meta — multi-keyword + suggestion ─
      const fbToken = `${FB_APP_ID}|${FB_APP_SECRET}`;

      // Buat variasi search: full phrase + tiap kata (tanpa batas)
      const words = product.split(/\s+/).filter(w => w.length > 2);
      const searchTerms = [product, ...words];

      // Fetch semua search terms sekaligus (parallel) — locale=id_ID supaya nama interest sesuai Ads Manager Indonesia
      const searchFetches = searchTerms.map(term =>
        fetch(`https://graph.facebook.com/v19.0/search?type=adinterest&q=${encodeURIComponent(term)}&limit=500&locale=id_ID&access_token=${fbToken}`)
          .then(r => r.json()).catch(() => ({ data: [] }))
      );
      const searchResults = await Promise.all(searchFetches);

      // Gabungkan + deduplikasi by name (lowercase)
      const seen = new Set();
      let metaInterests = [];
      searchResults.forEach(function(res) {
        if (!res.data) return;
        res.data.forEach(function(item) {
          const key = item.name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            metaInterests.push({
              id: item.id,
              nama: item.name,
              audienceSize: item.audience_size || null,
              path: item.path ? item.path.join(' > ') : ''
            });
          }
        });
      });

      // junkPatterns & addToMetaInterests didefinisikan di step 3, tapi suggestion pertama jalan dulu
      // pakai inline filter dulu sebelum helper tersedia
      const _junk = [
        /akses facebook/i, /perangkat seluler/i, /perangkat android/i,
        /perangkat ios/i, /pengguna perangkat/i, /teman penggemar/i,
        /teman dari teman/i, /ulang tahun/i, /administrator halaman/i
      ];

      // ── 2. adinterestsuggestion — temukan interest tersembunyi ──
      if (metaInterests.length > 0) {
        const topNames = metaInterests.slice(0, 10).map(i => i.nama);
        const suggUrl = `https://graph.facebook.com/v19.0/search?type=adinterestsuggestion&interest_list=${encodeURIComponent(JSON.stringify(topNames))}&locale=id_ID&access_token=${fbToken}`;
        try {
          const suggRes = await fetch(suggUrl);
          const suggData = await suggRes.json();
          if (suggData.data && Array.isArray(suggData.data)) {
            suggData.data.forEach(function(item) {
              const key = item.name.toLowerCase();
              if (!seen.has(key) && !_junk.some(p => p.test(item.name))) {
                seen.add(key);
                metaInterests.push({ id: item.id, nama: item.name, audienceSize: item.audience_size || null, path: item.path ? item.path.join(' > ') : '', suggested: true });
              }
            });
          }
        } catch(e) {}
      }

      // ── 3. Claude generate behavior terms (Indonesian + English) ─
      const step3 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: `Produk: "${product}".

Pikirkan KONKRET dan MENDALAM: orang yang pakai/beli "${product}" itu dalam kesehariannya:
- Pakai/bawa apa? (pakaian, aksesoris, alat)
- Pergi ke mana? (tempat, komunitas, toko)
- Melakukan apa? (olahraga, hobi, aktivitas)
- Beli apa lagi? (produk pelengkap)
- Konsumsi apa? (makanan, minuman, media)

Contoh untuk "sepeda": kaos kaki, sendal, sarung tangan, botol minum, earphone, topi, tas ransel, bengkel, sunscreen, celana olahraga, helm, pompa ban, komunitas gowes, toko olahraga, cycling, outdoor, fitness.

Berikan 40 kata kunci — campuran bahasa Indonesia DAN Inggris karena Meta punya kedua bahasa.
HANYA array JSON: ["kata1","kata2",...]`
          }]
        })
      });
      const step3Data = await step3.json();
      let behaviorTerms = [];
      try {
        const step3Text = step3Data.content?.[0]?.text || '[]';
        const match3 = step3Text.match(/\[[\s\S]*\]/);
        if (match3) behaviorTerms = JSON.parse(match3[0]);
      } catch(e) {}

      // ── 4. Search Meta untuk semua behavior terms (paralel) ───
      const junkPatterns = [
        /akses facebook/i, /perangkat seluler/i, /perangkat android/i,
        /perangkat ios/i, /pengguna perangkat/i, /teman penggemar/i,
        /teman dari teman/i, /ulang tahun/i, /administrator halaman/i
      ];

      function addToMetaInterests(item, tag) {
        const key = item.name.toLowerCase();
        const isJunk = junkPatterns.some(p => p.test(item.name));
        if (!seen.has(key) && !isJunk) {
          seen.add(key);
          metaInterests.push({
            id: item.id,
            nama: item.name,
            audienceSize: item.audience_size || null,
            path: item.path ? item.path.join(' > ') : '',
            [tag]: true
          });
        }
      }

      if (behaviorTerms.length > 0) {
        const behaviorFetches = behaviorTerms.map(term =>
          fetch(`https://graph.facebook.com/v19.0/search?type=adinterest&q=${encodeURIComponent(term)}&limit=15&locale=id_ID&access_token=${fbToken}`)
            .then(r => r.json()).catch(() => ({ data: [] }))
        );
        const behaviorResults = await Promise.all(behaviorFetches);
        behaviorResults.forEach(res => (res.data||[]).forEach(item => addToMetaInterests(item, 'behavior')));
      }

      // ── 5. Suggestion kedua dari behavior results yang ditemukan ─
      const behaviorFound = metaInterests.filter(i => i.behavior).slice(0, 8);
      if (behaviorFound.length > 0) {
        try {
          const suggUrl2 = `https://graph.facebook.com/v19.0/search?type=adinterestsuggestion&interest_list=${encodeURIComponent(JSON.stringify(behaviorFound.map(i => i.nama)))}&locale=id_ID&access_token=${fbToken}`;
          const suggRes2 = await fetch(suggUrl2);
          const suggData2 = await suggRes2.json();
          (suggData2.data||[]).forEach(item => addToMetaInterests(item, 'suggested'));
        } catch(e) {}
      }

      // ── 5. Kirim semua ke Claude untuk dikategorikan ──────────
      const metaList = metaInterests.length > 0
        ? metaInterests.map(function(i) {
            const size = i.audienceSize ? ` (${(i.audienceSize/1000000).toFixed(1)}M)` : '';
            const tag = i.suggested ? ' [hidden]' : i.behavior ? ' [behavior]' : '';
            return `- ${i.nama}${size} [${i.path}]${tag}`;
          }).join('\n')
        : '(tidak ada data dari Meta)';

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 8000,
          messages: [{
            role: 'user',
            content: `Kamu adalah pakar Meta Ads Indonesia. Berikut adalah ${metaInterests.length} interest NYATA dari Meta Ads untuk produk/topik "${product}":

${metaList}

Keterangan:
- [hidden] = interest tersembunyi dari Meta suggestion
- [behavior] = interest behavior-connected yang sudah diverifikasi ada di Meta

Tugasmu: kelompokkan SEMUA interest ke dalam 3 grup:

1. "Sesuai Kata Kunci" — interest yang namanya langsung mengandung atau identik dengan "${product}"
2. "Relevan & Mirip" — interest sejenis atau satu kategori produk dengan "${product}"
3. "Berhubungan" — interest bertanda [behavior] dan interest lain dari data Meta yang terkait perilaku/kebiasaan pengguna "${product}" (bukan produk sejenis)

SEMUA interest yang ditampilkan HARUS dari data Meta di atas. Jangan tambah yang tidak ada di list.
Interest tidak relevan → negativeKeywords.
Pilih 5 terbaik untuk topPicks (utamakan [hidden] dan audience size besar).

Berikan output JSON yang valid (HANYA JSON, tanpa teks lain):
{
  "mainKeyword": "${product}",
  "categories": [
    { "nama": "Sesuai Kata Kunci", "icon": "🎯", "desc": "interest yang langsung sesuai dengan kata kunci", "keywords": [{ "kata": "contoh", "logika": "alasan singkat", "intent": "beli", "audienceSize": null, "hidden": false }] },
    { "nama": "Relevan & Mirip", "icon": "🔗", "desc": "interest sejenis atau satu kategori", "keywords": [{ "kata": "contoh", "logika": "alasan singkat", "intent": "beli", "audienceSize": null, "hidden": false }] },
    { "nama": "Berhubungan", "icon": "💡", "desc": "item & perilaku yang digunakan bersamaan dengan produk ini", "keywords": [{ "kata": "contoh", "logika": "alasan konkret", "intent": "info", "audienceSize": null, "hidden": false }] }
  ],
  "topPicks": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "negativeKeywords": ["kw tidak relevan 1", "kw tidak relevan 2"]
}

Penting:
- "audienceSize": angka asli dari data Meta. Null jika tidak ada.
- "hidden": true jika bertanda [hidden], false jika tidak.
- Logika konkret maksimal 6 kata. HANYA JSON.`
          }]
        })
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.error?.message || 'Gagal.' });
      const text = d.content?.[0]?.text || '{}';
      try {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return res.status(500).json({ error: 'Format response tidak valid.' });
        const parsed = JSON.parse(match[0]);
        // Sertakan raw Meta interests untuk referensi
        parsed.metaInterestsCount = metaInterests.length;
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
