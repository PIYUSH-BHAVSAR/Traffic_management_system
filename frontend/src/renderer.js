/* ── AI Traffic Management System — renderer.js ─────────────────────────── */
const API = 'http://127.0.0.1:5000';
const DIRS = ['north','south','east','west'];

let signals   = { north:'red', south:'red', east:'red', west:'red' };
let timers    = { north:0, south:0, east:0, west:0 };
let mode      = 'auto';
let emgActive = false;
let camData   = {};
let playlists = {};
let activeLane = 'north';   // currently selected lane in playlist panel
let ppOpen    = false;
let _lastEmgLog = {};

const CAM_BG = { north:'#091508', south:'#080d18', east:'#180808', west:'#0d0818' };

// ── Clock ─────────────────────────────────────────────────────────────────
setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('en-US',{hour12:false});
}, 1000);

// ── Log ───────────────────────────────────────────────────────────────────
function log(msg, type='info') {
  const b = document.getElementById('logBody');
  const e = document.createElement('div');
  e.className = `log-e ${type}`;
  e.textContent = `[${new Date().toLocaleTimeString('en-US',{hour12:false})}] ${msg}`;
  b.prepend(e);
  while (b.children.length > 100) b.lastChild.remove();
}
function clearLogs() { document.getElementById('logBody').innerHTML=''; log('Cleared','info'); }

// ── Signals ───────────────────────────────────────────────────────────────
function applySignals(s) {
  DIRS.forEach(d => {
    const st = s[d]; if (!st) return;
    if (signals[d] !== st)
      log(`Signal ${d.toUpperCase()} → ${st.toUpperCase()}`,
        st==='green'?'ok':st==='yellow'?'warn':'info');
    ['red','yellow','green'].forEach(c => {
      const el = document.getElementById(`${d}-${c}`);
      if (el) el.classList.toggle('active', c===st);
    });
    const glow = document.getElementById(`glow-${d}`);
    if (glow) glow.classList.toggle('on', st==='green');
    const car = document.getElementById(`car-${d}`);
    if (car) car.classList.toggle('on', st==='green');
    updateCard(d, st);
  });
  signals = {...s};
}

function updateCard(d, st) {
  const card = document.getElementById(`card-${d}`);
  const ind  = document.getElementById(`ind-${d}`);
  const stEl = document.getElementById(`state-${d}`);
  const stEl2= document.getElementById(`status-${d}`);
  if (!card) return;
  card.classList.remove('green','yellow','red','emg');
  ind.classList.remove('green','yellow','red');
  card.classList.add(st); ind.classList.add(st);
  stEl.textContent = st.toUpperCase();
  const m = {green:'GO',yellow:'WAIT',red:'STOP'};
  stEl2.textContent = m[st]||'—';
  stEl2.className = `sc-status ${m[st]||''}`;
}

// ── Timers ────────────────────────────────────────────────────────────────
function initTimers(s) { DIRS.forEach(d => { timers[d] = {green:20,yellow:5,red:25}[s[d]]||20; }); }
setInterval(() => {
  DIRS.forEach(d => {
    if (timers[d]>0) timers[d]--;
    const el = document.getElementById(`timer-${d}`);
    if (el) el.textContent = String(timers[d]).padStart(2,'0');
  });
}, 1000);

// ── Fetch Signals ─────────────────────────────────────────────────────────
async function fetchSignals() {
  if (mode!=='auto' || emgActive) return;
  try {
    const r = await fetch(`${API}/api/signals`);
    const d = await r.json();
    applySignals(d); initTimers(d);
  } catch { /* keep current */ }
}

// ── Fetch Cameras ─────────────────────────────────────────────────────────
async function fetchCameras() {
  try {
    const r = await fetch(`${API}/api/cameras`);
    const data = await r.json();
    camData = data;
    let total=0, anyEmg=false, emgLane=null;

    DIRS.forEach(d => {
      const c = data[d]; if (!c) return;
      total += c.vehicleCount;

      // Count + density
      const cntEl  = document.getElementById(`count-${d}`);
      const denEl  = document.getElementById(`density-${d}`);
      if (cntEl) cntEl.textContent = `${c.vehicleCount} vehicles`;
      if (denEl) { denEl.textContent=c.density; denEl.className=`cam-dens ${c.density}`; }

      // Clip info on camera
      const lblEl = document.getElementById(`cliplabel-${d}`);
      const tagEl = document.getElementById(`cliptag-${d}`);
      if (lblEl) lblEl.textContent = c.clipLabel || '—';
      if (tagEl) { tagEl.textContent = tagText(c.clipTag); tagEl.className=`clip-tag ${c.clipTag}`; }

      // Clip progress bar on camera
      const progEl = document.getElementById(`camprog-${d}`);
      if (progEl && c.clipTotal>0) {
        progEl.style.width = `${Math.min(100,(c.clipElapsed/c.clipTotal)*100)}%`;
        progEl.style.background = c.clipTag==='emergency'?'var(--red)':
          c.clipTag==='high_congestion'?'var(--yellow)':'var(--cyan)';
      }

      // Traffic bar (left edge height = congestion)
      const tbEl = document.getElementById(`trafficbar-${d}`);
      if (tbEl) {
        const pct = Math.min(100,(c.vehicleCount/25)*100);
        tbEl.style.background = c.density==='HIGH'?'var(--red)':
          c.density==='MEDIUM'?'var(--yellow)':'var(--green)';
        tbEl.style.height = `${pct}%`;
        tbEl.style.top = `${100-pct}%`;
      }

      // Road density fill on intersection
      updateRoadDensity(d, c.vehicleCount, c.density);

      // Road count label
      const rcEl = document.getElementById(`rc-${d}`);
      if (rcEl) rcEl.textContent = `${c.vehicleCount} 🚗`;

      // Road tag label
      const rtEl = document.getElementById(`rt-${d}`);
      if (rtEl) {
        if (c.clipTag==='emergency'||c.clipTag==='high_congestion') {
          rtEl.textContent = c.clipTag==='emergency'?'🚨 EMG':'🚗 HIGH';
          rtEl.className = `rtag show ${c.clipTag}`;
        } else {
          rtEl.className = 'rtag';
        }
      }

      // Signal card clip info
      const scClip = document.getElementById(`sclip-${d}`);
      if (scClip) scClip.textContent = c.clipLabel ? `📹 ${c.clipLabel}` : '';

      // Signal card vehicle count
      const vehEl = document.getElementById(`veh-${d}`);
      if (vehEl) vehEl.textContent = `${c.vehicleCount} vehicles`;

      // Emergency
      const feed = document.getElementById(`cam-${d}`);
      if (feed) {
        feed.classList.toggle('emg-active',  !!c.emergency);
        feed.classList.toggle('cong-active', !c.emergency && c.density==='HIGH');
      }
      if (c.emergency) {
        anyEmg=true; emgLane=d;
        if (!_lastEmgLog[d]) {
          log(`🚨 EMERGENCY at ${d.toUpperCase()} — conf ${(c.confidence*100).toFixed(0)}%`, 'err');
          _lastEmgLog[d]=true;
          showAmbulance(d);
          // Mark signal card
          const card = document.getElementById(`card-${d}`);
          if (card) { card.classList.add('emg'); }
          const st2 = document.getElementById(`status-${d}`);
          if (st2) { st2.textContent='EMG'; st2.className='sc-status EMG'; }
        }
      } else {
        _lastEmgLog[d]=false;
        const card = document.getElementById(`card-${d}`);
        if (card) card.classList.remove('emg');
      }
    });

    // Siren
    document.getElementById('sirenOverlay').classList.toggle('on', anyEmg);

    // Status badge
    const badge = document.getElementById('statusBadge');
    const stTxt = document.getElementById('statusText');
    badge.classList.toggle('emg', anyEmg);
    stTxt.textContent = anyEmg ? `🚨 EMERGENCY — ${emgLane?.toUpperCase()}` : 'LIVE · AI ACTIVE';

    // AI panel
    const greenLane = Object.entries(signals).find(([,v])=>v==='green')?.[0];
    document.getElementById('aiMode').textContent  = mode.toUpperCase();
    document.getElementById('aiGreen').textContent = greenLane?.toUpperCase()||'—';
    document.getElementById('aiTotal').textContent = total;
    const emgEl  = document.getElementById('aiEmg');
    const aiBadge= document.getElementById('aiBadge');
    if (anyEmg) {
      emgEl.textContent=`🚨 ${emgLane?.toUpperCase()}`; emgEl.className='red';
      aiBadge.textContent='EMERGENCY'; aiBadge.className='ai-badge emg';
    } else {
      emgEl.textContent='None'; emgEl.className='green';
      aiBadge.textContent='ACTIVE'; aiBadge.className='ai-badge';
    }

    // Refresh playlist panel if open
    if (ppOpen) renderPlaylistClips();

  } catch { /* keep */ }
}

function tagText(tag) {
  if (tag==='emergency')       return '🔴 Emergency';
  if (tag==='high_congestion') return '🟡 High Congestion';
  return '🟢 Normal';
}

function updateRoadDensity(d, count, density) {
  const el = document.getElementById(`rd-${d}`);
  if (!el) return;
  const pct = Math.min(100,(count/25)*100);
  const col = density==='HIGH'?'var(--red)':density==='MEDIUM'?'var(--yellow)':'var(--green)';
  if (d==='north'||d==='south') el.style.height=`${pct*.44}%`;
  else el.style.width=`${pct*.44}%`;
  el.style.background = d==='north'?`linear-gradient(to bottom,${col},transparent)`:
    d==='south'?`linear-gradient(to top,${col},transparent)`:
    d==='east'?`linear-gradient(to left,${col},transparent)`:
    `linear-gradient(to right,${col},transparent)`;
}

function showAmbulance(dir) {
  const a = document.getElementById('car-amb');
  if (!a) return;
  a.style.display='block'; a.classList.add('on');
  const anims = {north:'dn',south:'ds',east:'de',west:'dw'};
  const tops  = {north:'calc(50% - 17px)',south:'calc(50% + 4px)',east:'calc(50% - 17px)',west:'calc(50% + 4px)'};
  a.style.top  = tops[dir]||'calc(50% + 4px)';
  a.style.animation = `${anims[dir]||'dw'} 1.6s linear infinite`;
  setTimeout(()=>{ a.style.display='none'; a.classList.remove('on'); }, 14000);
}

// ── Canvas Draw ───────────────────────────────────────────────────────────
function drawCam(dir, count, density, emg) {
  const cv = document.getElementById(`canvas-${dir}`);
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width  = cv.offsetWidth  || 120;
  const H = cv.height = cv.offsetHeight || 85;
  ctx.fillStyle = emg ? '#180505' : CAM_BG[dir];
  ctx.fillRect(0,0,W,H);
  // Road
  ctx.fillStyle='#1a2030';
  if (dir==='north'||dir==='south') ctx.fillRect(W*.28,0,W*.44,H);
  else ctx.fillRect(0,H*.28,W,H*.44);
  // Center dash
  ctx.strokeStyle='rgba(246,201,14,.35)'; ctx.setLineDash([9,9]); ctx.lineWidth=1.5;
  ctx.beginPath();
  if (dir==='north'||dir==='south'){ctx.moveTo(W*.5,0);ctx.lineTo(W*.5,H);}
  else{ctx.moveTo(0,H*.5);ctx.lineTo(W,H*.5);}
  ctx.stroke(); ctx.setLineDash([]);
  // Vehicles
  const n = Math.min(count,10);
  const col = emg?'#fc5c5c':density==='HIGH'?'#fc5c5c':density==='MEDIUM'?'#f6c90e':'#48bb78';
  for (let i=0;i<n;i++) {
    const t=Date.now()*.00018;
    const x=(Math.sin(i*137.5+t)*.5+.5)*W*.82+W*.09;
    const y=(Math.cos(i*97.3+t)*.5+.5)*H*.82+H*.09;
    ctx.fillStyle=col; ctx.globalAlpha=.88;
    ctx.beginPath(); ctx.roundRect(x-6,y-3.5,12,7,2); ctx.fill();
    ctx.globalAlpha=1;
  }
  // Emergency flash
  if (emg) {
    const a=.1+.09*Math.sin(Date.now()*.01);
    ctx.fillStyle=`rgba(252,92,92,${a})`; ctx.fillRect(0,0,W,H);
  }
  // Scanlines
  ctx.fillStyle='rgba(0,0,0,.06)';
  for (let y=0;y<H;y+=3) ctx.fillRect(0,y,W,1);
  // Timestamp
  ctx.fillStyle=emg?'rgba(252,92,92,.9)':'rgba(99,179,237,.65)';
  ctx.font='8px monospace';
  ctx.fillText(new Date().toLocaleTimeString(),4,H-4);
}

// ── Mode / Manual / Emergency ─────────────────────────────────────────────
function setMode(m) {
  mode=m;
  document.getElementById('btn-auto').classList.toggle('active',m==='auto');
  document.getElementById('btn-manual').classList.toggle('active',m==='manual');
  document.getElementById('manualRow').classList.toggle('show',m==='manual');
  log(`Mode → ${m.toUpperCase()}`,'info');
  fetch(`${API}/api/manual`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:m})}).catch(()=>{});
}
function manualSet(d,st) {
  if (mode!=='manual') return;
  const s={...signals}; s[d]=st;
  if (st==='green') DIRS.forEach(x=>{if(x!==d)s[x]='red';});
  applySignals(s);
  fetch(`${API}/api/manual`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'manual',signals:s})}).catch(()=>{});
}
function allRed() {
  const s={north:'red',south:'red',east:'red',west:'red'};
  applySignals(s); log('ALL RED','err');
  fetch(`${API}/api/manual`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mode:'manual',signals:s})}).catch(()=>{});
}
function triggerEmergency() {
  emgActive=!emgActive;
  const btn=document.getElementById('btn-emg');
  btn.classList.toggle('active',emgActive);
  btn.textContent = emgActive ? '✓ EMG ON' : '⚠ EMERGENCY';
  if (emgActive) {
    allRed(); log('MANUAL EMERGENCY','err');
    fetch(`${API}/api/emergency`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'trigger',lane:'north'})}).catch(()=>{});
  } else {
    log('Emergency cleared','info');
    fetch(`${API}/api/emergency`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action:'clear'})}).catch(()=>{});
  }
}

// ── Drag & Drop onto Camera Feed ─────────────────────────────────────────
// Stores the pending file per lane until user picks a tag
const _dropPending = {};   // lane → File

function camDragOver(e, lane) {
  e.preventDefault();
  e.stopPropagation();
  // Only accept video files
  const hasVideo = [...(e.dataTransfer.types||[])].includes('Files');
  if (!hasVideo) return;
  e.dataTransfer.dropEffect = 'copy';
  const feed = document.getElementById(`cam-${lane}`);
  if (feed && !feed.classList.contains('tag-picking') && !feed.classList.contains('uploading')) {
    feed.classList.add('drag-over');
  }
}

function camDragLeave(e, lane) {
  // Only remove if leaving the feed entirely (not entering a child)
  const feed = document.getElementById(`cam-${lane}`);
  if (feed && !feed.contains(e.relatedTarget)) {
    feed.classList.remove('drag-over');
  }
}

function camDrop(e, lane) {
  e.preventDefault();
  e.stopPropagation();
  const feed = document.getElementById(`cam-${lane}`);
  if (!feed) return;
  feed.classList.remove('drag-over');

  const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('video/') || /\.(mp4|avi|mov|mkv|webm)$/i.test(f.name));
  if (!files.length) {
    log(`Drop rejected — not a video file`, 'warn');
    return;
  }

  const file = files[0];
  _dropPending[lane] = file;

  // Show tag picker
  feed.classList.add('tag-picking');
  log(`Video dropped on ${lane.toUpperCase()}: ${file.name} — pick a tag`, 'info');
}

function cancelDrop(lane) {
  delete _dropPending[lane];
  const feed = document.getElementById(`cam-${lane}`);
  if (feed) feed.classList.remove('tag-picking');
}

async function confirmDrop(lane, tag) {
  const file = _dropPending[lane];
  if (!file) return;
  delete _dropPending[lane];

  const feed = document.getElementById(`cam-${lane}`);
  if (feed) { feed.classList.remove('tag-picking'); feed.classList.add('uploading'); }

  const labelEl = document.getElementById(`duplabel-${lane}`);
  if (labelEl) labelEl.textContent = `Uploading ${file.name}…`;

  const label = file.name.replace(/\.[^.]+$/, '');

  try {
    const fd = new FormData();
    fd.append('video', file);
    fd.append('tag',   tag);
    fd.append('label', label);

    const r = await fetch(`${API}/api/playlists/${lane}`, { method: 'POST', body: fd });
    const d = await r.json();

    if (feed) feed.classList.remove('uploading');

    if (d.success) {
      playlists[lane] = d.playlist;
      updatePlaylistCount(lane);
      // Jump to the new clip immediately
      const newIdx = d.playlist.length - 1;
      await fetch(`${API}/api/playlists/${lane}/goto/${newIdx}`, { method: 'POST' });

      log(`✓ "${label}" added to ${lane.toUpperCase()} as [${tag}] — playing now`, 'ok');
      // Success flash
      if (feed) {
        feed.classList.add('drop-success');
        setTimeout(() => feed.classList.remove('drop-success'), 700);
      }
      if (ppOpen && activeLane === lane) renderPlaylistClips();
    } else {
      log(`Upload failed: ${d.error || 'unknown'}`, 'err');
    }
  } catch (err) {
    if (feed) feed.classList.remove('uploading');
    log(`Upload error: ${err.message}`, 'err');
  }
}

function updatePlaylistCount(lane) {
  const el = document.getElementById(`plcount-${lane}`);
  if (el) el.textContent = (playlists[lane]||[]).length;
}

function updateAllPlaylistCounts() {
  ['north','south','east','west'].forEach(updatePlaylistCount);
}
function togglePlaylistPanel() {
  ppOpen=!ppOpen;
  document.getElementById('playlistPanel').classList.toggle('open',ppOpen);
  document.getElementById('mainGrid').classList.toggle('pp-open',ppOpen);
  if (ppOpen) { loadPlaylists(); }
}

function openPlaylistForLane(lane) {
  activeLane=lane;
  if (!ppOpen) togglePlaylistPanel();
  else { selectLaneTab(lane); }
}

function selectLaneTab(lane) {
  activeLane=lane;
  DIRS.forEach(d => {
    document.getElementById(`tab-${d}`).classList.toggle('active',d===lane);
  });
  renderPlaylistClips();
}

async function loadPlaylists() {
  try {
    const r = await fetch(`${API}/api/playlists`);
    playlists = await r.json();
    updateAllPlaylistCounts();
    selectLaneTab(activeLane);
  } catch { log('Could not load playlists','warn'); }
}

function renderPlaylistClips() {
  const container = document.getElementById('ppClips');
  const pl = playlists[activeLane] || [];
  const cur = camData[activeLane]?.currentClip ?? 0;
  const elapsed = camData[activeLane]?.clipElapsed ?? 0;
  const total   = camData[activeLane]?.clipTotal   ?? 20;

  container.innerHTML = '';

  if (pl.length === 0) {
    container.innerHTML = '<div style="color:var(--dim);font-size:11px;padding:8px">No clips. Add one below.</div>';
    return;
  }

  pl.forEach((clip, i) => {
    const isPlaying = i === cur;
    const div = document.createElement('div');
    div.className = `clip-item ${isPlaying ? 'playing '+clip.tag : ''}`;

    const pct = isPlaying ? Math.min(100,(elapsed/total)*100) : 0;

    div.innerHTML = `
      <div class="clip-num">${i+1}</div>
      <div class="clip-info">
        <div class="clip-name">${clip.label || 'Clip '+i}</div>
        <div class="clip-path">${clip.path}</div>
        ${isPlaying ? `<div class="clip-progress"><div class="clip-progress-fill" style="width:${pct}%;background:${clip.tag==='emergency'?'var(--red)':clip.tag==='high_congestion'?'var(--yellow)':'var(--cyan)'}"></div></div>` : ''}
      </div>
      <span class="clip-tag-badge ${clip.tag}">${tagBadge(clip.tag)}</span>
      <div class="clip-actions">
        <button class="clip-btn play-now" onclick="gotoClip('${activeLane}',${i})" title="Play now">▶</button>
        <button class="clip-btn del" onclick="removeClip('${activeLane}',${i})" title="Remove">✕</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function tagBadge(tag) {
  if (tag==='emergency')       return '🔴 Emergency';
  if (tag==='high_congestion') return '🟡 High Congestion';
  return '🟢 Normal';
}

async function gotoClip(lane, index) {
  try {
    await fetch(`${API}/api/playlists/${lane}/goto/${index}`, {method:'POST'});
    log(`${lane.toUpperCase()} → clip ${index+1}`,'ok');
    await loadPlaylists();
  } catch { log('Skip failed','warn'); }
}

async function removeClip(lane, index) {
  try {
    await fetch(`${API}/api/playlists/${lane}/${index}`, {method:'DELETE'});
    log(`Removed clip ${index+1} from ${lane.toUpperCase()}`,'warn');
    await loadPlaylists();
  } catch { log('Remove failed','warn'); }
}

// ── Add Clip ──────────────────────────────────────────────────────────────
let _pendingFile = null;

function handlePPFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  _pendingFile = file;
  document.getElementById('addPath').value = file.name;
  if (!document.getElementById('addLabel').value)
    document.getElementById('addLabel').value = file.name.replace(/\.[^.]+$/,'');
}

async function addClip() {
  const label = document.getElementById('addLabel').value.trim();
  const tag   = document.getElementById('addTag').value;
  const path  = document.getElementById('addPath').value.trim();

  if (!label) { log('Enter a label','warn'); return; }
  if (!path && !_pendingFile) { log('Select a video file','warn'); return; }

  const prog  = document.getElementById('ppProgress');
  const fill  = document.getElementById('ppProgFill');
  const lbl   = document.getElementById('ppProgLabel');
  prog.style.display='flex';

  try {
    if (_pendingFile) {
      // Upload file
      lbl.textContent='Uploading…';
      const fd = new FormData();
      fd.append('video', _pendingFile);
      fd.append('tag',   tag);
      fd.append('label', label);
      // Fake progress
      let p=0;
      const iv = setInterval(()=>{ p=Math.min(p+8,90); fill.style.width=p+'%'; },120);
      const r = await fetch(`${API}/api/playlists/${activeLane}`, {method:'POST', body:fd});
      clearInterval(iv); fill.style.width='100%';
      const d = await r.json();
      if (d.success) {
        playlists[activeLane] = d.playlist;
        log(`Added "${label}" to ${activeLane.toUpperCase()} (${tag})`,'ok');
      }
    } else {
      // Path-based
      fill.style.width='60%';
      const r = await fetch(`${API}/api/playlists/${activeLane}`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({path, tag, label})
      });
      fill.style.width='100%';
      const d = await r.json();
      if (d.success) {
        playlists[activeLane] = d.playlist;
        log(`Added "${label}" to ${activeLane.toUpperCase()} (${tag})`,'ok');
      }
    }
  } catch { log('Add clip failed','err'); }

  // Reset form
  document.getElementById('addLabel').value='';
  document.getElementById('addPath').value='';
  document.getElementById('addTag').value='normal';
  _pendingFile=null;
  document.getElementById('ppFileInput').value='';
  setTimeout(()=>{ prog.style.display='none'; fill.style.width='0%'; },600);
  renderPlaylistClips();
}

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  log('System initializing…','info');
  await fetchSignals();
  await fetchCameras();
  await loadPlaylists();
  log('All systems online ✓','ok');
  log('AI models active — YOLO traffic + emergency','ok');
  log('4 lanes processing video playlists','ok');

  setInterval(fetchSignals, 3000);
  setInterval(fetchCameras, 2000);

  // Canvas loop
  requestAnimationFrame(function loop() {
    DIRS.forEach(d => {
      const c = camData[d];
      drawCam(d, c?.vehicleCount??4, c?.density??'LOW', c?.emergency??false);
    });
    requestAnimationFrame(loop);
  });
}

init();
