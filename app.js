/* =====================
   AdGen — 3 Tab App
   Gambar · Video · Suara
   ===================== */

// ── State ─────────────────────────────────────────────────
let activeTab       = 'image';
let imgBase64       = null, imgMime = null;
let vidBase64       = null, vidMime = null;
let imgModel        = 'gpt-image/1.5-image-to-image';
let vidModel        = 'kling-2.6/image-to-video';
let imgRatio        = '1:1';
let vidDuration     = '5';
let vidResolution   = '720p';
let imgQty          = 1;
let ttsModel        = 'elevenlabs/text-to-speech-turbo-2-5';
let ttsVoice        = '3mAVBNEqop5UbHtD8oxQ'; // Zephlyn default
let ttsSpeed        = 1.0;
let ttsStability    = 0.5;
let previewUrls     = [], previewIdx = 0;

const $ = id => document.getElementById(id);

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupUpload('img', v => imgBase64 = v, m => imgMime = m, 'imgRatioGrid', g => imgRatio = g);
  setupUpload('vid', v => vidBase64 = v, m => vidMime = m, null, null);
  setupModelList('imgModelList', m => {
    imgModel = m;
    $('imgStrengthGroup').style.display = m === 'qwen/image-to-image' ? 'block' : 'none';
  });
  setupModelList('vidModelList', m => vidModel = m);
  setupModelList('ttsModelList', m => ttsModel = m);
  setupVoiceGrid();
  setupStrength('ttsSpeed', 'ttsSpeedVal', v => { ttsSpeed = v; }, '1.0x', (v) => v + 'x');
  setupStrength('ttsStability', 'ttsStabilityVal', v => { ttsStability = v; });
  // char counter
  const tpInput = document.getElementById('musicPrompt');
  if (tpInput) { tpInput.addEventListener('input', () => { const cc = document.getElementById('ttsCharCount'); if(cc) cc.textContent = tpInput.value.length + ' karakter'; }); }
  setupRatioGrid('imgRatioGrid', v => imgRatio = v);
  setupRatioGrid('vidDurationGrid', v => vidDuration = v, 'dur');
  setupResGrid();
  setupQty('imgQty', v => imgQty = v);
  setupNegToggle('imgNegTrigger', 'imgNegArrow', 'imgNegBody');
  setupStrength('imgStrength', 'imgStrengthVal');
  setupModal();
  showState('empty');

  // Regenerate buttons
  $('imgBtnRegenerate').addEventListener('click', generate);
  $('vidBtnRegenerate').addEventListener('click', generate);
  $('musicBtnRegenerate').addEventListener('click', generate);
  $('btnGenerate').addEventListener('click', generate);
});

// ── Tabs ──────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
      document.querySelectorAll('.tab-panel').forEach(p => p.style.display = p.dataset.panel === activeTab ? 'block' : 'none');
      const labels = { image: 'Generate Gambar', video: 'Generate Video', music: 'Generate Suara' };
      $('btnGenerateLabel').textContent = labels[activeTab];
      const emptyTitles = { image: 'Generate Konten Iklan — Gambar', video: 'Generate Konten Iklan — Video', music: 'Generate Narasi / Voice Over Iklan' };
      $('emptyTitle').textContent = emptyTitles[activeTab];
      showState('empty');
    });
  });
}

// ── Upload ────────────────────────────────────────────────
function setupUpload(prefix, setBase64, setMime, ratioGridId, setRatio) {
  const zone    = $(`${prefix}UploadZone`);
  const input   = $(`${prefix}Input`);
  const empty   = $(`${prefix}UploadEmpty`);
  const filled  = $(`${prefix}UploadFilled`);
  const preview = $(`${prefix}Preview`);
  const remove  = $(`${prefix}Remove`);

  zone.addEventListener('click', e => {
    if (remove.contains(e.target)) return;
    if (filled.style.display !== 'none') return;
    input.click();
  });
  empty.addEventListener('click', e => { e.stopPropagation(); input.click(); });
  input.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { showToast('File terlalu besar. Maks 10MB.', 'error'); return; }
    setMime(f.type);
    const r = new FileReader();
    r.onload = ev => {
      setBase64(ev.target.result);
      preview.src = ev.target.result;
      empty.style.display  = 'none';
      filled.style.display = 'block';
      // Auto detect ratio
      if (ratioGridId && setRatio) {
        const img = new Image();
        img.onload = () => {
          const ratio = img.naturalWidth / img.naturalHeight;
          let best = '1:1';
          if (ratio < 0.58)      best = '9:16';
          else if (ratio < 0.85) best = '4:5';
          else if (ratio < 1.15) best = '1:1';
          else if (ratio < 1.45) best = '3:2';
          else                   best = '16:9';
          document.querySelectorAll(`#${ratioGridId} .ratio-cell`).forEach(b => {
            const match = b.dataset.ratio === best;
            b.classList.toggle('active', match);
            if (match) setRatio(best);
          });
        };
        img.src = ev.target.result;
      }
    };
    r.readAsDataURL(f);
  });
  remove.addEventListener('click', e => {
    e.stopPropagation();
    setBase64(null); setMime(null);
    preview.src = '';
    filled.style.display = 'none';
    empty.style.display  = 'flex';
    input.value = '';
  });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });
}

function setupModelList(listId, onChange, dataKey = 'model') {
  document.querySelectorAll(`#${listId} .model-row`).forEach(row => {
    row.addEventListener('click', () => {
      const radio = row.querySelector('input[type=radio]');
      if (radio) radio.checked = true;
      document.querySelectorAll(`#${listId} .model-row`).forEach(r => r.classList.toggle('active', r === row));
      onChange(row.dataset[dataKey] || row.dataset.model);
    });
  });
}

function setupRatioGrid(gridId, onChange, dataKey = 'ratio') {
  document.querySelectorAll(`#${gridId} .ratio-cell`).forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll(`#${gridId} .ratio-cell`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      onChange(btn.dataset[dataKey]);
    });
  });
}

function setupResGrid() {
  document.querySelectorAll('[data-res]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-res]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      vidResolution = btn.dataset.res;
    });
  });
}

function setupInstrumentalToggle() {
  document.querySelectorAll('[data-instrumental]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-instrumental]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      isInstrumental = btn.dataset.instrumental === 'true';
    });
  });
}

function setupTtsLang() {
  document.querySelectorAll('#ttsLangGrid .ratio-cell').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#ttsLangGrid .ratio-cell').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ttsLang = btn.dataset.lang;
      const isID = ttsLang === 'id';
      document.getElementById('ttsVoiceID').style.display = isID ? 'block' : 'none';
      document.getElementById('ttsVoiceEN').style.display = isID ? 'none' : 'block';
      // Set default voice for selected language
      ttsVoice = isID ? 'Andi' : 'Rachel';
      // Reset active state
      const activeList = isID ? 'ttsVoiceListID' : 'ttsVoiceListEN';
      document.querySelectorAll(\`#\${activeList} .model-row\`).forEach((r, i) => r.classList.toggle('active', i === 0));
      // Force model to multilingual for Indonesian
      if (isID) {
        ttsModel = 'elevenlabs/text-to-speech-multilingual-v2';
        document.querySelectorAll('#ttsModelList .model-row').forEach(r => {
          r.classList.toggle('active', r.dataset.model === 'elevenlabs/text-to-speech-multilingual-v2');
        });
      }
    });
  });
}

function setupVoiceGrid() {
  let previewAudio = null;
  let playingBtn   = null;

  // Filter pills
  document.querySelectorAll('#voiceFilterPills .vpill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('#voiceFilterPills .vpill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const filter = pill.dataset.filter;
      document.querySelectorAll('#ttsVoiceGrid .voice-card').forEach(card => {
        card.style.display = (filter === 'all' || card.dataset.lang === filter) ? '' : 'none';
      });
    });
  });

  // Voice selection
  document.querySelectorAll('#ttsVoiceGrid .voice-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.voice-preview-btn')) return; // let preview btn handle
      document.querySelectorAll('#ttsVoiceGrid .voice-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      ttsVoice = card.dataset.voice;
    });
  });

  // Voice preview
  document.querySelectorAll('.voice-preview-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const voiceId = btn.dataset.vid;

      // Stop current if same
      if (playingBtn === btn) {
        if (previewAudio) { previewAudio.pause(); previewAudio = null; }
        btn.classList.remove('playing');
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polygon points="3,1.5 11.5,6.5 3,11.5" fill="currentColor"/></svg>';
        playingBtn = null;
        return;
      }

      // Stop previous
      if (playingBtn) {
        if (previewAudio) { previewAudio.pause(); previewAudio = null; }
        playingBtn.classList.remove('playing', 'loading');
        playingBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polygon points="3,1.5 11.5,6.5 3,11.5" fill="currentColor"/></svg>';
        playingBtn = null;
      }

      // Loading state
      btn.classList.add('loading');
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 8"/></svg>';
      playingBtn = btn;

      try {
        const url = `/api/proxy?action=preview&voiceId=${voiceId}`;
        previewAudio = new Audio(url);
        previewAudio.oncanplay = () => {
          btn.classList.remove('loading');
          btn.classList.add('playing');
          btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/><rect x="7.5" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/></svg>';
          previewAudio.play();
        };
        previewAudio.onended = () => {
          btn.classList.remove('playing');
          btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polygon points="3,1.5 11.5,6.5 3,11.5" fill="currentColor"/></svg>';
          previewAudio = null; playingBtn = null;
        };
        previewAudio.onerror = () => {
          btn.classList.remove('loading', 'playing');
          btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polygon points="3,1.5 11.5,6.5 3,11.5" fill="currentColor"/></svg>';
          playingBtn = null;
          showToast('Preview tidak tersedia untuk voice ini.', 'error');
        };
        previewAudio.load();
      } catch(err) {
        btn.classList.remove('loading');
        btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polygon points="3,1.5 11.5,6.5 3,11.5" fill="currentColor"/></svg>';
        playingBtn = null;
      }
    });
  });
}

// Init default voice
ttsVoice = '3mAVBNEqop5UbHtD8oxQ'; // Zephlyn

function setupNegToggle(triggerId, arrowId, bodyId) {
  $(triggerId).addEventListener('click', () => {
    const open = $(bodyId).style.display !== 'none';
    $(bodyId).style.display = open ? 'none' : 'block';
    $(arrowId).classList.toggle('open', !open);
  });
}

function setupStrength(rangeId, valId, onChange, defaultDisplay, formatter) {
  const el = $(rangeId);
  if (!el) return;
  el.addEventListener('input', () => {
    const v = parseFloat(el.value);
    $(valId).textContent = formatter ? formatter(v.toFixed(1)) : v.toFixed(2);
    if (onChange) onChange(v);
  });
}

function setupQty(prefix, onChange) {
  const input = $(`${prefix}Input`);
  const dec   = $(`${prefix}Dec`);
  const inc   = $(`${prefix}Inc`);
  const disp  = $(`${prefix}Display`);
  function update(val) {
    const v = Math.max(1, Math.min(20, parseInt(val) || 1));
    input.value = v; disp.textContent = v; onChange(v);
  }
  input.addEventListener('input', () => update(input.value));
  input.addEventListener('blur',  () => update(input.value));
  dec.addEventListener('click', () => update(parseInt(input.value) - 1));
  inc.addEventListener('click', () => update(parseInt(input.value) + 1));
}

// ── Generate ──────────────────────────────────────────────
async function generate() {
  if (activeTab === 'image')  await generateImage();
  if (activeTab === 'video')  await generateVideo();
  if (activeTab === 'music')  await generateMusic();
}

async function generateImage() {
  const prompt = $('imgPrompt').value.trim();
  if (!prompt)    { showToast('Tulis deskripsi iklan dulu.', 'error'); return; }
  if (!imgBase64) { showToast('Upload gambar referensi dulu.', 'error'); return; }

  showState('loading'); resetProgress();

  try {
    updateSub('Mengupload gambar...');
    const { url } = await proxyPost('upload', { imageBase64: imgBase64, mimeType: imgMime || 'image/jpeg' });

    updateSub('Mengirim ke AI...');
    const genRes = await proxyPost('generate', {
      type: 'image', model: imgModel, imageUrl: url, prompt,
      ratio: imgRatio, negPrompt: $('imgNegPrompt').value.trim(),
      strength: parseFloat($('imgStrength').value), quantity: imgQty,
    });

    const taskIds = genRes.taskIds || (genRes.taskId ? [genRes.taskId] : []);
    if (!taskIds.length) throw new Error('taskId tidak ditemukan.');

    updateSub(`Menunggu ${taskIds.length} gambar...`);
    const results = await Promise.allSettled(taskIds.map(id => pollStatus(id, genRes.taskType || 'jobs')));
    const urls = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    if (!urls.length) throw new Error('Semua generate gagal.');

    showImageResult(urls);
  } catch(err) {
    console.error(err); showToast(err.message, 'error'); showState('empty');
  }
}

async function generateVideo() {
  const prompt = $('vidPrompt').value.trim();
  if (!prompt)    { showToast('Tulis deskripsi gerakan dulu.', 'error'); return; }
  if (!vidBase64) { showToast('Upload gambar referensi dulu.', 'error'); return; }

  showState('loading'); resetProgress();

  try {
    updateSub('Mengupload gambar...');
    const { url } = await proxyPost('upload', { imageBase64: vidBase64, mimeType: vidMime || 'image/jpeg' });

    updateSub('Mengirim ke AI video...');
    const genRes = await proxyPost('generate', {
      type: 'video', model: vidModel, imageUrl: url, prompt,
      duration: vidDuration, resolution: vidResolution,
    });

    if (!genRes.taskId) throw new Error('taskId tidak ditemukan.');
    updateSub('Rendering video (bisa beberapa menit)...');
    const videoUrl = await pollStatus(genRes.taskId, 'jobs', 120);
    showVideoResult(videoUrl);
  } catch(err) {
    console.error(err); showToast(err.message, 'error'); showState('empty');
  }
}

async function generateMusic() {
  const text = $('musicPrompt').value.trim();
  if (!text) { showToast('Tulis teks narasi dulu.', 'error'); return; }

  showState('loading'); resetProgress();

  try {
    updateSub('Mengirim ke ElevenLabs...');
    const genRes = await proxyPost('generate', {
      type: 'speech', text, model: ttsModel, voice: ttsVoice,
      speed: ttsSpeed, stability: ttsStability,
      languageCode: '', // model detects language automatically
    });

    if (!genRes.taskId) throw new Error('taskId tidak ditemukan.');
    updateSub('Generating suara...');
    const audioUrl = await pollStatus(genRes.taskId, 'jobs', 30);
    showSpeechResult(audioUrl);
  } catch(err) {
    console.error(err); showToast(err.message, 'error'); showState('empty');
  }
}

// ── Proxy helpers ─────────────────────────────────────────
async function proxyPost(action, body) {
  const res = await fetch(`/api/proxy?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await parseRes(res);
}

async function proxyGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return await parseRes(await fetch(`/api/proxy?${qs}`));
}

async function parseRes(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Server error (${res.status}): ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function pollStatus(taskId, type, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(i < 5 ? 2000 : i < 15 ? 3000 : 5000);
    updateSub(`Memproses... (${i + 1}/${maxAttempts})`);
    const data = await proxyGet('status', { taskId, type });
    if (['success','SUCCESS','completed','COMPLETED'].includes(data.status)) {
      if (!data.imageUrl && !data.videoUrl) throw new Error('Hasil tidak ditemukan.');
      return data.imageUrl || data.videoUrl;
    }
    if (data.isFail) throw new Error('Generate gagal. Coba ganti model.');
  }
  throw new Error('Timeout. Coba lagi.');
}

async function pollMusicStatus(taskId) {
  for (let i = 0; i < 60; i++) {
    await sleep(i < 5 ? 3000 : 5000);
    updateSub(`Generating musik... (${i + 1}/60)`);
    const data = await proxyGet('musicStatus', { taskId });
    if (data.tracks && data.tracks.length > 0) return data.tracks;
    if (data.isFail) throw new Error('Generate musik gagal.');
  }
  throw new Error('Timeout musik. Coba lagi.');
}

// ── UI States ─────────────────────────────────────────────
function showState(s) {
  $('stateEmpty').style.display      = s === 'empty'   ? 'flex' : 'none';
  $('stateLoading').style.display    = s === 'loading' ? 'flex' : 'none';
  $('stateResultImg').style.display  = s === 'img'     ? 'flex' : 'none';
  $('stateResultVid').style.display  = s === 'vid'     ? 'flex' : 'none';
  $('stateResultMusic').style.display = s === 'music'  ? 'flex' : 'none';
  $('btnGenerate').disabled = s === 'loading';
}

function resetProgress() {
  const pb = $('progressBar');
  pb.style.animation = 'none'; pb.offsetHeight; pb.style.animation = '';
}

function updateSub(t) { $('loadingSub').textContent = t; }

function showImageResult(urls) {
  const grid = $('imgResultGrid');
  grid.innerHTML = '';
  urls.forEach((url, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'result-item';
    const img = document.createElement('img');
    img.src = url; img.loading = 'lazy';
    const overlay = document.createElement('div');
    overlay.className = 'result-overlay';
    overlay.innerHTML = `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="white" stroke-width="1.5"/><path d="M8 11h6M11 8v6" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg><span>Lihat</span>`;
    wrap.addEventListener('click', () => openModal(urls, i));
    wrap.appendChild(img); wrap.appendChild(overlay);
    grid.appendChild(wrap);
  });
  showState('img');
  const name = document.querySelector(`#imgModelList .model-row.active .model-row-name`)?.textContent || imgModel;
  $('imgResultMeta').textContent = `${name} · ${imgRatio} · ${urls.length} gambar · ${new Date().toLocaleTimeString('id-ID')}`;
  const dlAll = $('imgBtnDownloadAll');
  dlAll.style.display = urls.length > 1 ? 'flex' : 'none';
  dlAll.onclick = () => urls.forEach((url, i) => setTimeout(() => {
    const a = document.createElement('a'); a.href = url; a.download = `adgen-${i+1}.jpg`; a.target = '_blank'; a.click();
  }, i * 300));
}

function showVideoResult(videoUrl) {
  const vid = $('vidResult');
  vid.src = videoUrl;
  showState('vid');
  const name = document.querySelector('#vidModelList .model-row.active .model-row-name')?.textContent || vidModel;
  $('vidResultMeta').textContent = `${name} · ${vidDuration}s · ${vidResolution} · ${new Date().toLocaleTimeString('id-ID')}`;
  $('vidBtnDownload').onclick = () => {
    const a = document.createElement('a'); a.href = videoUrl; a.download = `adgen-video-${Date.now()}.mp4`; a.target = '_blank'; a.click();
  };
}

function showSpeechResult(audioUrl) {
  const list = $('musicResultList');
  list.innerHTML = '';
  const item = document.createElement('div');
  item.className = 'music-track-item';
  item.innerHTML = `
    <div class="music-track-info">
      <div class="music-track-title">${ttsVoice}</div>
      <div class="music-track-meta">ElevenLabs TTS</div>
    </div>
    <audio controls src="${audioUrl}" style="flex:1; min-width:0"></audio>
    <a href="${audioUrl}" download="adgen-speech-${Date.now()}.mp3" target="_blank" class="btn-solid" style="flex-shrink:0; text-decoration:none; padding:6px 12px; font-size:12px; display:flex; align-items:center">
      <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 7l3 3 3-3" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 12h12" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg>
    </a>`;
  list.appendChild(item);
  showState('music');
  $('musicResultMeta').textContent = `${ttsVoice} · ElevenLabs · ${new Date().toLocaleTimeString('id-ID')}`;
}

// ── Preview Modal ─────────────────────────────────────────
function setupModal() {
  const modal  = $('previewModal');
  const bg     = $('previewModalBg');
  const img    = $('previewModalImg');
  const close  = $('previewClose');
  const prev   = $('previewPrev');
  const next   = $('previewNext');
  const ctr    = $('previewCounter');
  const dl     = $('previewDl');

  function render() {
    img.src = previewUrls[previewIdx];
    ctr.textContent = (previewIdx + 1) + ' / ' + previewUrls.length;
    prev.disabled = previewIdx === 0;
    next.disabled = previewIdx === previewUrls.length - 1;
    dl.onclick = () => { const a = document.createElement('a'); a.href = previewUrls[previewIdx]; a.download = `adgen-${Date.now()}.jpg`; a.target = '_blank'; a.click(); };
  }

  function closeModal() { modal.style.display = 'none'; document.body.style.overflow = ''; }

  close.addEventListener('click', closeModal);
  bg.addEventListener('click', closeModal);
  prev.addEventListener('click', () => { if (previewIdx > 0) { previewIdx--; render(); } });
  next.addEventListener('click', () => { if (previewIdx < previewUrls.length - 1) { previewIdx++; render(); } });
  document.addEventListener('keydown', e => {
    if (modal.style.display === 'none') return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft' && previewIdx > 0) { previewIdx--; render(); }
    if (e.key === 'ArrowRight' && previewIdx < previewUrls.length - 1) { previewIdx++; render(); }
  });

  window.openModal = (urls, idx) => {
    previewUrls = urls; previewIdx = idx;
    render(); modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
}

// ── Toast ─────────────────────────────────────────────────
let toastTO;
function showToast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg; t.className = `toast show ${type}`;
  clearTimeout(toastTO);
  toastTO = setTimeout(() => t.classList.remove('show'), 5000);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
