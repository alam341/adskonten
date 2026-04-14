/* AdGen — App Logic with Auth + History */

var uploadedImageBase64 = null, uploadedMimeType = null;
var vidBase64 = null, vidMime = null;
var imgModel = 'gpt-image/1.5-image-to-image';
var vidModel = 'kling-2.6/image-to-video';
var ttsModel = 'elevenlabs/text-to-speech-multilingual-v2';
var ttsVoice = '21m00Tcm4TlvDq8ikWAM';
var ttsVoiceName = 'Rachel';
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
  $('btnAnalyze') && $('btnAnalyze').addEventListener('click', function() { showView('analyze'); setupAnalyzeTab(); });
  $('btnCekIklan') && $('btnCekIklan').addEventListener('click', function() { showView('cekiklan'); setupCekIklan(); });
  $('btnImageEdit') && $('btnImageEdit').addEventListener('click', function() { showView('imageedit'); setupImageEdit(); });
  $('btnBackFromImageEdit') && $('btnBackFromImageEdit').addEventListener('click', function() { showView('app'); });
  $('btnCopywriting') && $('btnCopywriting').addEventListener('click', function() { showView('copywriting'); setupCopywriting(); });
  $('btnBackFromCopywriting') && $('btnBackFromCopywriting').addEventListener('click', function() { showView('app'); });
  $('btnBackFromCekIklan') && $('btnBackFromCekIklan').addEventListener('click', function() { showView('app'); });
  $('btnBackFromAnalyze') && $('btnBackFromAnalyze').addEventListener('click', function() { showView('app'); });

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
  var analyzeView = $('analyzeView');
  if (analyzeView) analyzeView.style.display = v==='analyze' ? 'flex' : 'none';
  var cekIklanView = $('cekIklanView');
  if (cekIklanView) cekIklanView.style.display = v==='cekiklan' ? 'flex' : 'none';
  var imageEditView = $('imageEditView');
  if (imageEditView) imageEditView.style.display = v==='imageedit' ? 'flex' : 'none';
  var copyView = $('copywritingView');
  if (copyView) copyView.style.display = v==='copywriting' ? 'flex' : 'none';

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
  setupNotifications();
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
  var btnAn = $('btnAnalyze');
  if (btnAn) btnAn.style.display = 'flex';
  var btnCek = $('btnCekIklan');
  if (btnCek) btnCek.style.display = 'flex';
  var btnIE = $('btnImageEdit');
  if (btnIE) btnIE.style.display = 'flex';
  var btnCopy = $('btnCopywriting');
  if (btnCopy) btnCopy.style.display = 'flex';

  var btnAdmin = $('btnAdmin');
  if (btnAdmin) btnAdmin.style.display = profile && profile.is_admin ? 'flex' : 'none';
  // Show welcome screen jika belum pernah hari ini
  var today = new Date().toDateString();
  var lastWelcome = localStorage.getItem('adstudio_welcome_date');
  if (lastWelcome !== today) {
    localStorage.setItem('adstudio_welcome_date', today);
    var uname = profile ? profile.username : (user.email||'').replace('@adgen.local','');
    setTimeout(function() { showWelcomeScreen(uname); }, 300);
  }
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
  var btnAn2 = $('btnAnalyze');
  if (btnAn2) btnAn2.style.display = 'none';
  var btnCek2 = $('btnCekIklan');
  if (btnCek2) btnCek2.style.display = 'none';
  var btnIE2 = $('btnImageEdit');
  if (btnIE2) btnIE2.style.display = 'none';
  var btnCopy2 = $('btnCopywriting');
  if (btnCopy2) btnCopy2.style.display = 'none';

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

        // Kumpulkan semua URL gambar dari item ini untuk preview
        var itemImgUrls = (item.storage_urls && item.storage_urls.length ? item.storage_urls : (item.result_urls||[])).filter(function(u){ return !u.includes('.mp4')&&!u.includes('.mp3'); });
        var imgIdx = itemImgUrls.indexOf(url);

        var thumbInner = isVideo
          ? '<div class="history-thumb-placeholder">🎬</div>'
          : isAudio
            ? '<div class="history-thumb-placeholder">🔊</div>'
            : '<div class="history-card-thumb"><img src="'+url+'" loading="lazy" />' +
              '<div class="history-card-overlay">' +
                '<span style="color:white;font-size:18px">🔍</span>' +
              '</div></div>';

        card.innerHTML = thumbInner +
          '<div class="history-card-info">' +
            '<div class="history-card-type">'+item.type+'</div>' +
            '<div class="history-card-model">'+(item.model||'')+'</div>' +
            '<div class="history-card-date">'+new Date(item.created_at).toLocaleDateString('id-ID')+'</div>' +
          '</div>' +
          '<div class="history-card-actions">' +
            '<a href="'+url+'" download target="_blank" class="btn-dl-hist" title="Download" onclick="event.stopPropagation()">⬇</a>' +
            (i===0 ? '<button class="btn-del-hist" data-id="'+item.id+'" title="Hapus" onclick="event.stopPropagation()">🗑</button>' : '') +
          '</div>';

        // Klik card → buka modal preview
        if (!isVideo && !isAudio && itemImgUrls.length) {
          card.addEventListener('click', function(e) {
            if (e.target.closest('.btn-dl-hist,.btn-del-hist')) return;
            if (typeof openModal === 'function') openModal(itemImgUrls, Math.max(imgIdx,0));
          });
        }

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
      var labels = { image:'Generate Gambar', video:'Generate Video', music:'Generate Speech', clone:'Clone Style', analyze:'Mulai Analisis' };
      $('btnGenerateLabel') && ($('btnGenerateLabel').textContent = labels[activeTab]||'Generate');
      var titles = { image:'Generate Konten Iklan — Gambar', video:'Generate Konten Iklan — Video', music:'Generate Narasi / Voice Over', clone:'Clone Style Iklan Kompetitor', analyze:'Analisis Video Iklan Kompetitor' };
      $('emptyTitle') && ($('emptyTitle').textContent = titles[activeTab]||'');
      showState('empty');
      if (activeTab === 'analyze') setupAnalyzeTab();
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
    if (opt) { var nameParts=opt.text.split(' \u2014 '); ttsVoiceName=nameParts[0].trim(); }
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
  if (activeTab==='analyze') startAnalyze();
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
    incrementCounter('image');
    sendNotification('Gambar Siap! 🎨', urls.length+' gambar berhasil digenerate.');
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
        var result = await pollStatus(taskIds[ti], gen.taskType||'jobs', 60);
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
    incrementCounter('clone');
    sendNotification('Clone Style Siap! 🎭', 'Hasil clone style berhasil digenerate.');
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
    var gen=await proxyPost('generate',{type:'speech',text,model:ttsModel,voice:ttsVoiceName,speed:ttsSpeed,stability:ttsStability,languageCode:''});
    if (!gen.taskId) throw new Error('taskId tidak ditemukan.');
    updateSub('Generating suara...');
    var audioUrl=await pollStatus(gen.taskId,'speech',30);
    showSpeechResult(audioUrl);
    saveToHistory('speech',ttsModel,text,'',Array.isArray(audioUrl)?audioUrl:[audioUrl]);
    incrementCounter('speech');
    sendNotification('Suara Siap! 🔊', 'Voice over berhasil digenerate.');
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
      var url=data.audioUrl||data.imageUrl||data.videoUrl;
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
  $('stateResultClone')  && ($('stateResultClone').style.display  = s==='clone'   ?'flex':'none');
  $('stateResultAnalyze') && ($('stateResultAnalyze').style.display = s==='analyze' ?'flex':'none');
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
  if (dlAll) { dlAll.style.display=urls.length>1?'flex':'none'; dlAll.onclick=function(){ batchDownloadZip(urls,'adstudio-gambar'); }; }
  setupResizePanel(urls);
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

// ── Browser Notification ──────────────────────────────────
function setupNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
function sendNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // user masih di tab, tidak perlu notif
  try {
    new Notification(title, { body: body, icon: '/favicon.png' });
  } catch(e) {}
}

// ── Usage Counter ─────────────────────────────────────────
function getCounterKey() {
  return 'adstudio_counter_' + new Date().toDateString();
}
function getCounter() {
  try { return JSON.parse(localStorage.getItem(getCounterKey())) || { image:0, speech:0, clone:0 }; }
  catch(e) { return { image:0, speech:0, clone:0 }; }
}
function incrementCounter(type) {
  var c = getCounter();
  if (c[type] !== undefined) c[type]++;
  localStorage.setItem(getCounterKey(), JSON.stringify(c));
  updateCounterUI();
}
function updateCounterUI() {
  var c = getCounter();
  var total = (c.image||0) + (c.speech||0) + (c.clone||0);
  var el = {
    cntImage: c.image||0, cntSpeech: c.speech||0,
    cntClone: c.clone||0, cntTotal: total
  };
  Object.keys(el).forEach(function(id) {
    var e = $(id); if (e) e.textContent = el[id];
  });
}

// ── Resize Output ─────────────────────────────────────────
var resizeUrls = [];
function setupResizePanel(urls) {
  resizeUrls = urls || [];
  var panel = $('resizePanel');
  if (!panel) return;
  panel.style.display = resizeUrls.length ? 'block' : 'none';
  panel.querySelectorAll('.resize-btn').forEach(function(btn) {
    btn.onclick = function() {
      var w = parseInt(btn.dataset.w), h = parseInt(btn.dataset.h), label = btn.dataset.label;
      resizeUrls.forEach(function(url, i) {
        resizeAndDownload(url, w, h, label + '-' + (i+1));
      });
    };
  });
}
function resizeAndDownload(imgUrl, targetW, targetH, filename) {
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function() {

    var canvas = document.createElement('canvas');
    canvas.width = targetW; canvas.height = targetH;
    var ctx = canvas.getContext('2d');
    // Crop & center (object-fit: cover style)
    var srcRatio = img.width / img.height;
    var dstRatio = targetW / targetH;
    var sx, sy, sw, sh;
    if (srcRatio > dstRatio) {
      sh = img.height; sw = sh * dstRatio;
      sx = (img.width - sw) / 2; sy = 0;
    } else {
      sw = img.width; sh = sw / dstRatio;
      sx = 0; sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
    canvas.toBlob(function(blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'adstudio-' + filename + '-' + Date.now() + '.jpg';
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
    }, 'image/jpeg', 0.92);
  };
  img.onerror = function() { showToast('Gagal resize gambar. Coba download manual.', 'error'); };
  img.src = '/api/proxy?action=imgProxy&url=' + encodeURIComponent(imgUrl);
}

// ── Batch Download ZIP ─────────────────────────────────────
async function batchDownloadZip(urls, prefix) {
  if (!urls || !urls.length) return;
  if (typeof JSZip === 'undefined') {
    urls.forEach(function(url, i) { setTimeout(function() { var a=document.createElement('a');a.href=url;a.download=prefix+'-'+(i+1)+'.jpg';a.target='_blank';a.click(); }, i*300); });
    return;
  }
  showToast('Menyiapkan ZIP...', 'info');
  var zip = new JSZip();
  var folder = zip.folder(prefix);
  var failed = 0;
  var promises = urls.map(function(url, i) {
    var proxyUrl = '/api/proxy?action=imgProxy&url=' + encodeURIComponent(url);
    return fetch(proxyUrl)
      .then(function(r) {
        if (!r.ok) throw new Error('gagal');
        return r.blob();
      })
      .then(function(blob) { folder.file(prefix + '-' + (i+1) + '.jpg', blob); })
      .catch(function() { failed++; });
  });
  await Promise.all(promises);
  if (failed === urls.length) { showToast('Semua gambar gagal diunduh.', 'error'); return; }
  var content = await zip.generateAsync({ type: 'blob' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(content);
  a.download = prefix + '-' + Date.now() + '.zip';
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
  var msg = failed > 0 ? 'ZIP diunduh (' + failed + ' gambar gagal).' : 'ZIP berhasil diunduh!';
  showToast(msg, failed > 0 ? 'info' : 'success');
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


async function loadAdminStats() {
  // Switch tabs
  ['Pending','Approved','Rejected','Stats'].forEach(function(s) {
    var t = $('adminTab'+s); if (t) t.classList.remove('active');
  });
  var st = $('adminTabStats'); if (st) st.classList.add('active');
  $('adminUserList') && ($('adminUserList').style.display = 'none');
  var statsView = $('adminStatsView'); if (!statsView) return;
  statsView.style.display = 'block';

  var dateInput = $('adminStatsDate');
  var today = new Date().toISOString().split('T')[0];
  if (!dateInput.value) dateInput.value = today;
  var date = dateInput.value || today;

  var grid = $('adminStatsGrid');
  var label = $('adminStatsDateLabel');
  grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-5)">Memuat...</div>';

  // Format tanggal Indonesia
  var d = new Date(date + 'T12:00:00');
  var dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  var monthNames = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  if (label) label.textContent = dayNames[d.getDay()] + ', ' + d.getDate() + ' ' + monthNames[d.getMonth()] + ' ' + d.getFullYear();

  try {
    var data = await proxyGet('adminStats', { date }, authToken);
    var users = data.users || [];
    grid.innerHTML = '';

    if (!users.length) {
      grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-5)">Belum ada user approved.</div>';
      return;
    }

    users.forEach(function(u) {
      var s = u.stats || { image:0, speech:0, clone:0 };
      var total = (s.image||0) + (s.speech||0) + (s.clone||0);
      var initials = (u.username||'?').substring(0,2).toUpperCase();
      var hue = Math.abs(u.username.split('').reduce(function(a,c){return a+c.charCodeAt(0);},0)) % 360;
      var isActive = total > 0;

      var card = document.createElement('div');
      card.className = 'admin-stat-card' + (isActive ? ' admin-stat-active' : '');
      card.innerHTML =
        '<div class="admin-stat-card-top">' +
          '<div class="admin-stat-avatar" style="background:hsl('+hue+',55%,48%)">' + initials + '</div>' +
          '<div class="admin-stat-info">' +
            '<div class="admin-stat-name">' + (u.username||'-') + '</div>' +
            '<div class="admin-stat-sub">' + (u.status==='approved'?'<span class="badge-aktif">Aktif</span>':'<span class="badge-nonaktif">Nonaktif</span>') + '</div>' +
          '</div>' +
          '<div class="admin-stat-total-wrap">' +
            '<div class="admin-stat-total-num">' + total + '</div>' +
            '<div class="admin-stat-total-label">Total</div>' +
          '</div>' +
        '</div>' +
        '<div class="admin-stat-bars">' +
          statBar('🎨', 'Gambar', s.image||0, '#5b5bd6') +
          statBar('🔊', 'Suara', s.speech||0, '#10b981') +
          statBar('🎭', 'Clone', s.clone||0, '#f59e0b') +
        '</div>';
      grid.appendChild(card);
    });

    // Sort: user dengan total terbanyak di depan
    var cards = Array.from(grid.querySelectorAll('.admin-stat-card'));
    cards.sort(function(a, b) {
      var na = parseInt(a.querySelector('.admin-stat-total-num').textContent)||0;
      var nb = parseInt(b.querySelector('.admin-stat-total-num').textContent)||0;
      return nb - na;
    });
    cards.forEach(function(c){ grid.appendChild(c); });

  } catch(e) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:#f08080">Error: '+e.message+'</div>';
  }
}

function statBar(icon, label, count, color) {
  var maxBar = 100; // lebar max bar
  return '<div class="admin-stat-bar-item">' +
    '<div class="admin-stat-bar-label">' + icon + ' ' + label + '</div>' +
    '<div class="admin-stat-bar-track">' +
      '<div class="admin-stat-bar-fill" style="width:' + Math.min(count*10,100) + '%;background:'+color+'"></div>' +
    '</div>' +
    '<div class="admin-stat-bar-num" style="color:'+color+'">' + count + '</div>' +
  '</div>';
}

// Override loadAdminUsers agar sembunyikan statsView
var _origLoadAdminUsers = loadAdminUsers;
loadAdminUsers = async function(status) {
  var statsView = $('adminStatsView');
  var userList = $('adminUserList');
  if (statsView) statsView.style.display = 'none';
  if (userList) userList.style.display = '';
  return _origLoadAdminUsers(status);
};

async function adminAction(userId, act) {
  try {
    await proxyPost('adminAction', { userId, act });
    showToast(act==='approve' ? 'User disetujui!' : 'User ditolak.', 'success');
    loadAdminUsers(currentAdminStatus);
  } catch(e) { showToast(e.message, 'error'); }
}

// ── Analyze Video ────────────────────────────────────────
var analyzeVideoFile = null;

function setupAnalyzeTab() {
  var zone = $('analyzeUploadZone');
  var input = $('analyzeVideoInput');
  var preview = $('analyzeVideoPreview');
  var empty = $('analyzeUploadEmpty');
  if (!zone || zone._initialized) return;
  zone._initialized = true;
  var btnStart = $('btnStartAnalyze');
  if (btnStart) btnStart.addEventListener('click', startAnalyze);

  zone.addEventListener('click', function() {
    if (preview && preview.style.display !== 'none') return;
    input.click();
  });
  empty && empty.addEventListener('click', function(e) { e.stopPropagation(); input.click(); });

  input.addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size > 50*1024*1024) { showToast('Maks 50MB.','error'); return; }
    analyzeVideoFile = f;
    var url = URL.createObjectURL(f);
    if (preview) { preview.src=url; preview.style.display='block'; }
    if (empty) empty.style.display='none';
    var btnEnable = $('btnStartAnalyze');
    if (btnEnable) btnEnable.disabled = false;
  });

  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor='var(--accent)'; });
  zone.addEventListener('dragleave', function() { zone.style.borderColor=''; });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); zone.style.borderColor='';
    var f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) { input.files=e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });
}

// ── Analyze functions ──
async function startAnalyze() {
    var urlInput = $('analyzeVideoUrl');
    var videoUrl = urlInput ? urlInput.value.trim() : '';
    if (!analyzeVideoFile && !videoUrl) { showToast('Upload video atau paste link dulu.','error'); return; }

    var frameGrid = $('analyzeFrameGrid');
    var framesEl = $('analyzeFrames');
    var loadingEl = $('analyzeLoading');
    var loadingText = $('analyzeLoadingText');
    var emptyEl = $('analyzeEmpty');
    var resultEl = $('analyzeResult');
    var btnStart = $('btnStartAnalyze');

    if (emptyEl) emptyEl.style.display = 'none';
    if (resultEl) resultEl.style.display = 'none';
    if (loadingEl) loadingEl.style.display = 'block';
    if (btnStart) btnStart.disabled = true;

    try {
      // Extract frames from video using canvas
      if (loadingText) loadingText.textContent = 'Mengekstrak frames dari video...';
      var frames = [];
      if (analyzeVideoFile) {
        updateSub('Mengekstrak frames dari video...');
        frames = await extractFrames(analyzeVideoFile, 5);
      }

      // Show frame thumbnails
      if (framesEl) {
        framesEl.innerHTML = '';
        frames.forEach(function(f) {
          var img = document.createElement('img');
          img.src = f;
          img.style.cssText = 'width:100%;border-radius:4px;object-fit:cover;height:50px';
          framesEl.appendChild(img);
        });
      }
      if (frameGrid) frameGrid.style.display = 'block';

      if (loadingText) loadingText.textContent = 'Menganalisis dengan Claude AI...';

      var productInfo = $('analyzeProductInfo') ? $('analyzeProductInfo').value.trim() : '';
      var res = await fetch('/api/proxy?action=analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': authToken ? 'Bearer '+authToken : (localStorage.getItem('adstudio_token') ? 'Bearer '+localStorage.getItem('adstudio_token') : '') },
        body: JSON.stringify({ frames: frames, productInfo: productInfo })
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analisis gagal.');

      if (loadingEl) loadingEl.style.display = 'none';
      var right = document.querySelector('.analyze-right');
      if (right) {
        var copyBtn = document.createElement('button');
        copyBtn.className = 'btn-ghost';
        copyBtn.textContent = 'Copy Hasil';
        var textDiv = document.createElement('div');
        textDiv.style.cssText = 'font-size:13px;line-height:1.9;color:var(--text-2);white-space:pre-wrap;margin-top:16px';
        textDiv.textContent = data.analysis;
        copyBtn.onclick = function() { navigator.clipboard.writeText(textDiv.textContent); showToast('Disalin!','success'); };
        right.innerHTML = '';
        right.appendChild(copyBtn);
        right.appendChild(textDiv);
      }

    } catch(e) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'flex';
      showToast(e.message, 'error');
    }
    if (btnStart) btnStart.disabled = false;
  }

  function extractFrames(file, count) {
    return new Promise(function(resolve, reject) {
      var video = document.createElement('video');
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var frames = [];
      var url = URL.createObjectURL(file);

      video.src = url;
      video.muted = true;
      video.addEventListener('loadedmetadata', function() {
        canvas.width = 640;
        canvas.height = Math.round(640 * video.videoHeight / video.videoWidth);
        var duration = video.duration;
        var times = [];
        for (var i = 0; i < count; i++) {
          times.push((duration / (count + 1)) * (i + 1));
        }
        var idx = 0;
        function captureNext() {
          if (idx >= times.length) {
            URL.revokeObjectURL(url);
            resolve(frames);
            return;
          }
          video.currentTime = times[idx];
        }
        video.addEventListener('seeked', function() {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.8));
          idx++;
          captureNext();
        });
        captureNext();
      });
      video.addEventListener('error', function() { reject(new Error('Video tidak bisa dibaca.')); });
      video.load();
    });
  }

// ── Cek Kualitas Iklan ───────────────────────────────────
var cekIklanBase64 = null;

function setupCekIklan() {
  var zone = $('cekIklanUploadZone');
  var input = $('cekIklanInput');
  var preview = $('cekIklanPreview');
  var empty = $('cekIklanUploadEmpty');
  var btn = $('btnStartCekIklan');
  if (!zone || zone._initialized) return;
  zone._initialized = true;

  zone.addEventListener('click', function() {
    if (preview && preview.style.display !== 'none') return;
    input.click();
  });
  empty && empty.addEventListener('click', function(e) { e.stopPropagation(); input.click(); });

  input.addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size > 10*1024*1024) { showToast('Maks 10MB.','error'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      cekIklanBase64 = ev.target.result;
      if (preview) { preview.src = cekIklanBase64; preview.style.display = 'block'; }
      if (empty) empty.style.display = 'none';
      if (btn) btn.disabled = false;
    };
    reader.readAsDataURL(f);
  });

  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor='var(--accent)'; });
  zone.addEventListener('dragleave', function() { zone.style.borderColor=''; });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); zone.style.borderColor='';
    var f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) { input.files=e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });

  if (btn) btn.addEventListener('click', startCekIklan);
}

async function startCekIklan() {
  if (!cekIklanBase64) { showToast('Upload gambar dulu.','error'); return; }
  var loading = $('cekIklanLoading');
  var empty = $('cekIklanEmpty');
  var right = $('cekIklanRight');
  var btn = $('btnStartCekIklan');
  var platform = $('cekIklanPlatform') ? $('cekIklanPlatform').value : '';
  var info = $('cekIklanInfo') ? $('cekIklanInfo').value.trim() : '';

  if (empty) empty.style.display = 'none';
  if (loading) loading.style.display = 'block';
  if (btn) btn.disabled = true;

  try {
    var res = await fetch('/api/proxy?action=cekiklan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+(authToken||localStorage.getItem('adstudio_token')||'') },
      body: JSON.stringify({ imageBase64: cekIklanBase64, platform, productInfo: info })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal.');

    if (loading) loading.style.display = 'none';
    if (right) {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'btn-ghost';
      copyBtn.textContent = 'Copy Hasil';
      var textDiv = document.createElement('div');
      textDiv.style.cssText = 'font-size:13px;line-height:1.9;color:var(--text-2);white-space:pre-wrap;margin-top:16px';
      textDiv.textContent = data.analysis;
      copyBtn.onclick = function() { navigator.clipboard.writeText(textDiv.textContent); showToast('Disalin!','success'); };
      right.innerHTML = '';
      right.appendChild(copyBtn);
      right.appendChild(textDiv);
    }
  } catch(e) {
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    showToast(e.message, 'error');
  }
  if (btn) btn.disabled = false;
}

// ── Image Edit ───────────────────────────────────────────
var imageEditFile = null;

function setupImageEdit() {
  var zone = $('imageEditUploadZone');
  var input = $('imageEditInput');
  var preview = $('imageEditPreview');
  var empty = $('imageEditUploadEmpty');
  var btn = $('btnStartImageEdit');
  if (!zone || zone._initialized) return;
  zone._initialized = true;

  zone.addEventListener('click', function() {
    if (preview && preview.style.display !== 'none') return;
    input.click();
  });
  empty && empty.addEventListener('click', function(e) { e.stopPropagation(); input.click(); });

  input.addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    if (f.size > 10*1024*1024) { showToast('Maks 10MB.','error'); return; }
    imageEditFile = f;
    var reader = new FileReader();
    reader.onload = function(ev) {
      if (preview) { preview.src = ev.target.result; preview.style.display = 'block'; }
      if (empty) empty.style.display = 'none';
      if (btn) btn.disabled = false;
    };
    reader.readAsDataURL(f);
  });

  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor='var(--accent)'; });
  zone.addEventListener('dragleave', function() { zone.style.borderColor=''; });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); zone.style.borderColor='';
    var f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) { input.files=e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });

  if (btn) btn.addEventListener('click', startImageEdit);
}

async function startImageEdit() {
  if (!imageEditFile) { showToast('Upload gambar dulu.','error'); return; }
  var prompt = $('imageEditPrompt') ? $('imageEditPrompt').value.trim() : '';
  if (!prompt) { showToast('Tulis instruksi edit dulu.','error'); return; }

  var loading = $('imageEditLoading');
  var empty = $('imageEditEmpty');
  var result = $('imageEditResult');
  var btn = $('btnStartImageEdit');
  var ratio = $('imageEditSize') ? $('imageEditSize').value : '1:1';

  if (empty) empty.style.display = 'none';
  if (result) result.style.display = 'none';
  if (loading) loading.style.display = 'block';
  if (btn) btn.disabled = true;

  try {
    // Upload gambar dulu
    var reader = new FileReader();
    var base64 = await new Promise(function(res) {
      reader.onload = function(e) { res(e.target.result); };
      reader.readAsDataURL(imageEditFile);
    });

    var upRes = await fetch('/api/proxy?action=upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+(authToken||localStorage.getItem('adstudio_token')||'') },
      body: JSON.stringify({ imageBase64: base64, mimeType: imageEditFile.type, type: 'image' })
    });
    var upData = await upRes.json();
    if (!upRes.ok) throw new Error(upData.error || 'Upload gagal.');

    // Generate edit
    var genRes = await fetch('/api/proxy?action=imageedit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+(authToken||localStorage.getItem('adstudio_token')||'') },
      body: JSON.stringify({ imageUrl: upData.url, prompt, ratio })
    });
    var genData = await genRes.json();
    if (!genRes.ok) throw new Error(genData.error || 'Edit gagal.');

    // Poll status
    updateSub && updateSub('Mengedit gambar...');
    var resultUrl = await pollStatus(genData.taskId, 'jobs', 60);

    if (loading) loading.style.display = 'none';
    if (result) result.style.display = 'block';
    var img = $('imageEditResultImg');
    if (img) img.src = Array.isArray(resultUrl) ? resultUrl[0] : resultUrl;
    var finalUrl = Array.isArray(resultUrl) ? resultUrl[0] : resultUrl;
    var dlBtn = $('imageEditDownload');
    if (dlBtn) dlBtn.onclick = function() {
      var a = document.createElement('a'); a.href=finalUrl; a.download='edit-'+Date.now()+'.jpg'; a.target='_blank'; a.click();
    };
    saveToHistory('image', 'seedream/4.5-edit', prompt, ratio, [finalUrl]);

  } catch(e) {
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    showToast(e.message, 'error');
  }
  if (btn) btn.disabled = false;
}

// ── Copywriting Generator ────────────────────────────────
var copywritingBase64 = null;

function setupCopywriting() {
  var zone = $('copywritingUploadZone');
  var input = $('copywritingInput');
  var preview = $('copywritingPreview');
  var empty = $('copywritingUploadEmpty');
  if (!zone || zone._initialized) return;
  zone._initialized = true;

  zone.addEventListener('click', function() {
    if (preview && preview.style.display !== 'none') return;
    input.click();
  });
  empty && empty.addEventListener('click', function(e) { e.stopPropagation(); input.click(); });

  input.addEventListener('change', function(e) {
    var f = e.target.files[0]; if (!f) return;
    var reader = new FileReader();
    reader.onload = function(ev) {
      copywritingBase64 = ev.target.result;
      if (preview && f.type.startsWith('image/')) { preview.src = copywritingBase64; preview.style.display = 'block'; }
      if (empty) empty.style.display = 'none';
    };
    reader.readAsDataURL(f);
  });

  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.style.borderColor='var(--accent)'; });
  zone.addEventListener('dragleave', function() { zone.style.borderColor=''; });
  zone.addEventListener('drop', function(e) {
    e.preventDefault(); zone.style.borderColor='';
    var f = e.dataTransfer.files[0];
    if (f) { input.files=e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });

  var btn = $('btnStartCopywriting');
  if (btn) btn.addEventListener('click', startCopywriting);
}

async function startCopywriting() {
  var productInfo = $('copywritingProductInfo') ? $('copywritingProductInfo').value.trim() : '';
  if (!productInfo && !copywritingBase64) { showToast('Upload gambar atau isi info produk dulu.','error'); return; }

  var loading = $('copywritingLoading');
  var empty = $('copywritingEmpty');
  var right = $('copywritingRight');
  var btn = $('btnStartCopywriting');
  var platform = $('copywritingPlatform') ? $('copywritingPlatform').value : 'Instagram';
  var tone = $('copywritingTone') ? $('copywritingTone').value : 'persuasif dan emosional';

  var frameworks = [];
  if ($('fwAIDA') && $('fwAIDA').checked) frameworks.push('AIDA');
  if ($('fwPAS') && $('fwPAS').checked) frameworks.push('PAS');
  if ($('fwBAB') && $('fwBAB').checked) frameworks.push('BAB');
  if ($('fwFAB') && $('fwFAB').checked) frameworks.push('FAB');
  if (!frameworks.length) { showToast('Pilih minimal 1 framework.','error'); return; }

  if (empty) empty.style.display = 'none';
  if (loading) loading.style.display = 'block';
  if (btn) btn.disabled = true;

  try {
    var res = await fetch('/api/proxy?action=copywriting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+(authToken||localStorage.getItem('adstudio_token')||'') },
      body: JSON.stringify({ imageBase64: copywritingBase64, productInfo, platform, tone, frameworks })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal.');

    if (loading) loading.style.display = 'none';
    if (right) {
      var copyBtn = document.createElement('button');
      copyBtn.className = 'btn-ghost';
      copyBtn.textContent = '📋 Copy Semua';
      var textDiv = document.createElement('div');
      textDiv.style.cssText = 'font-size:13px;line-height:1.9;color:var(--text-2);white-space:pre-wrap;margin-top:16px';
      textDiv.textContent = data.copy;
      copyBtn.onclick = function() { navigator.clipboard.writeText(textDiv.textContent); showToast('Disalin!','success'); };
      right.innerHTML = '';
      right.appendChild(copyBtn);
      right.appendChild(textDiv);
    }
  } catch(e) {
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    showToast(e.message, 'error');
  }
  if (btn) btn.disabled = false;
}

// ── Welcome Screen ───────────────────────────────────────
function showWelcomeScreen(username) {
  var ws = $('welcomeScreen');
  if (!ws) return;

  // Greeting sesuai waktu
  var hour = new Date().getHours();
  var greeting = hour < 11 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam';
  $('welcomeGreeting') && ($('welcomeGreeting').textContent = greeting + ',');
  $('welcomeName') && ($('welcomeName').textContent = username + ' 👋');

  ws.style.display = 'flex';

  // Mood buttons
  document.querySelectorAll('.mood-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.mood-btn').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
      var mood = btn.dataset.mood;
      var emoji = btn.dataset.emoji;
      setTimeout(function() {
        ws.style.display = 'none';
        generateMotivation(mood, emoji, username);
      }, 400);
    });
  });

  $('welcomeSkip') && $('welcomeSkip').addEventListener('click', function() {
    ws.style.display = 'none';
  });
}

var motivationMood = 'semangat';
var motivationEmoji = '✨';
var motivationInterval = null;

async function generateMotivation(mood, emoji, username) {
  motivationMood = mood || motivationMood;
  motivationEmoji = emoji || motivationEmoji;

  var bar = $('motivationBar');
  var textEl = $('motivationText');
  var iconEl = $('motivationIcon');
  if (!bar) return;

  bar.style.display = 'flex';
  if (iconEl) iconEl.textContent = motivationEmoji;
  if (textEl) textEl.textContent = '...';

  var appLayout = $('appLayout');
  if (appLayout) appLayout.classList.add('has-motivation');

  await fetchMotivation(textEl);

  // Refresh motivasi tiap 10 menit
  if (motivationInterval) clearInterval(motivationInterval);
  motivationInterval = setInterval(async function() {
    if (textEl) textEl.style.opacity = '0.4';
    await fetchMotivation(textEl);
    if (textEl) textEl.style.opacity = '1';
  }, 10 * 60 * 1000);
}

async function fetchMotivation(textEl) {
  var fallbacks = {
    bahagia: 'Energimu hari ini, jadikan karya iklan yang luar biasa!',
    semangat: 'Semangatmu adalah bahan bakar kreativitas terbaik!',
    biasa: 'Hari biasa pun bisa menghasilkan karya yang luar biasa.',
    lelah: 'Istirahat sejenak, lalu bangkit lebih kuat dari sebelumnya.',
    sedih: 'Kreativitas terbaik lahir dari hati yang paling dalam.',
    stres: 'Tarik napas, fokus satu langkah. Kamu pasti bisa!',
    onfire: 'Hari ini adalah harimu — ciptakan sesuatu yang epik!',
    kurangsehat: 'Jaga dirimu, kesehatan adalah modal utama berkarya.',
    siaptempur: 'Siap tempur! Jadikan hari ini penuh pencapaian!'
  };
  try {
    var res = await fetch('/api/proxy?action=motivation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood: motivationMood })
    });
    var data = await res.json();
    if (data.text && textEl) textEl.textContent = data.text;
  } catch(e) {
    if (textEl) textEl.textContent = fallbacks[motivationMood] || 'Semangat berkarya hari ini!';
  }
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
