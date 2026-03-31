/* ============================================================
   renderer.js  —  AI Traffic Management System
   Connects to Flask backend at http://127.0.0.1:5000
   ============================================================ */

const API  = 'http://127.0.0.1:5000';
const DIRS = ['north', 'south', 'east', 'west'];

const pendingFile = {};
const lastSignal  = { north: null, south: null, east: null, west: null };

/* ── Clock ─────────────────────────────────────────────────── */
function tickClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('en-US', { hour12: false });
}
setInterval(tickClock, 1000);
tickClock();

/* ── Add-Video button ──────────────────────────────────────── */
function pickVideo(dir) {
  document.getElementById('filepick-' + dir).click();
}

function handleFilePick(event, dir) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  openTagPicker(dir, file);
}

/* ── Drag & Drop ───────────────────────────────────────────── */
function camDragOver(event, dir) {
  event.preventDefault();
  document.getElementById('lane-' + dir).classList.add('drag-over');
}
function camDragLeave(event, dir) {
  document.getElementById('lane-' + dir).classList.remove('drag-over');
}
function camDrop(event, dir) {
  event.preventDefault();
  document.getElementById('lane-' + dir).classList.remove('drag-over');
  const file = event.dataTransfer.files[0];
  if (!file || !file.type.startsWith('video/')) return;
  openTagPicker(dir, file);
}

/* ── Tag Picker ────────────────────────────────────────────── */
function openTagPicker(dir, file) {
  pendingFile[dir] = file;
  document.getElementById('lane-' + dir).classList.add('tag-picking');
}
function cancelDrop(dir) {
  delete pendingFile[dir];
  document.getElementById('lane-' + dir).classList.remove('tag-picking');
}
async function confirmDrop(dir, tag) {
  const file = pendingFile[dir];
  cancelDrop(dir);
  if (!file) return;
  await uploadClip(dir, file, tag);
}

/* ── Upload to Flask /api/playlists/:dir ───────────────────── */
async function uploadClip(dir, file, tag) {
  const laneEl  = document.getElementById('lane-' + dir);
  const labelEl = document.getElementById('uplabel-' + dir);
  laneEl.classList.add('uploading');
  labelEl.textContent = 'Uploading...';

  const form = new FormData();
  form.append('video', file);
  form.append('tag',   tag);
  form.append('label', file.name);

  try {
    const res = await fetch(API + '/api/playlists/' + dir, { method: 'POST', body: form });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    labelEl.textContent = 'Done!';
    setTimeout(() => laneEl.classList.remove('uploading'), 1200);
    await refreshPlaylist(dir);
    logTerm('Added [' + dir.toUpperCase() + '] "' + file.name + '" (' + tag + ')', 'ok');
  } catch (err) {
    labelEl.textContent = 'Error!';
    setTimeout(() => laneEl.classList.remove('uploading'), 2000);
    logTerm('Upload failed [' + dir + ']: ' + err.message, 'err');
  }
}

/* ── Playlist / Clip Stack ─────────────────────────────────── */
async function refreshPlaylist(dir) {
  try {
    const res  = await fetch(API + '/api/playlists/' + dir);
    const data = await res.json();
    renderStack(dir, data.playlist || [], data.currentIndex || 0);
  } catch (_) {}
}

function renderStack(dir, playlist, currentIndex) {
  const stack = document.getElementById('stack-' + dir);
  if (!stack) return;
  stack.innerHTML = '';
  if (!playlist.length) {
    const e = document.createElement('div');
    e.className   = 'cs-empty';
    e.textContent = 'No clips — add a video below';
    stack.appendChild(e);
    return;
  }
  playlist.forEach(function(clip, i) {
    const emoji = { normal: '🟢', high_congestion: '🟡', emergency: '🔴' }[clip.tag] || '⚪';
    const el = document.createElement('div');
    el.className = 'cs-item' + (i === currentIndex ? ' playing ' + clip.tag : '');
    el.innerHTML =
      '<span class="cs-num">' + (i + 1) + '</span>' +
      '<span class="cs-label" title="' + clip.label + '">' + clip.label + '</span>' +
      '<span class="cs-tag ' + clip.tag + '">' + emoji + '</span>' +
      '<button class="cs-play" onclick="gotoClip(\'' + dir + '\',' + i + ')">&#9654;</button>' +
      '<button class="cs-del"  onclick="removeClip(\'' + dir + '\',' + i + ')">&#x2715;</button>';
    stack.appendChild(el);
  });
}

async function removeClip(dir, index) {
  try {
    const res = await fetch(API + '/api/playlists/' + dir + '/' + index, { method: 'DELETE' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    await refreshPlaylist(dir);
    logTerm('Removed clip #' + (index + 1) + ' from ' + dir.toUpperCase(), 'warn');
  } catch (err) {
    logTerm('Remove failed: ' + err.message, 'err');
  }
}

async function gotoClip(dir, index) {
  try {
    await fetch(API + '/api/playlists/' + dir + '/goto/' + index, { method: 'POST' });
    logTerm('Jumped to clip #' + (index + 1) + ' [' + dir.toUpperCase() + ']');
  } catch (err) {
    logTerm('Goto failed: ' + err.message, 'err');
  }
}
