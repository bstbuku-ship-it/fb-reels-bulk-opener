'use strict';

// ── 常量 ─────────────────────────────────────────────────────
const CURRENT_VERSION   = '4.0';
const GITHUB_API        = 'https://api.github.com/repos/bstbuku-ship-it/fb-reels-bulk-opener/releases/latest';
const GITHUB_RELEASES   = 'https://github.com/bstbuku-ship-it/fb-reels-bulk-opener/releases/latest';

// ── 设置默认值 ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  defaultCount:    5,
  preOpenCalendar: true,
};

// ── 运行时状态 ────────────────────────────────────────────────
let settings = { ...DEFAULT_SETTINGS };
let count    = 5;
let busy     = false;

// ── DOM：主页面 ───────────────────────────────────────────────
const pageMain      = document.getElementById('pageMain');
const pageSettings  = document.getElementById('pageSettings');
const btnGear       = document.getElementById('btnGear');
const btnBack       = document.getElementById('btnBack');

const numDisplay    = document.getElementById('numDisplay');
const btnMinus      = document.getElementById('btnMinus');
const btnPlus       = document.getElementById('btnPlus');
const btnGo         = document.getElementById('btnGo');
const statusMsg     = document.getElementById('statusMsg');
const autoCard      = document.getElementById('autoCard');
const autoAvatar    = document.getElementById('autoAvatar');
const autoUrl       = document.getElementById('autoUrl');
const autoPageId    = document.getElementById('autoPageId');
const ftVersion     = document.getElementById('ftVersion');
const ftDot         = document.getElementById('ftDot');
const updateBar     = document.getElementById('updateBar');
const updateTitle   = document.getElementById('updateTitle');
const updateGoBtn   = document.getElementById('updateGoBtn');

// ── DOM：设置页面 ─────────────────────────────────────────────
const togCalendar   = document.getElementById('togCalendar');
const setFt         = document.getElementById('setFt');

// ── 页面切换 ──────────────────────────────────────────────────
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

btnGear.addEventListener('click', () => showPage('pageSettings'));
btnBack.addEventListener('click', () => showPage('pageMain'));

// ── 设置读写 ──────────────────────────────────────────────────
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get('userSettings');
    if (stored.userSettings) {
      settings = { ...DEFAULT_SETTINGS, ...stored.userSettings };
    }
  } catch {}
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({ userSettings: settings });
    setFt.textContent = 'v' + CURRENT_VERSION + ' · 设置已自动保存';
  } catch {}
}

function renderSettings() {
  setToggle(togCalendar, settings.preOpenCalendar);
}

function setToggle(el, on) {
  if (on) el.classList.add('on'); else el.classList.remove('on');
}

function makeTogHandler(el, key) {
  el.addEventListener('click', () => {
    settings[key] = !settings[key];
    setToggle(el, settings[key]);
    saveSettings();
  });
}
makeTogHandler(togCalendar, 'preOpenCalendar');

// ── 状态提示 ──────────────────────────────────────────────────
function showStatus(msg, type) {
  statusMsg.className = type;
  statusMsg.innerHTML = msg;
}

// ── 合法 Page ID 校验 / URL 解析（纯字符串解析，100% 确定，不猜测）──
function isValidPageId(id) {
  return typeof id === 'string' && /^\d{10,20}$/.test(id.trim());
}
function extractAssetId(u) {
  try { return new URL(u).searchParams.get('asset_id') || ''; }
  catch { return ''; }
}

// ── 头像 ──────────────────────────────────────────────────────
function getAvatar(pageId, imgEl, size) {
  imgEl.innerHTML = makeInitialAvatar(pageId, size);
  if (!pageId) return;
  chrome.runtime.sendMessage({ type: 'GET_AVATAR', pageId }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp && resp.ok && resp.dataUrl) {
      const img = document.createElement('img');
      img.style.cssText = `width:${size}px;height:${size}px;object-fit:cover;border-radius:50%;`;
      img.onload  = () => { imgEl.innerHTML = ''; imgEl.appendChild(img); };
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

// 头像获取前 / 获取失败时的占位图标（不使用名称首字母，因为名称不再可靠识别）
function makeInitialAvatar(id, size = 36) {
  const bg = colorFromId(id || '');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="${bg}"/>
    <g transform="translate(${size*0.28},${size*0.24}) scale(${size/36*0.46})">
      <circle cx="12" cy="8" r="4" fill="white" fill-opacity=".9"/>
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="white" fill-opacity=".9"/>
    </g>
  </svg>`;
}

// ── 复制 ID ───────────────────────────────────────────────────
function setupCopyId(el, id) {
  if (!el || !id) return;
  el.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(id);
      const textEl = el.querySelector('.page-id-text');
      if (textEl) {
        const orig = textEl.textContent;
        textEl.textContent = '已复制';
        el.classList.add('copied');
        setTimeout(() => { textEl.textContent = orig; el.classList.remove('copied'); }, 1200);
      }
    } catch {}
  });
}

// ── 数量控制 ──────────────────────────────────────────────────
function setCount(n) {
  count = Math.max(1, Math.min(30, n));
  numDisplay.textContent = count;
  document.querySelectorAll('.qbtn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.n) === count);
  });
}

btnMinus.addEventListener('click', () => {
  setCount(count - 1);
  settings.defaultCount = count;
  saveSettings();
});
btnPlus.addEventListener('click', () => {
  setCount(count + 1);
  settings.defaultCount = count;
  saveSettings();
});
document.getElementById('quickBtns').addEventListener('click', e => {
  const btn = e.target.closest('.qbtn');
  if (btn) {
    setCount(parseInt(btn.dataset.n));
    settings.defaultCount = count;
    saveSettings();
  }
});

// ── 预览卡片：只有在已打开的标签页里现成能读到真实编号时才显示 ──
// 编号来自 URL 参数解析（chrome.tabs.query 拿到的真实网址，100% 可靠），
// 不再尝试识别专业主页名称——那个是从页面 DOM 猜的，经常认成个人账号名，不准确就直接不显示。
async function fetchKnownPageId() {
  try {
    const tabs = await chrome.tabs.query({ url: ['https://business.facebook.com/*'] });
    for (const tab of tabs) {
      const id = extractAssetId(tab.url);
      if (id && isValidPageId(id)) return id;
    }
  } catch {}
  return '';
}

function showPreview(pageId) {
  if (!pageId) { autoCard.classList.remove('show'); return; }
  getAvatar(pageId, autoAvatar, 38);
  autoUrl.textContent = pageId;
  setupCopyId(autoPageId, pageId);
  autoCard.classList.add('show');
}

// ── 版本检测 ──────────────────────────────────────────────────
function compareVersion(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1; if (x < y) return -1;
  }
  return 0;
}

async function checkForUpdate() {
  ftDot.className = '';
  ftDot.title = '正在检测更新…';
  try {
    const res    = await fetch(GITHUB_API);
    const data   = await res.json();
    const latest = (data.tag_name || '').replace(/^v/i, '').trim();
    if (!latest) throw new Error('no tag');
    const cmp = compareVersion(CURRENT_VERSION, latest);
    if (cmp < 0) {
      ftDot.className = 'new'; ftDot.title = '发现新版本 v' + latest;
      ftVersion.classList.add('clickable'); ftVersion.title = '点击前往 GitHub 更新';
      updateTitle.textContent = '发现新版本 v' + latest;
      updateBar.classList.add('show');
    } else if (cmp > 0) {
      ftDot.className = 'beta'; ftDot.title = '内测版';
      ftVersion.textContent = 'v' + CURRENT_VERSION + ' 内测版';
    } else {
      ftDot.className = 'ok'; ftDot.title = '已是最新版';
    }
  } catch {
    ftDot.className = 'err'; ftDot.title = '更新检测失败';
  }
}

function openReleases() { chrome.tabs.create({ url: GITHUB_RELEASES }); }
ftVersion.addEventListener('click', () => { if (ftVersion.classList.contains('clickable')) openReleases(); });
updateGoBtn.addEventListener('click', openReleases);

// ── 主按钮：交给 background.js 探测真实 ID 并批量打开 ──────────
btnGo.addEventListener('click', () => {
  if (busy) return;
  busy = true;
  btnGo.disabled    = true;
  btnGo.textContent = '探测中…';
  showStatus('⏳ 正在打开探测页，确认真实主页编号…', 'warn');

  chrome.runtime.sendMessage({
    type: 'START_BATCH',
    count,
    preOpenCalendar: settings.preOpenCalendar
  });
});

// ── 接收 background.js 的进度通知 ───────────────────────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'BATCH_PROGRESS') {
    if (msg.stage === 'opening') btnGo.textContent = '打开中…';
    if (msg.pageId) showPreview(msg.pageId);
    showStatus(msg.text, msg.stage === 'timeout' ? 'warn' : 'ok');
    return;
  }
  if (msg.type === 'BATCH_DONE') {
    showStatus(
      '✅ 已打开 ' + msg.opened + ' 个创建页' + (msg.usedCalendar ? '，日程本已就绪' : ''),
      'ok'
    );
    setTimeout(() => window.close(), 900);
    return;
  }
});

// ── 初始化 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  ftVersion.textContent = 'v' + CURRENT_VERSION;
  setFt.textContent     = 'v' + CURRENT_VERSION + ' · 设置已自动保存';

  setCount(settings.defaultCount);
  renderSettings();

  const pageId = await fetchKnownPageId();
  showPreview(pageId);

  checkForUpdate();
});
