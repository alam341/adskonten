/* =====================
   AdGen — App Logic
   API key disimpan di Vercel env, tidak ada di browser
   ===================== */

// ---- State ----
let uploadedImageBase64 = null;
let uploadedMimeType    = null;
let selectedModel       = 'gpt-image/1-5-image-to-image';
let selectedRatio       = '1:1';

// ---- DOM refs ----
const imageInput    = document.getElementById('imageInput');
const uploadZone    = document.getElementById('uploadZone');
const uploadEmpty   = document.getElementById('uploadEmpty');
const uploadFilled  = document.getElementById('uploadFilled');
const previewImg    = document.getElementById('previewImg');
const removeImg     = document.getElementById('removeImg');
const promptInput   = document.getElementById('promptInput');
const negInput      = document.getElementById('negInput');
const negTrigger    = document.getElementById('negTrigger');
const negArrow      = document.getElementById('negArrow');
const negBody       = document.getElementById('negBody');
const strengthGroup = document.getElementById('strengthGroup');
const strengthRange = document.getElementById('strengthRange');
const strengthVal   = document.getElementById('strengthVal');
const btnGenerate   = document.getElementById('btnGenerate');
const btnRegenerate = document.getElementById('btnRegenerate');
const btnDownload   = document.getElementById('btnDownload');
const ratioGrid     = document.getElementById('ratioGrid');
const modelList     = document.getElementById('modelList');
const stateEmpty    = document.getElementById('stateEmpty');
const stateLoading  = document.getElementById('stateLoading');
const stateResult   = document.getElementById('stateResult');
const loadingSub    = document.getElementById('loadingSub');
const progressBar   = document.getElementById('progressBar');
const resultImg     = document.getElementById('resultImg');
const resultMeta    = document.getElementById('resultMeta');
const toast         = document.getElementById('toast');

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  syncModel('gpt-image/1-5-image-to-image');
  showState('empty');
});

// ---- Upload ----
uploadZone.addEventListener('click', (e) => {
  if (removeImg.contains(e.target)) return;
  if (uploadFilled.style.display !== 'none') return;
  imageInput.click();
});

uploadEmpty.addEventListener('click', (e) => {
  e.stopPropagation();
  imageInput.click();
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('File terlalu besar. Maks 10MB.', 'error'); return; }
  readFile(file);
});

removeImg.addEventListener('click', (e) => {
  e.stopPropagation();
  uploadedImageBase64 = null;
  uploadedMimeType    = null;
  previewImg.src      = '';
  uploadFilled.style.display = 'none';
  uploadEmpty.style.display  = 'flex';
  imageInput.value = '';
});

uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) readFile(file);
});

function readFile(file) {
  uploadedMimeType = file.type;
  const reader = new FileReader();
  reader.onload = (ev) => {
    uploadedImageBase64 = ev.target.result;
    previewImg.src = uploadedImageBase64;
    uploadEmpty.style.display  = 'none';
    uploadFilled.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// ---- Negative prompt ----
negTrigger.addEventListener('click', () => {
  const open = negBody.style.display !== 'none';
  negBody.style.display = open ? 'none' : 'block';
  negArrow.classList.toggle('open', !open);
});

// ---- Model selection ----
modelList.querySelectorAll('.model-row').forEach(row => {
  row.addEventListener('click', () => {
    row.querySelector('input[type=radio]').checked = true;
    syncModel(row.dataset.model);
  });
});

function syncModel(val) {
  selectedModel = val;
  modelList.querySelectorAll('.model-row').forEach(r => {
    r.classList.toggle('active', r.dataset.model === val);
  });
  strengthGroup.style.display = val === 'qwen/image-to-image' ? 'block' : 'none';
}

// ---- Strength slider ----
strengthRange.addEventListener('input', () => {
  strengthVal.textContent = parseFloat(strengthRange.value).toFixed(2);
});

// ---- Aspect ratio ----
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

  if (!prompt)               { showToast('Tulis deskripsi konten iklanmu dulu.', 'error'); return; }
  if (!uploadedImageBase64)  { showToast('Upload gambar referensi terlebih dahulu.', 'error'); return; }

  showState('loading');
  resetProgress();

  try {
    // 1. Upload gambar ke kie.ai via proxy server
    updateSub('Mengupload gambar referensi...');
    const imageUrl = await uploadViaProxy();

    // 2. Buat task generate via proxy server
    updateSub('Mengirim request ke AI...');
    const { taskId } = await generateViaProxy(imageUrl, prompt);

    // 3. Poll status via proxy server
    updateSub('Menunggu hasil dari AI...');
    const resultUrl = await pollViaProxy(taskId);

    showResult(resultUrl);
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Terjadi kesalahan. Coba lagi.', 'error');
    showState('empty');
  }
}

// ---- Proxy API calls ----

async function uploadViaProxy() {
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: uploadedImageBase64,
      mimeType:    uploadedMimeType || 'image/jpeg',
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Upload gagal (${res.status})`);
  if (!data.url) throw new Error('URL gambar tidak ditemukan setelah upload.');
  return data.url;
}

async function generateViaProxy(imageUrl, prompt) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:     selectedModel,
      imageUrl,
      prompt,
      ratio:     selectedRatio,
      negPrompt: negInput.value.trim(),
      strength:  parseFloat(strengthRange.value),
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request gagal (${res.status})`);
  if (!data.taskId) throw new Error('Task ID tidak ditemukan dari response.');
  return data;
}

async function pollViaProxy(taskId) {
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    updateSub(`Memproses... (${i + 1}/60)`);

    const res = await fetch(`/api/status?taskId=${encodeURIComponent(taskId)}&model=${encodeURIComponent(selectedModel)}`);
    const data = await res.json();

    if (!res.ok) continue;

    const { status, imageUrl } = data;

    if (['SUCCESS', 'success', 'completed', 'COMPLETED'].includes(status)) {
      if (!imageUrl) throw new Error('Generate selesai tapi URL gambar tidak ditemukan.');
      return imageUrl;
    }

    if (['FAILED', 'failed', 'error', 'ERROR'].includes(status)) {
      throw new Error('Generate gagal di server AI. Coba ganti model.');
    }
  }

  throw new Error('Timeout: AI terlalu lama merespons. Coba lagi.');
}

// ---- UI states ----
function showState(s) {
  stateEmpty.style.display   = s === 'empty'   ? 'flex'  : 'none';
  stateLoading.style.display = s === 'loading' ? 'flex'  : 'none';
  stateResult.style.display  = s === 'result'  ? 'flex'  : 'none';
  btnGenerate.disabled = s === 'loading';
}

function resetProgress() {
  progressBar.style.animation = 'none';
  progressBar.offsetHeight; // trigger reflow
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
    a.href     = imgUrl;
    a.download = `adgen-${Date.now()}.jpg`;
    a.target   = '_blank';
    a.click();
  };
}

// ---- Toast ----
let toastTO;
function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.className = `toast show ${type}`;
  clearTimeout(toastTO);
  toastTO = setTimeout(() => toast.classList.remove('show'), 4000);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
