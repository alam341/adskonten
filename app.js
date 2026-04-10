/* =====================
   AdGen — App Logic
   ===================== */

let uploadedImageBase64 = null;
let uploadedMimeType    = null;
let selectedModel       = 'gpt-image/1.5-image-to-image';
let selectedRatio       = '1:1';
let selectedQty         = 1;

const $ = id => document.getElementById(id);

const imageInput    = $('imageInput');
const uploadZone    = $('uploadZone');
const uploadEmpty   = $('uploadEmpty');
const uploadFilled  = $('uploadFilled');
const previewImg    = $('previewImg');
const removeImg     = $('removeImg');
const promptInput   = $('promptInput');
const negInput      = $('negInput');
const negTrigger    = $('negTrigger');
const negArrow      = $('negArrow');
const negBody       = $('negBody');
const strengthGroup = $('strengthGroup');
const strengthRange = $('strengthRange');
const strengthVal   = $('strengthVal');
const btnGenerate   = $('btnGenerate');
const btnRegenerate = $('btnRegenerate');
const btnDownload   = $('btnDownload');
const ratioGrid     = $('ratioGrid');
const modelList     = $('modelList');
const qtyBtns       = document.querySelectorAll('.qty-btn');
const stateEmpty    = $('stateEmpty');
const stateLoading  = $('stateLoading');
const stateResult   = $('stateResult');
const loadingSub    = $('loadingSub');
const progressBar   = $('progressBar');
const resultGrid    = $('resultGrid');
const resultMeta    = $('resultMeta');
const toast         = $('toast');

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  syncModel('gpt-image/1.5-image-to-image');
  showState('empty');
});

// ── Upload ────────────────────────────────────────────────
uploadZone.addEventListener('click', e => {
  if (removeImg.contains(e.target)) return;
  if (uploadFilled.style.display !== 'none') return;
  imageInput.click();
});
uploadEmpty.addEventListener('click', e => { e.stopPropagation(); imageInput.click(); });
imageInput.addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 10 * 1024 * 1024) { showToast('File terlalu besar. Maks 10MB.', 'error'); return; }
  readFile(f);
});
removeImg.addEventListener('click', e => {
  e.stopPropagation();
  uploadedImageBase64 = null; uploadedMimeType = null;
  previewImg.src = '';
  uploadFilled.style.display = 'none';
  uploadEmpty.style.display  = 'flex';
  imageInput.value = '';
});
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('image/')) readFile(f);
});
function readFile(f) {
  uploadedMimeType = f.type;
  const r = new FileReader();
  r.onload = ev => {
    uploadedImageBase64 = ev.target.result;
    previewImg.src = uploadedImageBase64;
    uploadEmpty.style.display  = 'none';
    uploadFilled.style.display = 'block';

    // Auto-detect ratio dari dimensi gambar
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const ratio = w / h;
      let best = '1:1';
      if (ratio < 0.6)       best = '2:3';   // sangat portrait
      else if (ratio < 0.85) best = '4:5';   // portrait
      else if (ratio < 1.15) best = '1:1';   // square
      else if (ratio < 1.45) best = '3:2';   // landscape
      else                   best = '16:9';  // wide
      // Khusus 9:16 (stories) — jika sangat tinggi
      if (ratio < 0.58)      best = '9:16';

      // Set active ratio button
      ratioGrid.querySelectorAll('.ratio-cell').forEach(b => {
        const isMatch = b.dataset.ratio === best;
        b.classList.toggle('active', isMatch);
        if (isMatch) selectedRatio = best;
      });
    };
    img.src = uploadedImageBase64;
  };
  r.readAsDataURL(f);
}

// ── Negative prompt ───────────────────────────────────────
negTrigger.addEventListener('click', () => {
  const open = negBody.style.display !== 'none';
  negBody.style.display = open ? 'none' : 'block';
  negArrow.classList.toggle('open', !open);
});

// ── Model ─────────────────────────────────────────────────
modelList.querySelectorAll('.model-row').forEach(row => {
  row.addEventListener('click', () => {
    row.querySelector('input[type=radio]').checked = true;
    syncModel(row.dataset.model);
  });
});
function syncModel(val) {
  selectedModel = val;
  modelList.querySelectorAll('.model-row').forEach(r => r.classList.toggle('active', r.dataset.model === val));
  strengthGroup.style.display = val === 'qwen/image-to-image' ? 'block' : 'none';
}

// ── Strength ──────────────────────────────────────────────
strengthRange.addEventListener('input', () => {
  strengthVal.textContent = parseFloat(strengthRange.value).toFixed(2);
});

// ── Ratio ─────────────────────────────────────────────────
ratioGrid.querySelectorAll('.ratio-cell').forEach(btn => {
  btn.addEventListener('click', () => {
    ratioGrid.querySelectorAll('.ratio-cell').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRatio = btn.dataset.ratio;
  });
});

// ── Quantity ──────────────────────────────────────────────
qtyBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    qtyBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedQty = parseInt(btn.dataset.qty);
  });
});

// ── Generate ──────────────────────────────────────────────
btnGenerate.addEventListener('click', generate);
btnRegenerate.addEventListener('click', generate);

async function generate() {
  const prompt = promptInput.value.trim();
  if (!prompt)              { showToast('Tulis deskripsi konten iklanmu dulu.', 'error'); return; }
  if (!uploadedImageBase64) { showToast('Upload gambar referensi terlebih dahulu.', 'error'); return; }

  showState('loading');
  resetProgress();

  try {
    // 1. Upload
    updateSub('Mengupload gambar...');
    const uploadRes = await proxyPost('upload', {
      imageBase64: uploadedImageBase64,
      mimeType:    uploadedMimeType || 'image/jpeg',
    });
    if (!uploadRes.url) throw new Error('Upload gagal: URL tidak ditemukan.');

    // 2. Generate (qty tasks sekaligus)
    updateSub(`Mengirim ${selectedQty} request ke AI...`);
    const genRes = await proxyPost('generate', {
      model:     selectedModel,
      imageUrl:  uploadRes.url,
      prompt,
      ratio:     selectedRatio,
      negPrompt: negInput.value.trim(),
      strength:  parseFloat(strengthRange.value),
      quantity:  selectedQty,
    });

    // Flux hanya bisa 1 taskId, market models bisa taskIds[]
    const taskIds = genRes.taskIds || (genRes.taskId ? [genRes.taskId] : []);
    if (!taskIds.length) throw new Error('Generate gagal: taskId tidak ditemukan.');

    // 3. Poll semua task paralel
    updateSub(`Menunggu ${taskIds.length} gambar...`);
    const results = await Promise.allSettled(
      taskIds.map(id => pollStatus(id, genRes.type))
    );

    const urls = results
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => r.value);

    if (!urls.length) throw new Error('Semua generate gagal. Coba lagi.');

    showResult(urls);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Terjadi kesalahan. Coba lagi.', 'error');
    showState('empty');
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
  const res = await fetch(`/api/proxy?${qs}`);
  return await parseRes(res);
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

async function pollStatus(taskId, type) {
  for (let i = 0; i < 60; i++) {
    // Polling lebih cepat di awal, lalu melambat
    await sleep(i < 5 ? 2000 : i < 15 ? 3000 : 5000);
    updateSub(`Memproses... (${i + 1}/60)`);

    const data = await proxyGet('status', { taskId, type: type || 'jobs' });
    const { status, imageUrl, isFail } = data;

    if (['success','SUCCESS','completed','COMPLETED'].includes(status)) {
      if (!imageUrl) throw new Error('Generate selesai tapi URL tidak ditemukan.');
      return imageUrl;
    }
    if (isFail) throw new Error('Generate gagal di AI. Coba ganti model.');
  }
  throw new Error('Timeout. Coba lagi.');
}

// ── UI states ─────────────────────────────────────────────
function showState(s) {
  stateEmpty.style.display   = s === 'empty'   ? 'flex' : 'none';
  stateLoading.style.display = s === 'loading' ? 'flex' : 'none';
  stateResult.style.display  = s === 'result'  ? 'flex' : 'none';
  btnGenerate.disabled = s === 'loading';
}

function resetProgress() {
  progressBar.style.animation = 'none';
  progressBar.offsetHeight;
  progressBar.style.animation = '';
}

function updateSub(t) { loadingSub.textContent = t; }

function showResult(urls) {
  resultGrid.innerHTML = '';

  urls.forEach((url, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'result-item';

    const img = document.createElement('img');
    img.src = url;
    img.alt = `Result ${i + 1}`;

    const btn = document.createElement('button');
    btn.className = 'result-dl-btn';
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 7l3 3 3-3" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M1 12h12" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg> Download`;
    btn.onclick = () => {
      const a = document.createElement('a');
      a.href = url; a.download = `adgen-${Date.now()}-${i+1}.jpg`; a.target = '_blank'; a.click();
    };

    wrap.appendChild(img);
    wrap.appendChild(btn);
    resultGrid.appendChild(wrap);
  });

  showState('result');

  const name = document.querySelector(`.model-row[data-model="${selectedModel}"] .model-row-name`)?.textContent || selectedModel;
  resultMeta.textContent = `${name} · ${selectedRatio} · ${urls.length} gambar · ${new Date().toLocaleTimeString('id-ID')}`;

  // Download all button
  btnDownload.style.display = urls.length > 1 ? 'flex' : 'none';
  btnDownload.onclick = () => urls.forEach((url, i) => {
    setTimeout(() => {
      const a = document.createElement('a');
      a.href = url; a.download = `adgen-${Date.now()}-${i+1}.jpg`; a.target = '_blank'; a.click();
    }, i * 300);
  });
}

// ── Toast ─────────────────────────────────────────────────
let toastTO;
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTO);
  toastTO = setTimeout(() => toast.classList.remove('show'), 5000);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
