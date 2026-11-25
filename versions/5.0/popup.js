'use strict';
const CURRENT_VERSION = '5.0';
const GITHUB_API = 'https://api.github.com/repos/bstbuku-ship-it/fb-reels-bulk-opener/releases/latest';
const GITHUB_RELEASES = 'https://github.com/bstbuku-ship-it/fb-reels-bulk-opener/releases/latest';
const DEFAULT_SETTINGS = { fbCount: 5, ytCount: 3, preOpenCalendarFb: true, preOpenCalendarYt: true, mode: 'fb' };
let settings = { ...DEFAULT_SETTINGS };
let mode = 'fb';
let count = 5;
let busy = false;
const pageMain = document.getElementById('pageMain');
const pageSettings = document.getElementById('pageSettings');
const btnGear = document.getElementById('btnGear');
const btnBack = document.getElementById('btnBack');
const numDisplay = document.getElementById('numDisplay');
const btnMinus = document.getElementById('btnMinus');
const btnPlus = document.getElementById('btnPlus');
const btnGo = document.getElementById('btnGo');
const statusMsg = document.getElementById('statusMsg');
const autoCard = document.getElementById('autoCard');
const autoAvatar = document.getElementById('autoAvatar');
const autoUrl = document.getElementById('autoUrl');
const autoPageId = document.getElementById('autoPageId');
const ftVersion = document.getElementById('ftVersion');
const ftDot = document.getElementById('ftDot');
const updateBar = document.getElementById('updateBar');
const updateTitle = document.getElementById('updateTitle');
const updateGoBtn = document.getElementById('updateGoBtn');
const hdMain = document.getElementById('hdMain');
const setHd = document.getElementById('setHd');
const cntCtrl = document.getElementById('cntCtrl');
const quickBtns = document.getElementById('quickBtns');
const togFb = document.getElementById('togCalendarFb');
const togYt = document.getElementById('togCalendarYt');
const modeFb = document.getElementById('modeFb');
const modeYt = document.getElementById('modeYt');
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
btnGear.addEventListener('click', () => showPage('pageSettings'));
btnBack.addEventListener('click', () => showPage('pageMain'));
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get('userSettings');
    if (stored.userSettings && typeof stored.userSettings === 'object') {
      const s = stored.userSettings;
      const fb = Number(s.fbCount !== undefined ? s.fbCount : s.defaultCount);
      const yt = Number(s.ytCount);
      settings = {
        fbCount: Number.isInteger(fb) && fb >= 1 && fb <= 30 ? fb : 5,
        ytCount: Number.isInteger(yt) && yt >= 1 && yt <= 30 ? yt : 3,
        preOpenCalendarFb: s.preOpenCalendarFb !== undefined ? s.preOpenCalendarFb === true : (s.preOpenCalendar === undefined ? true : s.preOpenCalendar === true),
        preOpenCalendarYt: s.preOpenCalendarYt !== undefined ? s.preOpenCalendarYt === true : true,
        mode: s.mode === 'yt' ? 'yt' : 'fb'
      };
    }
  } catch {}
}
async function saveSettings() {
  try { await chrome.storage.local.set({ userSettings: settings }); } catch {}
}
function renderSettings() {
  setToggle(togFb, settings.preOpenCalendarFb);
  setToggle(togYt, settings.preOpenCalendarYt);
}
function setToggle(el, on) { if (on) el.classList.add('on'); else el.classList.remove('on'); }
function makeTogHandler(el, key) {
  el.addEventListener('click', () => { settings[key] = !settings[key]; setToggle(el, settings[key]); saveSettings(); });
}
makeTogHandler(togFb, 'preOpenCalendarFb');
makeTogHandler(togYt, 'preOpenCalendarYt');
function showStatus(msg, type) { statusMsg.className = type; statusMsg.textContent = msg; }
function isValidPageId(id) { return typeof id === 'string' && /^\d{10,20}$/.test(id.trim()); }
function extractAssetId(u) { try { return new URL(u).searchParams.get('asset_id') || ''; } catch { return ''; } }
function getAvatar(pageId, imgEl, size) {
  imgEl.replaceChildren(makeInitialAvatar(pageId, size));
  if (!pageId) return;
  chrome.runtime.sendMessage({ type: 'GET_AVATAR', pageId }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp && resp.ok && resp.dataUrl) {
      const img = document.createElement('img');
      img.style.cssText = `width:${size}px;height:${size}px;object-fit:cover;border-radius:50%;`;
      img.onload = () => { imgEl.replaceChildren(img); };
      img.onerror = () => {};
      img.src = resp.dataUrl;
    }
  });
}
function colorFromId(id) {
  const palette = ['#1877F2','#00B2FF','#0e9f6e','#e0700a','#7c3aed','#db2777','#b45309','#047857'];
  let hash = 0;
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return palette[Math.abs(hash) % palette.length];
}
function makeInitialAvatar(id, size = 36) {
  const namespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size)); svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const circle = document.createElementNS(namespace, 'circle');
  circle.setAttribute('cx', String(size / 2)); circle.setAttribute('cy', String(size / 2)); circle.setAttribute('r', String(size / 2)); circle.setAttribute('fill', colorFromId(id || ''));
  svg.appendChild(circle);
  const group = document.createElementNS(namespace, 'g');
  group.setAttribute('transform', `translate(${size * 0.28},${size * 0.24}) scale(${size / 36 * 0.46})`);
  const head = document.createElementNS(namespace, 'circle');
  head.setAttribute('cx', '12'); head.setAttribute('cy', '8'); head.setAttribute('r', '4'); head.setAttribute('fill', 'white'); head.setAttribute('fill-opacity', '.9');
  const body = document.createElementNS(namespace, 'path');
  body.setAttribute('d', 'M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8'); body.setAttribute('fill', 'white'); body.setAttribute('fill-opacity', '.9');
  group.append(head, body); svg.appendChild(group); return svg;
}
function setupCopyId(el, id) {
  if (!el || !id) return;
  el.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(id);
      const textEl = el.querySelector('.page-id-text');
      if (textEl) { const orig = textEl.textContent; textEl.textContent = '已复制'; el.classList.add('copied'); setTimeout(() => { textEl.textContent = orig; el.classList.remove('copied'); }, 1200); }
    } catch {}
  });
}
function setCount(n) {
  count = Math.max(1, Math.min(30, n));
  numDisplay.textContent = count;
  document.querySelectorAll('.qbtn').forEach(b => { b.classList.toggle('active', parseInt(b.dataset.n) === count); });
  if (mode === 'fb') settings.fbCount = count; else settings.ytCount = count;
}
function applyMode(m) {
  mode = m; settings.mode = m;
  modeFb.classList.toggle('active', m === 'fb');
  modeYt.classList.toggle('active', m === 'yt');
  hdMain.classList.toggle('yt', m === 'yt');
  setHd.classList.toggle('yt', m === 'yt');
  cntCtrl.classList.toggle('yt', m === 'yt');
  quickBtns.classList.toggle('yt', m === 'yt');
  btnGo.classList.toggle('yt', m === 'yt');
  if (m === 'yt') { autoCard.classList.remove('show'); } 
  setCount(m === 'fb' ? settings.fbCount : settings.ytCount);
  saveSettings();
}
modeFb.addEventListener('click', () => { applyMode('fb'); refreshPreview(); });
modeYt.addEventListener('click', () => { applyMode('yt'); });
btnMinus.addEventListener('click', () => { setCount(count - 1); saveSettings(); });
btnPlus.addEventListener('click', () => { setCount(count + 1); saveSettings(); });
quickBtns.addEventListener('click', e => { const btn = e.target.closest('.qbtn'); if (btn) { setCount(parseInt(btn.dataset.n)); saveSettings(); } });
async function fetchKnownPageId() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://business.facebook.com/*'] });
    for (const tab of tabs) { const id = extractAssetId(tab.url); if (id && isValidPageId(id)) return id; }
  } catch {}
  return '';
}
function showPreview(pageId) {
  if (!pageId || mode !== 'fb') { autoCard.classList.remove('show'); return; }
  getAvatar(pageId, autoAvatar, 38);
  autoUrl.textContent = pageId;
  setupCopyId(autoPageId, pageId);
  autoCard.classList.add('show');
}
async function refreshPreview() { const pageId = await fetchKnownPageId(); showPreview(pageId); }
function compareVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x > y) return 1; if (x < y) return -1; }
  return 0;
}
async function checkForUpdate() {
  ftDot.className = ''; ftDot.title = '正在检测更新…';
  try {
    const res = await fetch(GITHUB_API);
    const data = await res.json();
    const latest = (data.tag_name || '').replace(/^v/i, '').trim();
    if (!latest) throw new Error('no tag');
    const cmp = compareVersion(CURRENT_VERSION, latest);
    if (cmp < 0) { ftDot.className = 'new'; ftDot.title = '发现新版本 v' + latest; ftVersion.classList.add('clickable'); ftVersion.title = '点击前往 GitHub 更新'; updateTitle.textContent = '发现新版本 v' + latest; updateBar.classList.add('show'); }
    else if (cmp > 0) { ftDot.className = 'beta'; ftDot.title = '内测版'; ftVersion.textContent = 'v' + CURRENT_VERSION + ' 内测版'; }
    else { ftDot.className = 'ok'; ftDot.title = '已是最新版'; }
  } catch { ftDot.className = 'err'; ftDot.title = '更新检测失败'; }
}
function openReleases() { chrome.tabs.create({ url: GITHUB_RELEASES }); }
ftVersion.addEventListener('click', () => { if (ftVersion.classList.contains('clickable')) openReleases(); });
updateGoBtn.addEventListener('click', openReleases);
btnGo.addEventListener('click', () => {
  if (busy) return;
  busy = true; btnGo.disabled = true;
  btnGo.textContent = mode === 'fb' ? '探测中…' : '打开中…';
  if (mode === 'fb') showStatus('正在打开探测页，确认真实主页编号…', 'warn');
  else showStatus('正在确认油管账号…', 'warn');
  chrome.runtime.sendMessage({ type: 'START_BATCH', mode, count, preOpenCalendar: mode === 'fb' ? settings.preOpenCalendarFb : settings.preOpenCalendarYt }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok) { busy = false; btnGo.disabled = false; btnGo.textContent = '快速批量打开'; showStatus('无法启动批量操作，请重新打开弹窗后重试。', 'err'); }
  });
});
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'BATCH_PROGRESS') {
    if (msg.stage === 'opening') btnGo.textContent = '打开中…';
    if (msg.pageId) showPreview(msg.pageId);
    showStatus(msg.text, msg.stage === 'timeout' ? 'warn' : 'ok');
    return;
  }
  if (msg.type === 'BATCH_ERROR') { busy = false; btnGo.disabled = false; btnGo.textContent = '快速批量打开'; showStatus(msg.text || '批量打开失败，请重试。', 'err'); return; }
  if (msg.type === 'BATCH_DONE') {
    const suffix = msg.usedCalendar ? (msg.mode === 'yt' ? '，短视频列表已就绪' : '，日程本已就绪') : '';
    showStatus('已打开 ' + msg.opened + ' 个创建页' + suffix, 'ok');
    setTimeout(() => window.close(), 900);
    return;
  }
});
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  ftVersion.textContent = 'v' + CURRENT_VERSION;
  applyMode(settings.mode);
  renderSettings();
  await refreshPreview();
  checkForUpdate();
});
