/* =====================
   AdGen — App Logic
   ===================== */

let uploadedImageBase64 = null;
let uploadedMimeType    = null;
let selectedModel       = 'gpt-image/1.5-image-to-image';
let selectedRatio       = '1:1';

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
const stateEmpty    = $('stateEmpty');
const stateLoading  = $('stateLoading');
const stateResult   = $('stateResult');
const loadingSub    = $('loadingSub');
const progressBar   = $('progressBar');
const resultImg     = $('resultImg');
const resultMeta    = $('resultMeta');
const toast         = $('toast');

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  syncModel('gpt-image/1.5-image-to-image');
  showState('empty');
});

// ---- Upload ----
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
  };
  r.readAsDataURL(f);
}

// ---- Negative prompt ----
negTrigger.addEventListener('click', () => {
  const open = negBody.style.display !== 'none';
  negBody.style.display = open ? 'none' : 'block';
  negArrow.classList.toggle('open', !open);
});

// ---- Model ----
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

// ---- Strength ----
strengthRange.addEventListener('input', () => {
  strengthVal.textContent = parseFloat(strengthRange.value).toFixed(2);
});

// ---- Ratio ----
ratioGrid.querySelectorAll('.ratio-cell').forEach(btn => {
  btn.addEventListener('click', () => {
    ratioGrid.querySelectorAll('.ratio-cell').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRatio = btn.dataset.ratio;
  });
});

// ---- Generate ----
btnGenerate.addEventListener('click', generate);
btnRegenerate.addEventListener('click', generate);

async function generate() {
  const prompt = promptInput.value.trim();
  if (!prompt)              { showToast('Tulis deskripsi konten iklanmu dulu.', 'error'); return; }
  if (!uploadedImageBase64) { showToast('Upload gambar referensi terlebih dahulu.', 'error'); return; }

  showState('loading');
  resetProgress();

  try {
    // 1. Upload gambar
    updateSub('Mengupload gambar...');
    const uploadRes = await proxyPost('upload', {
      imageBase64: uploadedImageBase64,
      mimeType:    uploadedMimeType || 'image/jpeg',
    });
    if (!uploadRes.url) throw new Error('Upload gagal: URL tidak ditemukan.');

    // 2. Generate
    updateSub('Mengirim ke AI...');
    const genRes = await proxyPost('generate', {
      model:     selectedModel,
      imageUrl:  uploadRes.url,
      prompt,
      ratio:     selectedRatio,
      negPrompt: negInput.value.trim(),
      strength:  parseFloat(strengthRange.value),
    });
    if (!genRes.taskId) throw new Error('Generate gagal: taskId tidak ditemukan.');

    // 3. Poll
    updateSub('Menunggu hasil...');
    const resultUrl = await pollStatus(genRes.taskId, genRes.type);

    showResult(resultUrl);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Terjadi kesalahan. Coba lagi.', 'error');
    showState('empty');
  }
}

// ---- Proxy helpers ----

async function proxyPost(action, body) {
  const res = await fetch(`/api/proxy?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await parseResponse(res);
}

async function proxyGet(action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`/api/proxy?${qs}`);
  return await parseResponse(res);
}

async function parseResponse(res) {
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const text = await res.text();
    throw new Error(`Server error (${res.status}): ${text.slice(0, 150)}`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

async function pollStatus(taskId) {
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    updateSub(`Memproses... (${i + 1}/60)`);

    const data = await proxyGet('status', {
      taskId,
      model: selectedModel,
    });

    const { status, imageUrl } = data;
    const DONE = ['SUCCESS', 'success', 'completed', 'COMPLETED'];
    const FAIL = ['FAILED', 'failed', 'error', 'ERROR'];

    if (DONE.includes(status)) {
      if (!imageUrl) throw new Error('Generate selesai tapi URL gambar tidak ditemukan.');
      return imageUrl;
    }
    if (FAIL.includes(status)) throw new Error('Generate gagal di sisi AI. Coba ganti model.');
  }
  throw new Error('Timeout: AI terlalu lama. Coba lagi.');
}

// ---- UI ----
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

function showResult(imgUrl) {
  resultImg.src = imgUrl;
  resultImg.onload = () => {
    showState('result');
    const name = document.querySelector(`.model-row[data-model="${selectedModel}"] .model-row-name`)?.textContent || selectedModel;
    resultMeta.textContent = `${name} · ${selectedRatio} · ${new Date().toLocaleTimeString('id-ID')}`;
  };
  btnDownload.onclick = () => {
    const a = document.createElement('a');
    a.href = imgUrl; a.download = `adgen-${Date.now()}.jpg`; a.target = '_blank'; a.click();
  };
}

let toastTO;
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTO);
  toastTO = setTimeout(() => toast.classList.remove('show'), 5000);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
