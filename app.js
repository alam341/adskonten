/* AdGen — App Logic with Auth + History */

var uploadedImageBase64 = null, uploadedMimeType = null;
var vidBase64 = null, vidMime = null;
var imgModel = 'gpt-image/1.5-image-to-image';
var vidModel = 'kling-2.6/image-to-video';
var ttsModel = 'elevenlabs/text-to-speech-multilingual-v2';
var ttsVoice = '21m00Tcm4TlvDq8ikWAM';
var ttsSpeed = 1.0, ttsStability = 0.5;
var imgRatio = '1:1', vidDuration = '5', vidResolution = '720p', imgQty = 1;
var activeTab = 'image', activeView = 'app'; // 'app' or 'history'
var previewUrls = [], previewIdx = 0;
var currentUser = null, authToken = null, currentProfile = null;
var cloneRefBase64 = null, cloneRefMime = null;
var cloneProdBase64 = null, cloneProdMime = null;
var cloneModel = 'gpt-image/1.5-image-to-image';
var cloneRatio = '1:1';

function $(id) { return document.getElementById(id); }

document.addEventListener('DOMContentLoaded', function() {
  setupTabs();
  setupUpload('img', function(v){ uploadedImageBase64=v; }, function(m){ uploadedMimeType=m; }, 'imgRatioGrid', function(r){ imgRatio=r; });
  setupUpload('vid', function(v){ vidBase64=v; }, function(m){ vidMime=m; }, null, null);
  setupModelList('imgModelList', function(m){
    imgModel=m;
    var isGrok = m==='grok-imagine/image-to-image';
    var grid = $('imgRatioGrid'), note = $('grokRatioNote');
    if (grid) { grid.style.opacity=isGrok?'0.3':'1'; grid.style.pointerEvents=isGrok?'none':''; }
    if (note) note.style.display=isGrok?'block':'none';
  });
  setupModelList('vidModelList', function(m){ vidModel=m; });
  setupModelList('ttsModelList', function(m){ ttsModel=m; });
  setupRatioGrid('imgRatioGrid', function(v){ imgRatio=v; });
  setupRatioGrid('vidDurationGrid', function(v){ vidDuration=v; }, 'dur');
  setupResGrid();
  setupQty();
  setupNegToggle('imgNegTrigger','imgNegArrow','imgNegBody');
  setupStrengthSlider('imgStrength','imgStrengthVal');
  setupStrengthSlider('ttsSpeed','ttsSpeedVal', function(v){ ttsSpeed=v; }, function(v){ return parseFloat(v).toFixed(1)+'x'; });
  setupStrengthSlider('ttsStability','ttsStabilityVal', function(v){ ttsStability=v; });
  setupVoiceDropdown();
  setupModal();
  setupCharCounter();
  setupAuth();
  showState('empty');

  setupUpload('cloneRef', function(v){ cloneRefBase64=v; }, function(m){ cloneRefMime=m; }, null, null);
  setupUpload('cloneProd', function(v){ cloneProdBase64=v; }, function(m){ cloneProdMime=m; }, null, null);
  setupModelList('cloneModelList', function(m){ cloneModel=m; });
  setupRatioGrid('cloneRatioGrid', function(v){ cloneRatio=v; });
  $('cloneBtnRegenerate') && $('cloneBtnRegenerate').addEventListener('click', generate);
  $('btnGenerate') && $('btnGenerate').addEventListener('click', generate);
  $('imgBtnRegenerate') && $('imgBtnRegenerate').addEventListener('click', generate);
  $('vidBtnRegenerate') && $('vidBtnRegenerate').addEventListener('click', generate);
  $('musicBtnRegenerate') && $('musicBtnRegenerate').addEventListener('click', generate);
  $('btnHistory') && $('btnHistory').addEventListener('click', function() { showView('history'); loadHistory(); });
  $('btnAdmin') && $('btnAdmin').addEventListener('click', function() { showView('admin'); loadAdminUsers('pending'); });
  $('btnBackFromAdmin') && $('btnBackFromAdmin').addEventListener('click', function() { showView('app'); });
  $('btnBackToApp') && $('btnBackToApp').addEventListener('click', function() { showView('app'); });
});

// ── Views ─────────────────────────────────────────────────
function showView(v) {
  activeView = v;
  var appLayout = document.querySelector('.app-layout');
  var historyView = $('historyView');
  var adminView = $('adminView');
  if (appLayout) appLayout.style.display = v==='app' ? 'flex' : 'none';
  if (historyView) historyView.style.display = v==='history' ? 'flex' : 'none';
  if (adminView) adminView.style.display = v==='admin' ? 'flex' : 'none';
}

// ── Auth ──────────────────────────────────────────────────
function setupAuth() {
  // Show login screen by default, check token
  showLoginScreen();
  var saved = localStorage.getItem('adstudio_token');
  if (saved) { authToken = saved; fetchMe(); }

  $('btnLogin') && $('btnLogin').addEventListener('click', doLogin);
  $('btnRegister') && $('btnRegister').addEventListener('click', doRegister);
  $('btnLogout') && $('btnLogout').addEventListener('click', doLogout);
  $('authTabLogin') && $('authTabLogin').addEventListener('click', function() { switchAuthTab('login'); });
  $('authTabRegister') && $('authTabRegister').addEventListener('click', function() { switchAuthTab('register'); });

  // Enter key support
  [$('loginPassword'), $('loginEmail')].forEach(function(el) {
    el && el.addEventListener('keydown', function(e) { if (e.key==='Enter') doLogin(); });
  });
  [$('registerPassword'), $('registerEmail')].forEach(function(el) {
    el && el.addEventListener('keydown', function(e) { if (e.key==='Enter') doRegister(); });
  });
}

function showLoginScreen() {
  var ls = $('loginScreen'), al = $('appLayout'), hv = $('historyView');
  if (ls) ls.style.display = 'flex';
  if (al) al.style.display = 'none';
  if (hv) hv.style.display = 'none';
}

function showAppScreen() {
  var ls = $('loginScreen'), al = $('appLayout');
  if (ls) ls.style.display = 'none';
  if (al) al.style.display = 'flex';
}

function switchAuthTab(t) {
  $('authTabLogin').classList.toggle('active', t==='login');
  $('authTabRegister').classList.toggle('active', t==='register');
  $('authFormLogin').style.display = t==='login' ? 'block' : 'none';
  $('authFormRegister').style.display = t==='register' ? 'block' : 'none';
}

async function fetchMe() {
  try {
    var d = await proxyGet('me');
    setUser(d.user, d.profile);
  } catch(e) { clearUser(); }
}

async function doLogin() {
  var username = $('loginEmail').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  var pass     = $('loginPassword').value;
  if (!username || !pass) { showToast('Isi username dan password.', 'error'); return; }
  var email = username + '@adgen.local';
  $('btnLogin').disabled = true;
  try {
    var d = await proxyPost('login', { email, password: pass });
    authToken = d.access_token;
    localStorage.setItem('adstudio_token', authToken);
    setUser(d.user, d.profile);
    showToast('Login berhasil!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
  $('btnLogin').disabled = false;
}

async function doRegister() {
  var raw      = $('registerEmail').value.trim();
  var username = raw.toLowerCase().replace(/[^a-z0-9_]/g, '');
  var pass     = $('registerPassword').value;
  if (!username) { showToast('Username hanya boleh huruf, angka, dan _.', 'error'); return; }
  if (username.length < 3) { showToast('Username minimal 3 karakter.', 'error'); return; }
  if (!pass || pass.length < 6) { showToast('Password minimal 6 karakter.', 'error'); return; }
  var email = username + '@adgen.local';
  $('btnRegister').disabled = true;
  try {
    await proxyPost('register', { email, password: pass });
    showToast('Daftar berhasil! Silakan login.', 'success');
    $('loginEmail').value = raw;
    switchAuthTab('login');
  } catch(e) { showToast(e.message, 'error'); }
  $('btnRegister').disabled = false;
}

function doLogout() {
  authToken = null; currentUser = null;
  localStorage.removeItem('adstudio_token');
  clearUser();
  showToast('Logout berhasil.', 'success');
  if (activeView === 'history') showView('app');
}

function setUser(user, profile) {
  currentUser = user; currentProfile = profile;
  var emailEl = $('userEmail');
  if (emailEl) emailEl.textContent = profile ? profile.username : (user.email||'').replace('@adgen.local','');
  var btnAuth = $('btnAuthToggle');
  if (btnAuth) btnAuth.style.display = 'none';
  var userInfo = $('userInfo');
  if (userInfo) userInfo.style.display = 'flex';
  var btnHist = $('btnHistory');
  if (btnHist) btnHist.style.display = 'flex';
  var btnAdmin = $('btnAdmin');
  if (btnAdmin) btnAdmin.style.display = profile && profile.is_admin ? 'flex' : 'none';
  showAppScreen();
}

function clearUser() {
  currentUser = null; authToken = null;
  var btnAuth = $('btnAuthToggle');
  if (btnAuth) btnAuth.style.display = 'flex';
  var userInfo = $('userInfo');
  if (userInfo) userInfo.style.display = 'none';
  var btnHist = $('btnHistory');
  if (btnHist) btnHist.style.display = 'none';
  showLoginScreen();
}

// ── Save to history ───────────────────────────────────────
async function saveToHistory(type, model, prompt, ratio, resultUrls) {
  if (!authToken || !resultUrls || !resultUrls.length) return;
  try {
    await proxyPost('saveResult', { type, model, prompt, ratio, resultUrls }, authToken);
  } catch(e) { console.warn('Save history gagal:', e.message); }
}

// ── Load History ──────────────────────────────────────────
var historyPage = 1;
async function loadHistory(page) {
  page = page || 1; historyPage = page;
  var grid = $('historyGrid');
  var empty = $('historyEmpty');
  if (!grid) return;
  if (page === 1) grid.innerHTML = '<div class="history-loading">Memuat...</div>';

  try {
    var d = await proxyGet('history', { page }, authToken);
    var items = d.histories || [];
    if (page === 1) grid.innerHTML = '';
    if (!items.length && page === 1) {
      grid.innerHTML = '';
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';
    items.forEach(function(item) {
      var urls = item.storage_urls && item.storage_urls.length ? item.storage_urls : (item.result_urls || []);
      urls.forEach(function(url, i) {
        var card = document.createElement('div');
        card.className = 'history-card';
        var isVideo = url.includes('.mp4');
        var isAudio = url.includes('.mp3');
        var thumb = isVideo
          ? '<div class="history-thumb-placeholder">🎬</div>'
          : isAudio
            ? '<div class="history-thumb-placeholder">🔊</div>'
            : '<img src="'+url+'" loading="lazy" />';
        card.innerHTML = thumb +
          '<div class="history-card-info">' +
            '<div class="history-card-type">'+item.type+'</div>' +
            '<div class="history-card-model">'+(item.model||'')+'</div>' +
            '<div class="history-card-date">'+new Date(item.created_at).toLocaleDateString('id-ID')+'</div>' +
          '</div>' +
          '<div class="history-card-actions">' +
            '<a href="'+url+'" download target="_blank" class="btn-dl-hist" title="Download">⬇</a>' +
            (i===0 ? '<button class="btn-del-hist" data-id="'+item.id+'" title="Hapus">🗑</button>' : '') +
          '</div>';
        grid.appendChild(card);
      });
    });

    // Delete handlers
    grid.querySelectorAll('.btn-del-hist').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        if (!confirm('Hapus dari history?')) return;
        try {
          await proxyDelete('historyDelete', { id: btn.dataset.id }, authToken);
          btn.closest('.history-card').remove();
          showToast('Dihapus.', 'success');
        } catch(e) { showToast(e.message, 'error'); }
      });
    });

    // Load more
    var loadMore = $('historyLoadMore');
    if (loadMore) loadMore.style.display = items.length >= 20 ? 'block' : 'none';

  } catch(e) { grid.innerHTML = ''; showToast('Gagal load history: '+e.message, 'error'); }
}

// ── Tabs ──────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab===activeTab); });
      document.querySelectorAll('.tab-panel').forEach(function(p) { p.style.display = p.dataset.panel===activeTab ? 'block':'none'; });
      var labels = { image:'Generate Gambar', video:'Generate Video', music:'Generate Speech', clone:'Clone Style' };
      $('btnGenerateLabel') && ($('btnGenerateLabel').textContent = labels[activeTab]||'Generate');
      var titles = { image:'Generate Konten Iklan — Gambar', video:'Generate Konten Iklan — Video', music:'Generate Narasi / Voice Over', clone:'Clone Style Iklan Kompetitor' };
      $('emptyTitle') && ($('emptyTitle').textContent = titles[activeTab]||'');
      showState('empty');
    });
  });
}

// ── Upload ────────────────────────────────────────────────
function setupUpload(prefix, setBase64, setMime, ratioGridId, setRatio) {
  var zone=$(prefix+'UploadZone'), input=$(prefix+'Input'), empty=$(prefix+'UploadEmpty');
  var filled=$(prefix+'UploadFilled'), preview=$(prefix+'Preview'), remove=$(prefix+'Remove');
  if (!zone) return;
  zone.addEventListener('click', function(e) { if (remove.contains(e.target)||filled.style.display!=='none') return; input.click(); });
  empty.addEventListener('click', function(e) { e.stopPropagation(); input.click(); });
  input.addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size>10*1024*1024) { showToast('Maks 10MB.','error'); return; }
    setMime(f.type);
    var r = new FileReader();
    r.onload = function(ev) {
      setBase64(ev.target.result); preview.src=ev.target.result;
      empty.style.display='none'; filled.style.display='block';
      if (ratioGridId && setRatio) {
        var img=new Image();
        img.onload=function() {
          var ratio=img.naturalWidth/img.naturalHeight;
          var best=ratio<0.58?'9:16':ratio<0.85?'4:5':ratio<1.15?'1:1':ratio<1.45?'3:2':'16:9';
          document.querySelectorAll('#'+ratioGridId+' .ratio-cell').forEach(function(b){ b.classList.toggle('active',b.dataset.ratio===best); });
          setRatio(best);
        }; img.src=ev.target.result;
      }
    }; r.readAsDataURL(f);
  });
  remove.addEventListener('click', function(e) { e.stopPropagation(); setBase64(null); setMime(null); preview.src=''; filled.style.display='none'; empty.style.display='flex'; input.value=''; });
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', function(e) { e.preventDefault(); zone.classList.remove('drag-over'); var f=e.dataTransfer.files[0]; if (f&&f.type.startsWith('image/')) { input.files=e.dataTransfer.files; input.dispatchEvent(new Event('change')); } });
}

function setupModelList(listId, onChange) {
  var list=document.getElementById(listId); if (!list) return;
  list.querySelectorAll('.model-row').forEach(function(row) {
    row.addEventListener('click', function() {
      var radio=row.querySelector('input[type=radio]'); if (radio) radio.checked=true;
      list.querySelectorAll('.model-row').forEach(function(r){ r.classList.toggle('active',r===row); });
      onChange(row.dataset.model);
    });
  });
}

function setupRatioGrid(gridId, onChange, dataKey) {
  var grid=document.getElementById(gridId); if (!grid) return;
  grid.querySelectorAll('.ratio-cell').forEach(function(btn) {
    btn.addEventListener('click', function() { grid.querySelectorAll('.ratio-cell').forEach(function(b){ b.classList.remove('active'); }); btn.classList.add('active'); onChange(btn.dataset[dataKey||'ratio']); });
  });
}

function setupResGrid() {
  document.querySelectorAll('[data-res]').forEach(function(btn) {
    btn.addEventListener('click', function() { document.querySelectorAll('[data-res]').forEach(function(b){ b.classList.remove('active'); }); btn.classList.add('active'); vidResolution=btn.dataset.res; });
  });
}

function setupNegToggle(triggerId, arrowId, bodyId) {
  var trigger=$(triggerId), arrow=$(arrowId), body=$(bodyId); if (!trigger) return;
  trigger.addEventListener('click', function() { var open=body.style.display!=='none'; body.style.display=open?'none':'block'; if(arrow) arrow.classList.toggle('open',!open); });
}

function setupStrengthSlider(rangeId, valId, onChange, formatter) {
  var el=$(rangeId), valEl=$(valId); if (!el||!valEl) return;
  el.addEventListener('input', function() { var v=parseFloat(el.value); valEl.textContent=formatter?formatter(v):v.toFixed(2); if(onChange) onChange(v); });
}

function setupQty() {
  var input=$('imgQtyInput'), dec=$('imgQtyDec'), inc=$('imgQtyInc'), disp=$('imgQtyDisplay'); if (!input) return;
  function update(val) { var v=Math.max(1,Math.min(20,parseInt(val)||1)); input.value=v; if(disp) disp.textContent=v; imgQty=v; }
  input.addEventListener('input', function(){ update(input.value); });
  input.addEventListener('blur',  function(){ update(input.value); });
  dec.addEventListener('click', function(){ update(parseInt(input.value)-1); });
  inc.addEventListener('click', function(){ update(parseInt(input.value)+1); });
}

function setupCharCounter() {
  var ta=$('musicPrompt'), cc=$('ttsCharCount'); if (!ta||!cc) return;
  ta.addEventListener('input', function(){ cc.textContent=ta.value.length+' karakter'; });
}

// ── Voice Dropdown ────────────────────────────────────────
function setupVoiceDropdown() {
  var sel=$('ttsVoiceSelect'), playBtn=$('voicePlayBtn'), descEl=$('voiceSelectDesc'), audio=$('voicePreviewAudio');
  if (!sel) return;
  var PLAY='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><polygon points="3,1.5 11.5,6.5 3,11.5" fill="currentColor"/></svg>';
  var PAUSE='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/><rect x="7.5" y="1.5" width="3.5" height="10" rx="1" fill="currentColor"/></svg>';
  var LOAD='<svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="1.5" stroke-dasharray="8 8"/></svg>';
  function updateDesc() {
    var opt=sel.options[sel.selectedIndex]; ttsVoice=sel.value;
    if (descEl) { var parts=(opt?opt.text:'').split(' \u2014 '); descEl.textContent=parts.length>1?parts[1]:parts[0]; }
  }
  sel.addEventListener('change', function() {
    if (audio&&!audio.paused){audio.pause();audio.src='';}
    if (playBtn){playBtn.classList.remove('playing','loading');playBtn.innerHTML=PLAY+' Preview Suara';}
    updateDesc();
  });
  if (playBtn) {
    playBtn.addEventListener('click', function() {
      var vid=sel.value; if (!vid) return;
      if (playBtn.classList.contains('playing')) { audio.pause();audio.src='';playBtn.classList.remove('playing');playBtn.innerHTML=PLAY+' Preview Suara'; return; }
      playBtn.classList.add('loading'); playBtn.innerHTML=LOAD+' Loading...';
      audio.src='/api/proxy?action=preview&voiceId='+vid;
      audio.oncanplay=function(){ playBtn.classList.remove('loading');playBtn.classList.add('playing');playBtn.innerHTML=PAUSE+' Stop';audio.play(); };
      audio.onended=function(){ playBtn.classList.remove('playing');playBtn.innerHTML=PLAY+' Preview Suara'; };
      audio.onerror=function(){ playBtn.classList.remove('loading','playing');playBtn.innerHTML=PLAY+' Preview Suara';showToast('Preview tidak tersedia.','error'); };
      audio.load();
    });
  }
  updateDesc();
}

// ── Generate ──────────────────────────────────────────────
function generate() {
  if (activeTab==='image') generateImage();
  if (activeTab==='video') generateVideo();
  if (activeTab==='music') generateSpeech();
  if (activeTab==='clone') generateClone();
}

async function generateImage() {
  var prompt=$('imgPrompt')?$('imgPrompt').value.trim():'';
  if (!prompt) { showToast('Tulis deskripsi dulu.','error'); return; }
  if (!uploadedImageBase64) { showToast('Upload gambar referensi dulu.','error'); return; }
  showState('loading'); resetProgress();
  try {
    updateSub('Mengupload gambar...');
    var up=await proxyPost('upload',{imageBase64:uploadedImageBase64,mimeType:uploadedMimeType||'image/jpeg',type:'image'});
    if (!up.url) throw new Error('Upload gagal.');
    updateSub('Mengirim ke AI...');
    var neg=$('imgNegPrompt')?$('imgNegPrompt').value.trim():'';
    var str=$('imgStrength')?parseFloat($('imgStrength').value):0.8;
    var gen=await proxyPost('generate',{type:'image',model:imgModel,imageUrl:up.url,prompt,ratio:imgRatio,negPrompt:neg,strength:str,quantity:imgQty});
    var taskIds=gen.taskIds||(gen.taskId?[gen.taskId]:[]);
    if (!taskIds.length) throw new Error('taskId tidak ditemukan.');
    var urls=[];
    for (var ti=0;ti<taskIds.length;ti++) {
      updateSub('Mengambil gambar '+(ti+1)+' dari '+taskIds.length+'...');
      try {
        var result=await pollStatus(taskIds[ti],gen.taskType||'jobs',90);
        if (Array.isArray(result)) urls=urls.concat(result);
        else if (result) urls.push(result);
        if (urls.length>0) showImageResult(urls);
      } catch(e) { console.warn('Task gagal:',e.message); }
    }
    if (!urls.length) throw new Error('Semua generate gagal.');
    showImageResult(urls);
    saveToHistory('image',imgModel,prompt,imgRatio,urls);
  } catch(err) { console.error(err); showToast(err.message,'error'); showState('empty'); }
}

async function generateClone() {
  var prompt = $('clonePrompt') ? $('clonePrompt').value.trim() : '';
  if (!cloneRefBase64)  { showToast('Upload iklan kompetitor dulu.', 'error'); return; }
  if (!cloneProdBase64) { showToast('Upload foto produk dulu.', 'error'); return; }
  if (!prompt)          { showToast('Isi info produk & iklan dulu.', 'error'); return; }
  showState('loading'); resetProgress();
  try {
    updateSub('Mengupload gambar referensi...');
    var upRef  = await proxyPost('upload', { imageBase64: cloneRefBase64,  mimeType: cloneRefMime||'image/jpeg',  type: 'image' });
    var upProd = await proxyPost('upload', { imageBase64: cloneProdBase64, mimeType: cloneProdMime||'image/jpeg', type: 'image' });
    if (!upRef.url || !upProd.url) throw new Error('Upload gagal.');

    // Build prompt yang instruksikan AI untuk clone style
    var clonePromptFull = 'Analyze the style, layout, color scheme, typography, composition, and visual elements of the REFERENCE AD image. ' +
      'Then create a new advertisement for MY PRODUCT using the EXACT SAME visual style, layout structure, and design language as the reference. ' +
      'Keep all the visual style elements but replace with my product and brand. ' +
      'Product info: ' + prompt + '. ' +
      'Use the product image provided. Make it look professional and ready for social media advertising.';

    updateSub('Mengirim ke AI...');
    var gen = await proxyPost('generate', {
      type: 'image',
      model: cloneModel,
      imageUrl: upRef.url,      // referensi style (gambar utama)
      secondImageUrl: upProd.url, // foto produk
      prompt: clonePromptFull,
      ratio: cloneRatio,
      quantity: 1,
    });

    var taskIds = gen.taskIds || (gen.taskId ? [gen.taskId] : []);
    if (!taskIds.length) throw new Error('taskId tidak ditemukan.');

    updateSub('Generating clone style...');
    var urls = [];
    for (var ti = 0; ti < taskIds.length; ti++) {
      try {
        var result = await pollStatus(taskIds[ti], gen.taskType||'jobs', 150);
        if (Array.isArray(result)) urls = urls.concat(result);
        else if (result) urls.push(result);
      } catch(e) { console.warn(e.message); }
    }
    if (!urls.length) throw new Error('Generate gagal.');

    // Show in clone result
    var grid = $('cloneResultGrid');
    if (grid) {
      grid.innerHTML = '';
      urls.forEach(function(url, i) {
        var wrap = document.createElement('div'); wrap.className = 'result-item';
        var img = document.createElement('img'); img.src = url; img.loading = 'lazy';
        var overlay = document.createElement('div'); overlay.className = 'result-overlay';
        overlay.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="white" stroke-width="1.5"/><path d="M8 11h6M11 8v6" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg><span>Lihat</span>';
        wrap.addEventListener('click', function(){ openModal(urls, i); });
        wrap.appendChild(img); wrap.appendChild(overlay); grid.appendChild(wrap);
      });
    }
    showState('clone');
    $('cloneResultMeta') && ($('cloneResultMeta').textContent = cloneModel + ' · ' + cloneRatio + ' · ' + new Date().toLocaleTimeString('id-ID'));
    var dlAll = $('cloneBtnDownloadAll');
    if (dlAll) {
      dlAll.style.display = urls.length > 1 ? 'flex' : 'none';
      dlAll.onclick = function() { urls.forEach(function(url,i){ setTimeout(function(){ var a=document.createElement('a');a.href=url;a.download='clone-'+(i+1)+'.jpg';a.target='_blank';a.click(); },i*300); }); };
    }
    saveToHistory('image', cloneModel, clonePromptFull, cloneRatio, urls);
  } catch(err) { console.error(err); showToast(err.message, 'error'); showState('empty'); }
}

async function generateVideo() {
  var prompt=$('vidPrompt')?$('vidPrompt').value.trim():'';
  if (!prompt) { showToast('Tulis deskripsi gerakan dulu.','error'); return; }
  if (!vidBase64) { showToast('Upload gambar referensi dulu.','error'); return; }
  showState('loading'); resetProgress();
  try {
    updateSub('Mengupload gambar...');
    var up=await proxyPost('upload',{imageBase64:vidBase64,mimeType:vidMime||'image/jpeg',type:'video'});
    if (!up.url) throw new Error('Upload gagal.');
    updateSub('Mengirim ke AI video...');
    var gen=await proxyPost('generate',{type:'video',model:vidModel,imageUrl:up.url,prompt,duration:vidDuration,resolution:vidResolution});
    if (!gen.taskId) throw new Error('taskId tidak ditemukan.');
    updateSub('Rendering video...');
    var videoUrl=await pollStatus(gen.taskId,'jobs',120);
    showVideoResult(videoUrl);
    saveToHistory('video',vidModel,prompt,'',Array.isArray(videoUrl)?videoUrl:[videoUrl]);
  } catch(err) { console.error(err); showToast(err.message,'error'); showState('empty'); }
}

async function generateSpeech() {
  var text=$('musicPrompt')?$('musicPrompt').value.trim():'';
  if (!text) { showToast('Tulis teks narasi dulu.','error'); return; }
  showState('loading'); resetProgress();
  try {
    updateSub('Mengirim ke ElevenLabs...');
    var gen=await proxyPost('generate',{type:'speech',text,model:ttsModel,voice:ttsVoice,speed:ttsSpeed,stability:ttsStability,languageCode:''});
    if (!gen.taskId) throw new Error('taskId tidak ditemukan.');
    updateSub('Generating suara...');
    var audioUrl=await pollStatus(gen.taskId,'jobs',30);
    showSpeechResult(audioUrl);
    saveToHistory('speech',ttsModel,text,'',Array.isArray(audioUrl)?audioUrl:[audioUrl]);
  } catch(err) { console.error(err); showToast(err.message,'error'); showState('empty'); }
}

// ── Proxy helpers ─────────────────────────────────────────
async function proxyPost(action, body, token) {
  var headers={'Content-Type':'application/json'};
  if (token) headers['Authorization']='Bearer '+token;
  else if (authToken) headers['Authorization']='Bearer '+authToken;
  var res=await fetch('/api/proxy?action='+action,{method:'POST',headers,body:JSON.stringify(body)});
  return await parseRes(res);
}
async function proxyGet(action, params, token) {
  var p=Object.assign({action},params||{});
  var qs=new URLSearchParams(p).toString();
  var headers={};
  if (token) headers['Authorization']='Bearer '+token;
  else if (authToken) headers['Authorization']='Bearer '+authToken;
  return await parseRes(await fetch('/api/proxy?'+qs,{headers}));
}
async function proxyDelete(action, params, token) {
  var qs=new URLSearchParams(Object.assign({action},params||{})).toString();
  var headers={};
  if (token) headers['Authorization']='Bearer '+token;
  return await parseRes(await fetch('/api/proxy?'+qs,{method:'DELETE',headers}));
}
async function parseRes(res) {
  var ct=res.headers.get('content-type')||'';
  if (!ct.includes('application/json')) { var t=await res.text(); throw new Error('Server error ('+res.status+'): '+t.slice(0,150)); }
  var data=await res.json();
  if (!res.ok) throw new Error(data.error||'Error '+res.status);
  return data;
}
async function pollStatus(taskId, type, maxAttempts) {
  maxAttempts=maxAttempts||60;
  for (var i=0;i<maxAttempts;i++) {
    await sleep(i<5?2000:i<15?3000:5000);
    updateSub('Memproses... ('+(i+1)+'/'+maxAttempts+')');
    var data=await proxyGet('status',{taskId,type});
    if (['success','SUCCESS','completed','COMPLETED'].indexOf(data.status)>=0) {
      if (data.imageUrls&&data.imageUrls.length>1) return data.imageUrls;
      var url=data.imageUrl||data.videoUrl;
      if (!url) throw new Error('Hasil tidak ditemukan.');
      return url;
    }
    if (data.isFail) throw new Error('Generate gagal. Coba ganti model.');
  }
  throw new Error('Timeout. Coba lagi.');
}

// ── Results ───────────────────────────────────────────────
function showState(s) {
  $('stateEmpty')        && ($('stateEmpty').style.display        = s==='empty'  ?'flex':'none');
  $('stateLoading')      && ($('stateLoading').style.display      = s==='loading'?'flex':'none');
  $('stateResultImg')    && ($('stateResultImg').style.display    = s==='img'    ?'flex':'none');
  $('stateResultVid')    && ($('stateResultVid').style.display    = s==='vid'    ?'flex':'none');
  $('stateResultMusic')  && ($('stateResultMusic').style.display  = s==='music'  ?'flex':'none');
  $('stateResultClone')  && ($('stateResultClone').style.display  = s==='clone'  ?'flex':'none');
  $('btnGenerate')       && ($('btnGenerate').disabled            = s==='loading');
}
function resetProgress() { var pb=$('progressBar'); if(!pb)return; pb.style.animation='none';pb.offsetHeight;pb.style.animation=''; }
function updateSub(t) { $('loadingSub')&&($('loadingSub').textContent=t); }

function showImageResult(urls) {
  var grid=$('imgResultGrid'); if(!grid)return; grid.innerHTML='';
  urls.forEach(function(url,i) {
    var wrap=document.createElement('div'); wrap.className='result-item';
    var img=document.createElement('img'); img.src=url; img.loading='lazy';
    var overlay=document.createElement('div'); overlay.className='result-overlay';
    overlay.innerHTML='<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="white" stroke-width="1.5"/><path d="M8 11h6M11 8v6" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg><span>Lihat</span>';
    wrap.addEventListener('click', function(){ openModal(urls,i); });
    wrap.appendChild(img); wrap.appendChild(overlay); grid.appendChild(wrap);
  });
  showState('img');
  var name=document.querySelector('#imgModelList .model-row.active .model-row-name');
  $('imgResultMeta')&&($('imgResultMeta').textContent=(name?name.textContent:imgModel)+' · '+imgRatio+' · '+urls.length+' gambar · '+new Date().toLocaleTimeString('id-ID'));
  var dlAll=$('imgBtnDownloadAll');
  if (dlAll) { dlAll.style.display=urls.length>1?'flex':'none'; dlAll.onclick=function(){ urls.forEach(function(url,i){ setTimeout(function(){ var a=document.createElement('a');a.href=url;a.download='adgen-'+(i+1)+'.jpg';a.target='_blank';a.click(); },i*300); }); }; }
}
function showVideoResult(videoUrl) {
  var v=$('vidResult'); if(v) v.src=videoUrl; showState('vid');
  var name=document.querySelector('#vidModelList .model-row.active .model-row-name');
  $('vidResultMeta')&&($('vidResultMeta').textContent=(name?name.textContent:vidModel)+' · '+vidDuration+'s · '+vidResolution+' · '+new Date().toLocaleTimeString('id-ID'));
  var dl=$('vidBtnDownload'); if(dl) dl.onclick=function(){ var a=document.createElement('a');a.href=videoUrl;a.download='adgen-video-'+Date.now()+'.mp4';a.target='_blank';a.click(); };
}
function showSpeechResult(audioUrl) {
  var list=$('musicResultList'); if(!list)return; list.innerHTML='';
  var item=document.createElement('div'); item.className='music-track-item';
  item.innerHTML='<div class="music-track-info"><div class="music-track-title">Voice Over</div><div class="music-track-meta">ElevenLabs</div></div>'+
    '<audio controls src="'+audioUrl+'" style="flex:1;min-width:0"></audio>'+
    '<a href="'+audioUrl+'" download="adgen-speech-'+Date.now()+'.mp3" target="_blank" class="btn-solid" style="flex-shrink:0;text-decoration:none;padding:6px 12px;font-size:12px;display:flex;align-items:center">⬇</a>';
  list.appendChild(item); showState('music');
  $('musicResultMeta')&&($('musicResultMeta').textContent='ElevenLabs · '+new Date().toLocaleTimeString('id-ID'));
}

// ── Modal ─────────────────────────────────────────────────
function setupModal() {
  var modal=$('previewModal'),bg=$('previewModalBg'),img=$('previewModalImg'),close=$('previewClose'),prev=$('previewPrev'),next=$('previewNext'),ctr=$('previewCounter'),dl=$('previewDl');
  if (!modal) return;
  function render() { img.src=previewUrls[previewIdx]; if(ctr) ctr.textContent=(previewIdx+1)+' / '+previewUrls.length; if(prev) prev.disabled=previewIdx===0; if(next) next.disabled=previewIdx===previewUrls.length-1; if(dl) dl.onclick=function(){ var a=document.createElement('a');a.href=previewUrls[previewIdx];a.download='adgen-'+Date.now()+'.jpg';a.target='_blank';a.click(); }; }
  function closeModal(){ modal.style.display='none'; document.body.style.overflow=''; }
  close&&close.addEventListener('click',closeModal); bg&&bg.addEventListener('click',closeModal);
  prev&&prev.addEventListener('click',function(){ if(previewIdx>0){previewIdx--;render();} });
  next&&next.addEventListener('click',function(){ if(previewIdx<previewUrls.length-1){previewIdx++;render();} });
  document.addEventListener('keydown',function(e){ if(!modal||modal.style.display==='none')return; if(e.key==='Escape')closeModal(); if(e.key==='ArrowLeft'&&previewIdx>0){previewIdx--;render();} if(e.key==='ArrowRight'&&previewIdx<previewUrls.length-1){previewIdx++;render();} });
  window.openModal=function(urls,idx){ previewUrls=urls;previewIdx=idx;render();modal.style.display='flex';document.body.style.overflow='hidden'; };
}

// ── Toast ─────────────────────────────────────────────────
var toastTO;
function showToast(msg, type) {
  var t=$('toast'); if(!t)return;
  t.textContent=msg; t.className='toast show '+(type||'info');
  clearTimeout(toastTO); toastTO=setTimeout(function(){ t.classList.remove('show'); },5000);
}
function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }

// ── Admin Panel ───────────────────────────────────────────
var currentAdminStatus = 'pending';

async function loadAdminUsers(status) {
  currentAdminStatus = status;
  ['Pending','Approved','Rejected'].forEach(function(s) {
    var tab = $('adminTab'+s);
    if (tab) tab.classList.toggle('active', s.toLowerCase()===status);
  });
  var list = $('adminUserList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-5)">Memuat...</div>';
  try {
    var d = await proxyGet('adminUsers', { status });
    var users = d.users || [];
    if (!users.length) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-5)">Tidak ada user '+status+'.</div>';
      return;
    }
    list.innerHTML = '';
    users.forEach(function(u) {
      var card = document.createElement('div');
      card.className = 'admin-user-card';
      card.dataset.userId = u.id;
      var actHtml = '';
      if (status === 'pending') {
        actHtml = '<button class="btn-approve admin-act" data-act="approve">✓ Approve</button><button class="btn-reject admin-act" data-act="reject">✗ Reject</button>';
      } else if (status === 'approved') {
        actHtml = '<button class="btn-reject admin-act" data-act="reject">✗ Reject</button>';
      } else {
        actHtml = '<button class="btn-approve admin-act" data-act="approve">✓ Approve</button>';
      }
      card.innerHTML =
        '<div class="admin-user-info"><div class="admin-user-name">'+u.username+'</div>' +
        '<div class="admin-user-date">Daftar: '+new Date(u.created_at).toLocaleDateString('id-ID')+'</div></div>' +
        '<div class="admin-user-actions">'+actHtml+'</div>';
      list.appendChild(card);
    });
    // Event delegation
    list.querySelectorAll('.admin-act').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var card = btn.closest('.admin-user-card');
        adminAction(card.dataset.userId, btn.dataset.act);
      });
    });
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#f08080">Error: '+e.message+'</div>';
  }
}


async function adminAction(userId, act) {
  try {
    await proxyPost('adminAction', { userId, act });
    showToast(act==='approve' ? 'User disetujui!' : 'User ditolak.', 'success');
    loadAdminUsers(currentAdminStatus);
  } catch(e) { showToast(e.message, 'error'); }
}

// ── Theme Toggle ──────────────────────────────────────────
(function() {
  var html=document.documentElement, btn=$('themeToggle');
  var sunIcon=btn?btn.querySelector('.icon-sun'):null, moonIcon=btn?btn.querySelector('.icon-moon'):null;
  var saved=localStorage.getItem('adstudio_theme')||'dark';
  setTheme(saved);
  if (btn) btn.addEventListener('click',function(){ setTheme(html.dataset.theme==='dark'?'light':'dark'); });
  function setTheme(t){ html.dataset.theme=t; localStorage.setItem('adstudio_theme',t); if(sunIcon) sunIcon.style.display=t==='dark'?'block':'none'; if(moonIcon) moonIcon.style.display=t==='light'?'block':'none'; }
})();
