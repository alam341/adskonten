/* AdGen — App Logic */

var uploadedImageBase64 = null;
var uploadedMimeType    = null;
var vidBase64           = null;
var vidMime             = null;
var imgModel            = 'gpt-image/1.5-image-to-image';
var vidModel            = 'kling-2.6/image-to-video';
var ttsModel            = 'elevenlabs/text-to-speech-multilingual-v2';
var ttsVoice            = '21m00Tcm4TlvDq8ikWAM'; // Rachel default
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
  setupStrengthSlider('ttsSpeed','ttsSpeedVal', function(v){ ttsSpeed=parseFloat(v.toFixed(2)); }, function(v){ return v+'x'; });
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
  var sel     = document.getElementById('ttsVoiceSelect');
  var playBtn = document.getElementById('voicePlayBtn');
  var descEl  = document.getElementById('voiceSelectDesc');
  var audio   = document.getElementById('voicePreviewAudio');
  if (!sel) return;

  // Voices with public preview
  var HAS_PREVIEW = [
    "21m00Tcm4TlvDq8ikWAM","9BWtsMINqrJLrRacOk9x","EXAVITQu4vr4xnSDxMaL",
    "FGY2WhTYpPnrIDTdsKH5","XB0fDUnXU5powFXDhCwa","Xb7hH8MSUJpSbSDYk0k2",
    "XrExE9yKIg1WjnnlVkGX","cgSgspJ2msm6clMCkdW9","pFZP5JQG7iQjIQuC4Bku",
    "CwhRBWXzGAHq8TQ4Fs17","IKne3meq5aSn9XLyUdCD","JBFqnCBsd6RMkjVDRZzb",
    "N2lVS1w4EtoT3dr4eOWO","SAz9YHcvj6GT2YYXdXww","TX3LPaxmHKxFdv7VOQHJ",
    "bIHbv24MWmeRgasZH58o","cjVigY5qzO86Huf0OWal","iP95p4xoKVk53GoZ742B",
    "nPczCjzI2devNBz1zQrb","onwK4e9ZLuTAKqWW03F9","pqHfZKP75CvOlQylNhV4"
  ];

  function updateDesc() {
    var opt = sel.options[sel.selectedIndex];
    ttsVoice = sel.value;
    var label = opt ? opt.text : '';
    var parts = label.split(' — ');
    if (descEl) descEl.textContent = parts.length > 1 ? parts[1] : label;
    // Update play button state
    var canPreview = HAS_PREVIEW.indexOf(sel.value) >= 0;
    if (playBtn) {
      playBtn.classList.toggle('no-preview', !canPreview);
      playBtn.title = canPreview ? 'Preview suara' : 'Preview tidak tersedia';
    }
  }

  sel.addEventListener('change', function() {
    // Stop any playing audio
    if (audio && !audio.paused) { audio.pause(); audio.src = ''; }
    if (playBtn) { playBtn.classList.remove('playing','loading'); playBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><polygon points="2,1 10,5.5 2,10" fill="currentColor"/></svg>'; }
    updateDesc();
  });

  if (playBtn) {
    playBtn.addEventListener('click', function() {
      if (playBtn.classList.contains('no-preview')) return;
      var vid = sel.value;

      if (playBtn.classList.contains('playing')) {
        audio.pause(); audio.src = '';
        playBtn.classList.remove('playing');
        playBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><polygon points="2,1 10,5.5 2,10" fill="currentColor"/></svg>';
        return;
      }

      playBtn.classList.add('loading');
      playBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 8"/></svg>';

      audio.src = '/api/proxy?action=preview&voiceId=' + vid;
      audio.oncanplay = function() {
        playBtn.classList.remove('loading');
        playBtn.classList.add('playing');
        playBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1" y="1" width="3.5" height="9" rx="1" fill="currentColor"/><rect x="6.5" y="1" width="3.5" height="9" rx="1" fill="currentColor"/></svg>';
        audio.play();
      };
      audio.onended = function() {
        playBtn.classList.remove('playing');
        playBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><polygon points="2,1 10,5.5 2,10" fill="currentColor"/></svg>';
      };
      audio.onerror = function() {
        playBtn.classList.remove('loading','playing');
        playBtn.innerHTML = '<svg width="11" height="11" viewBox="0 0 11 11" fill="none"><polygon points="2,1 10,5.5 2,10" fill="currentColor"/></svg>';
        showToast('Preview tidak tersedia untuk voice ini.', 'error');
      };
      audio.load();
    });
  }

  updateDesc();
}


// ── Theme Toggle ──────────────────────────────────────────
(function() {
  var html     = document.documentElement;
  var btn      = document.getElementById('themeToggle');
  var sunIcon  = btn ? btn.querySelector('.icon-sun')  : null;
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
    if (sunIcon)  sunIcon.style.display  = t === 'dark'  ? 'block' : 'none';
    if (moonIcon) moonIcon.style.display = t === 'light' ? 'block' : 'none';
  }
})();
