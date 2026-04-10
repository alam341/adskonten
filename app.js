/* AdGen — App Logic */

var uploadedImageBase64 = null;
var uploadedMimeType    = null;
var vidBase64           = null;
var vidMime             = null;
var imgModel            = 'gpt-image/1.5-image-to-image';
var vidModel            = 'kling-2.6/image-to-video';
var ttsModel            = 'elevenlabs/text-to-speech-turbo-2-5';
var ttsVoice            = 'Rachel';
var ttsSpeed            = 1.0;
var ttsStability        = 0.5;
var imgRatio            = '1:1';
var vidDuration         = '5';
var vidResolution       = '720p';
var imgQty              = 1;
var activeTab           = 'image';
var previewUrls         = [];
var previewIdx          = 0;

function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', function() {
  setupTabs();
  setupUpload('img', function(v){ uploadedImageBase64=v; }, function(m){ uploadedMimeType=m; }, 'imgRatioGrid', function(r){ imgRatio=r; });
  setupUpload('vid', function(v){ vidBase64=v; }, function(m){ vidMime=m; }, null, null);
  setupModelList('imgModelList', function(m){ imgModel=m; });
  setupModelList('vidModelList', function(m){ vidModel=m; });
  setupModelList('ttsModelList', function(m){ ttsModel=m; });
  setupRatioGrid('imgRatioGrid', function(v){ imgRatio=v; });
  setupRatioGrid('vidDurationGrid', function(v){ vidDuration=v; }, 'dur');
  setupResGrid();
  setupQty();
  setupNegToggle('imgNegTrigger','imgNegArrow','imgNegBody');
  setupStrengthSlider('imgStrength','imgStrengthVal');
  setupStrengthSlider('ttsSpeed','ttsSpeedVal', function(v){ ttsSpeed=v; }, function(v){ return v+'x'; });
  setupStrengthSlider('ttsStability','ttsStabilityVal', function(v){ ttsStability=v; });
  setupVoiceGrid();
  setupModal();
  setupCharCounter();
  showState('empty');

  $('imgBtnRegenerate').addEventListener('click', generate);
  $('vidBtnRegenerate').addEventListener('click', generate);
  $('musicBtnRegenerate').addEventListener('click', generate);
  $('btnGenerate').addEventListener('click', generate);
});

// ── Tabs ──────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === activeTab); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.style.display = p.dataset.panel === activeTab ? 'block' : 'none'; });
      var labels = { image: 'Generate Gambar', video: 'Generate Video', music: 'Generate Speech' };
      $('btnGenerateLabel').textContent = labels[activeTab] || 'Generate';
      var titles = { image: 'Generate Konten Iklan — Gambar', video: 'Generate Konten Iklan — Video', music: 'Generate Narasi / Voice Over' };
      if ($('emptyTitle')) $('emptyTitle').textContent = titles[activeTab] || '';
      showState('empty');
    });
  });
}

// ── Upload ────────────────────────────────────────────────
function setupUpload(prefix, setBase64, setMime, ratioGridId, setRatio) {
  var zone    = $(prefix + 'UploadZone');
  var input   = $(prefix + 'Input');
  var empty   = $(prefix + 'UploadEmpty');
  var filled  = $(prefix + 'UploadFilled');
  var preview = $(prefix + 'Preview');
  var remove  = $(prefix + 'Remove');
  if (!zone) return;

  zone.addEventListener('click', function(e) {
    if (remove.contains(e.target)) return;
    if (filled.style.display !== 'none') return;
    input.click();
  });
  empty.addEventListener('click', function(e) { e.stopPropagation(); input.click(); });

  input.addEventListener('change', function(e) {
    var f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { showToast('File terlalu besar. Maks 10MB.', 'error'); return; }
    setMime(f.type);
    var r = new FileReader();
    r.onload = function(ev) {
      setBase64(ev.target.result);
      preview.src = ev.target.result;
      empty.style.display  = 'none';
      filled.style.display = 'block';
      if (ratioGridId && setRatio) {
        var img = new Image();
        img.onload = function() {
          var ratio = img.naturalWidth / img.naturalHeight;
          var best = '1:1';
          if (ratio < 0.58)      best = '9:16';
          else if (ratio < 0.85) best = '4:5';
          else if (ratio < 1.15) best = '1:1';
          else if (ratio < 1.45) best = '3:2';
          else                   best = '16:9';
          document.querySelectorAll('#' + ratioGridId + ' .ratio-cell').forEach(function(b) {
            b.classList.toggle('active', b.dataset.ratio === best);
          });
          setRatio(best);
        };
        img.src = ev.target.result;
      }
    };
    r.readAsDataURL(f);
  });

  remove.addEventListener('click', function(e) {
    e.stopPropagation();
    setBase64(null); setMime(null);
    preview.src = '';
    filled.style.display = 'none';
    empty.style.display  = 'flex';
    input.value = '';
  });

  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); zone.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });
}

function setupModelList(listId, onChange) {
  var list = document.getElementById(listId);
  if (!list) return;
  list.querySelectorAll('.model-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var radio = row.querySelector('input[type=radio]');
      if (radio) radio.checked = true;
      list.querySelectorAll('.model-row').forEach(function(r) { r.classList.toggle('active', r === row); });
      onChange(row.dataset.model);
    });
  });
}

function setupRatioGrid(gridId, onChange, dataKey) {
  var grid = document.getElementById(gridId);
  if (!grid) return;
  grid.querySelectorAll('.ratio-cell').forEach(function(btn) {
    btn.addEventListener('click', function() {
      grid.querySelectorAll('.ratio-cell').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      onChange(btn.dataset[dataKey || 'ratio']);
    });
  });
}

function setupResGrid() {
  document.querySelectorAll('[data-res]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('[data-res]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      vidResolution = btn.dataset.res;
    });
  });
}

function setupNegToggle(triggerId, arrowId, bodyId) {
  var trigger = $(triggerId), arrow = $(arrowId), body = $(bodyId);
  if (!trigger) return;
  trigger.addEventListener('click', function() {
    var open = body.style.display !== 'none';
    body.style.display = open ? 'none' : 'block';
    arrow.classList.toggle('open', !open);
  });
}

function setupStrengthSlider(rangeId, valId, onChange, formatter) {
  var el = $(rangeId), valEl = $(valId);
  if (!el || !valEl) return;
  el.addEventListener('input', function() {
    var v = parseFloat(el.value);
    valEl.textContent = formatter ? formatter(v.toFixed(1)) : v.toFixed(2);
    if (onChange) onChange(v);
  });
}

function setupQty() {
  var input = $('imgQtyInput');
  var dec   = $('imgQtyDec');
  var inc   = $('imgQtyInc');
  var disp  = $('imgQtyDisplay');
  if (!input) return;
  function update(val) {
    var v = Math.max(1, Math.min(20, parseInt(val) || 1));
    input.value = v; if (disp) disp.textContent = v; imgQty = v;
  }
  input.addEventListener('input', function() { update(input.value); });
  input.addEventListener('blur',  function() { update(input.value); });
  dec.addEventListener('click', function() { update(parseInt(input.value) - 1); });
  inc.addEventListener('click', function() { update(parseInt(input.value) + 1); });
}

function setupCharCounter() {
  var ta = $('musicPrompt');
  var cc = $('ttsCharCount');
  if (!ta || !cc) return;
  ta.addEventListener('input', function() { cc.textContent = ta.value.length + ' karakter'; });
}

// ── Voice Grid ────────────────────────────────────────────
function setupVoiceGrid() {
  var previewAudio = null;
  var playingBtn   = null;

  // Filter pills
  document.querySelectorAll('#voiceFilterPills .vpill').forEach(function(pill) {
    pill.addEventListener('click', function() {
      document.querySelectorAll('#voiceFilterPills .vpill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      var filter = pill.dataset.filter;
      document.querySelectorAll('#ttsVoiceGrid .voice-card').forEach(function(card) {
        card.style.display = (filter === 'all' || card.dataset.lang === filter) ? '' : 'none';
      });
    });
  });

  // Voice selection
  document.querySelectorAll('#ttsVoiceGrid .voice-card').forEach(function(card) {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.voice-preview-btn')) return;
      document.querySelectorAll('#ttsVoiceGrid .voice-card').forEach(function(c) { c.classList.remove('active'); });
      card.classList.add('active');
      ttsVoice = card.dataset.voice;
    });
  });

  var PLAY_ICON  = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polygon points="3,1.5 11.5,6.5 3,11.5" fill="currentColor"/></svg>';
  var PAUSE_ICON = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/><rect x="7.5" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/></svg>';
  var LOAD_ICON  = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 8"/></svg>';

  document.querySelectorAll('.voice-preview-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var voiceId = btn.dataset.vid;

      if (playingBtn === btn) {
        if (previewAudio) { previewAudio.pause(); previewAudio = null; }
        btn.classList.remove('playing');
        btn.innerHTML = PLAY_ICON;
        playingBtn = null;
        return;
      }

      if (playingBtn) {
        if (previewAudio) { previewAudio.pause(); previewAudio = null; }
        playingBtn.classList.remove('playing', 'loading');
        playingBtn.innerHTML = PLAY_ICON;
        playingBtn = null;
      }

      btn.classList.add('loading');
      btn.innerHTML = LOAD_ICON;
      playingBtn = btn;

      var url = '/api/proxy?action=preview&voiceId=' + voiceId;
      previewAudio = new Audio(url);
      previewAudio.oncanplay = function() {
        btn.classList.remove('loading');
        btn.classList.add('playing');
        btn.innerHTML = PAUSE_ICON;
        previewAudio.play();
      };
      previewAudio.onended = function() {
        btn.classList.remove('playing');
        btn.innerHTML = PLAY_ICON;
        previewAudio = null; playingBtn = null;
      };
      previewAudio.onerror = function() {
        btn.classList.remove('loading', 'playing');
        btn.innerHTML = PLAY_ICON;
        playingBtn = null;
        showToast('Preview tidak tersedia.', 'error');
      };
      previewAudio.load();
    });
  });
}

// ── Generate ──────────────────────────────────────────────
function generate() {
  if (activeTab === 'image') generateImage();
  if (activeTab === 'video') generateVideo();
  if (activeTab === 'music') generateSpeech();
}

async function generateImage() {
  var prompt = $('imgPrompt').value.trim();
  if (!prompt)              { showToast('Tulis deskripsi iklan dulu.', 'error'); return; }
  if (!uploadedImageBase64) { showToast('Upload gambar referensi dulu.', 'error'); return; }
  showState('loading'); resetProgress();
  try {
    updateSub('Mengupload gambar...');
    var up = await proxyPost('upload', { imageBase64: uploadedImageBase64, mimeType: uploadedMimeType || 'image/jpeg', type: 'image' });
    if (!up.url) throw new Error('Upload gagal.');

    updateSub('Mengirim ke AI...');
    var neg = $('imgNegPrompt') ? $('imgNegPrompt').value.trim() : '';
    var str = $('imgStrength') ? parseFloat($('imgStrength').value) : 0.8;
    var gen = await proxyPost('generate', { type:'image', model:imgModel, imageUrl:up.url, prompt:prompt, ratio:imgRatio, negPrompt:neg, strength:str, quantity:imgQty });
    var taskIds = gen.taskIds || (gen.taskId ? [gen.taskId] : []);
    if (!taskIds.length) throw new Error('taskId tidak ditemukan.');

    updateSub('Menunggu ' + taskIds.length + ' gambar...');
    var results = await Promise.allSettled(taskIds.map(function(id) { return pollStatus(id, gen.taskType || 'jobs'); }));
    var urls = results.filter(function(r) { return r.status === 'fulfilled' && r.value; }).map(function(r) { return r.value; });
    if (!urls.length) throw new Error('Semua generate gagal.');
    showImageResult(urls);
  } catch(err) { console.error(err); showToast(err.message, 'error'); showState('empty'); }
}

async function generateVideo() {
  var prompt = $('vidPrompt').value.trim();
  if (!prompt)    { showToast('Tulis deskripsi gerakan dulu.', 'error'); return; }
  if (!vidBase64) { showToast('Upload gambar referensi dulu.', 'error'); return; }
  showState('loading'); resetProgress();
  try {
    updateSub('Mengupload gambar...');
    var up = await proxyPost('upload', { imageBase64: vidBase64, mimeType: vidMime || 'image/jpeg', type: 'video' });
    if (!up.url) throw new Error('Upload gagal.');
    updateSub('Mengirim ke AI video...');
    var gen = await proxyPost('generate', { type:'video', model:vidModel, imageUrl:up.url, prompt:prompt, duration:vidDuration, resolution:vidResolution });
    if (!gen.taskId) throw new Error('taskId tidak ditemukan.');
    updateSub('Rendering video...');
    var videoUrl = await pollStatus(gen.taskId, 'jobs', 120);
    showVideoResult(videoUrl);
  } catch(err) { console.error(err); showToast(err.message, 'error'); showState('empty'); }
}

async function generateSpeech() {
  var text = $('musicPrompt').value.trim();
  if (!text) { showToast('Tulis teks narasi dulu.', 'error'); return; }
  showState('loading'); resetProgress();
  try {
    updateSub('Mengirim ke ElevenLabs...');
    var gen = await proxyPost('generate', { type:'speech', text:text, model:ttsModel, voice:ttsVoice, speed:ttsSpeed, stability:ttsStability, languageCode:'' });
    if (!gen.taskId) throw new Error('taskId tidak ditemukan.');
    updateSub('Generating suara...');
    var audioUrl = await pollStatus(gen.taskId, 'jobs', 30);
    showSpeechResult(audioUrl);
  } catch(err) { console.error(err); showToast(err.message, 'error'); showState('empty'); }
}

// ── Proxy ─────────────────────────────────────────────────
async function proxyPost(action, body) {
  var res = await fetch('/api/proxy?action=' + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await parseRes(res);
}

async function proxyGet(action, params) {
  var qs = new URLSearchParams(Object.assign({ action: action }, params || {})).toString();
  return await parseRes(await fetch('/api/proxy?' + qs));
}

async function parseRes(res) {
  var ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    var text = await res.text();
    throw new Error('Server error (' + res.status + '): ' + text.slice(0, 150));
  }
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}

async function pollStatus(taskId, type, maxAttempts) {
  maxAttempts = maxAttempts || 60;
  for (var i = 0; i < maxAttempts; i++) {
    await sleep(i < 5 ? 2000 : i < 15 ? 3000 : 5000);
    updateSub('Memproses... (' + (i+1) + '/' + maxAttempts + ')');
    var data = await proxyGet('status', { taskId: taskId, type: type });
    if (['success','SUCCESS','completed','COMPLETED'].indexOf(data.status) >= 0) {
      var url = data.imageUrl || data.videoUrl;
      if (!url) throw new Error('Hasil tidak ditemukan.');
      return url;
    }
    if (data.isFail) throw new Error('Generate gagal. Coba ganti model.');
  }
  throw new Error('Timeout. Coba lagi.');
}

// ── Results ───────────────────────────────────────────────
function showState(s) {
  $('stateEmpty').style.display       = s === 'empty'   ? 'flex' : 'none';
  $('stateLoading').style.display     = s === 'loading' ? 'flex' : 'none';
  $('stateResultImg').style.display   = s === 'img'     ? 'flex' : 'none';
  $('stateResultVid').style.display   = s === 'vid'     ? 'flex' : 'none';
  $('stateResultMusic').style.display = s === 'music'   ? 'flex' : 'none';
  $('btnGenerate').disabled = s === 'loading';
}

function resetProgress() {
  var pb = $('progressBar');
  pb.style.animation = 'none'; pb.offsetHeight; pb.style.animation = '';
}

function updateSub(t) { $('loadingSub').textContent = t; }

function showImageResult(urls) {
  var grid = $('imgResultGrid');
  grid.innerHTML = '';
  urls.forEach(function(url, i) {
    var wrap = document.createElement('div');
    wrap.className = 'result-item';
    var img = document.createElement('img');
    img.src = url; img.loading = 'lazy';
    var overlay = document.createElement('div');
    overlay.className = 'result-overlay';
    overlay.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="white" stroke-width="1.5"/><path d="M8 11h6M11 8v6" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg><span>Lihat</span>';
    wrap.addEventListener('click', function() { openModal(urls, i); });
    wrap.appendChild(img); wrap.appendChild(overlay);
    grid.appendChild(wrap);
  });
  showState('img');
  var name = document.querySelector('#imgModelList .model-row.active .model-row-name');
  $('imgResultMeta').textContent = (name ? name.textContent : imgModel) + ' · ' + imgRatio + ' · ' + urls.length + ' gambar · ' + new Date().toLocaleTimeString('id-ID');
  var dlAll = $('imgBtnDownloadAll');
  dlAll.style.display = urls.length > 1 ? 'flex' : 'none';
  dlAll.onclick = function() {
    urls.forEach(function(url, i) {
      setTimeout(function() {
        var a = document.createElement('a'); a.href = url; a.download = 'adgen-' + (i+1) + '.jpg'; a.target = '_blank'; a.click();
      }, i * 300);
    });
  };
}

function showVideoResult(videoUrl) {
  $('vidResult').src = videoUrl;
  showState('vid');
  var name = document.querySelector('#vidModelList .model-row.active .model-row-name');
  $('vidResultMeta').textContent = (name ? name.textContent : vidModel) + ' · ' + vidDuration + 's · ' + vidResolution + ' · ' + new Date().toLocaleTimeString('id-ID');
  $('vidBtnDownload').onclick = function() {
    var a = document.createElement('a'); a.href = videoUrl; a.download = 'adgen-video-' + Date.now() + '.mp4'; a.target = '_blank'; a.click();
  };
}

function showSpeechResult(audioUrl) {
  var list = $('musicResultList');
  list.innerHTML = '';
  var item = document.createElement('div');
  item.className = 'music-track-item';
  item.innerHTML = '<div class="music-track-info"><div class="music-track-title">Voice Over</div><div class="music-track-meta">ElevenLabs TTS</div></div>' +
    '<audio controls src="' + audioUrl + '" style="flex:1; min-width:0"></audio>' +
    '<a href="' + audioUrl + '" download="adgen-speech-' + Date.now() + '.mp3" target="_blank" class="btn-solid" style="flex-shrink:0;text-decoration:none;padding:6px 12px;font-size:12px;display:flex;align-items:center">' +
    '<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 7l3 3 3-3" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 12h12" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg></a>';
  list.appendChild(item);
  showState('music');
  $('musicResultMeta').textContent = 'ElevenLabs · ' + new Date().toLocaleTimeString('id-ID');
}

// ── Modal ─────────────────────────────────────────────────
function setupModal() {
  var modal = $('previewModal');
  var bg    = $('previewModalBg');
  var img   = $('previewModalImg');
  var close = $('previewClose');
  var prev  = $('previewPrev');
  var next  = $('previewNext');
  var ctr   = $('previewCounter');
  var dl    = $('previewDl');

  function render() {
    img.src = previewUrls[previewIdx];
    ctr.textContent = (previewIdx + 1) + ' / ' + previewUrls.length;
    prev.disabled = previewIdx === 0;
    next.disabled = previewIdx === previewUrls.length - 1;
    dl.onclick = function() { var a = document.createElement('a'); a.href = previewUrls[previewIdx]; a.download = 'adgen-' + Date.now() + '.jpg'; a.target = '_blank'; a.click(); };
  }

  function closeModal() { modal.style.display = 'none'; document.body.style.overflow = ''; }

  close.addEventListener('click', closeModal);
  bg.addEventListener('click', closeModal);
  prev.addEventListener('click', function() { if (previewIdx > 0) { previewIdx--; render(); } });
  next.addEventListener('click', function() { if (previewIdx < previewUrls.length - 1) { previewIdx++; render(); } });
  document.addEventListener('keydown', function(e) {
    if (modal.style.display === 'none') return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft'  && previewIdx > 0)                         { previewIdx--; render(); }
    if (e.key === 'ArrowRight' && previewIdx < previewUrls.length - 1)    { previewIdx++; render(); }
  });

  window.openModal = function(urls, idx) {
    previewUrls = urls; previewIdx = idx;
    render(); modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
}

// ── Toast ─────────────────────────────────────────────────
var toastTO;
function showToast(msg, type) {
  var t = $('toast');
  t.textContent = msg; t.className = 'toast show ' + (type || 'info');
  clearTimeout(toastTO);
  toastTO = setTimeout(function() { t.classList.remove('show'); }, 5000);
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

// ── Theme Toggle ──────────────────────────────────────────
(function() {
  var html    = document.documentElement;
  var btn     = document.getElementById('themeToggle');
  var sunIcon = btn ? btn.querySelector('.icon-sun')  : null;
  var moonIcon = btn ? btn.querySelector('.icon-moon') : null;

  var saved = localStorage.getItem('adgen_theme') || 'dark';
  setTheme(saved);

  if (btn) {
    btn.addEventListener('click', function() {
      setTheme(html.dataset.theme === 'dark' ? 'light' : 'dark');
    });
  }

  function setTheme(t) {
    html.dataset.theme = t;
    localStorage.setItem('adgen_theme', t);
    if (sunIcon && moonIcon) {
      sunIcon.style.display  = t === 'dark'  ? 'block' : 'none';
      moonIcon.style.display = t === 'light' ? 'block' : 'none';
    }
  }
})();
