'use strict';
// v5.0：FB 沿用 v4.0 探测真实编号逻辑；YT 按两步法拿频道编号。
// 没账号不打开：拿不到编号就说明这个浏览器上没登录对应账号，
// 这时只留探测页那一个标签页（那页就是登录页，让用户自己去登录），
// 上传页、创建页一个都不开，只报“没检测到账号，请先登录”，不给用户添乱。
// YT 前置任务：按用户给的两步法开短视频列表页。
// 第一步先开 https://studio.youtube.com/channel/ ，
// 浏览器会自动跳到带频道编号的地址 https://studio.youtube.com/channel/<频道编号>，
// 第二步从地址里取出频道编号，同一标签页跳到
// https://studio.youtube.com/channel/<频道编号>/videos/short，
// 就是频道内容里选了 Shorts 的那页。两步在同一个标签页里接上做，
// 用户看起来就像直接打开了那页。
// 注意：studio.youtube.com/videos 这个地址打不开（会报“糟糕，出了一点问题”），
// 一定要带频道编号才行；前置任务没开时，探测页只是用来确认账号，
// 拿到编号就关掉，再批量开上传页。
const REELS_TEMPLATE = 'https://business.facebook.com/latest/reels_composer/?ref=biz_web_content_manager_calendar_view&context_ref=CONTENT_CALENDAR';
const REELS_WITH_ID = 'https://business.facebook.com/latest/reels_composer/?ref=biz_web_content_manager_calendar_view&asset_id=__ID__&context_ref=CONTENT_CALENDAR';
const CALENDAR_TEMPLATE = 'https://business.facebook.com/latest/content_calendar?asset_id=__ID__';
const YT_UPLOAD = 'https://www.youtube.com/upload';
const YT_CHANNEL_BASE = 'https://studio.youtube.com/channel/';
const YT_SHORTS_SUFFIX = '/videos/short';
const PROBE_TIMEOUT_MS = 8000;
function buildReelsUrl(pageId) { return pageId ? REELS_WITH_ID.replace('__ID__', pageId) : REELS_TEMPLATE; }
function buildCalendarUrl(pageId) { return CALENDAR_TEMPLATE.replace('__ID__', pageId); }
function extractAssetId(url) { try { return new URL(url).searchParams.get('asset_id') || ''; } catch { return ''; } }
function extractChannelId(url) {
  try {
    const m = new URL(url).pathname.match(/^\/channel\/(UC[0-9A-Za-z_-]+)/);
    return m ? m[1] : '';
  } catch { return ''; }
}
// YT 两步法：先开频道页等它自动带上编号，再把同一页跳到短视频列表。
// 拿到编号就返回编号和标签页编号，8 秒拿不到就返回空编号，
// 调用方按没账号处理：探测页留着（那页就是登录页），一个上传页都不开。
function openYtShortsTab() {
  return new Promise((resolve) => {
    let settled = false; let shortsTabId = null; let timer = null;
    const listener = (tabId, changeInfo) => { if (tabId !== shortsTabId || !changeInfo.url) return; const id = extractChannelId(changeInfo.url); if (id) finish(id); };
    function finish(id) { if (settled) return; settled = true; if (timer) clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve({ channelId: id || '', tabId: shortsTabId }); }
    chrome.tabs.onUpdated.addListener(listener);
    (async () => {
      try {
        const tab = await chrome.tabs.create({ url: YT_CHANNEL_BASE, active: true });
        shortsTabId = tab.id;
        if (tab.url) { const id = extractChannelId(tab.url); if (id) { finish(id); return; } }
      } catch { finish(''); return; }
      timer = setTimeout(() => finish(''), PROBE_TIMEOUT_MS);
    })();
  });
}
function isValidPageId(id) { return typeof id === 'string' && /^\d{10,20}$/.test(id); }
function notifyPopup(msg) { try { chrome.runtime.sendMessage(msg); } catch {} }
function isPopupMessage(sender) { return sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL('popup.html')); }
function probeRealPageId() {
  return new Promise((resolve) => {
    let settled = false; let probeTabId = null;
    const listener = (tabId, changeInfo) => { if (tabId !== probeTabId || !changeInfo.url) return; const id = extractAssetId(changeInfo.url); if (id && isValidPageId(id)) finish(id); };
    function finish(id) { if (settled) return; settled = true; chrome.tabs.onUpdated.removeListener(listener); resolve({ pageId: id || '', tabId: probeTabId }); }
    chrome.tabs.onUpdated.addListener(listener);
    (async () => {
      try {
        const tab = await chrome.tabs.create({ url: REELS_TEMPLATE, active: true });
        probeTabId = tab.id;
        if (tab.url) { const id = extractAssetId(tab.url); if (id && isValidPageId(id)) { finish(id); return; } }
      } catch { finish(''); return; }
      setTimeout(() => finish(''), PROBE_TIMEOUT_MS);
    })();
  });
}
let batchInProgress = false;
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!isPopupMessage(sender) || !msg || typeof msg !== 'object') return false;
  if (msg.type === 'START_BATCH') {
    const count = Number(msg.count);
    const mode = msg.mode === 'yt' ? 'yt' : 'fb';
    const preOpenCalendar = msg.preOpenCalendar === true;
    if (!Number.isInteger(count) || count < 1 || count > 30 || batchInProgress) { sendResponse({ ok: false, error: 'invalid request' }); return false; }
    batchInProgress = true;
    (async () => {
      if (mode === 'yt') {
        let opened = 0;
        let usedCalendar = false;
        // 没账号不打开：先确认频道编号，拿不到就是没登录油管账号，
        // 探测页留着（那页就是登录页，让用户自己去登录），
        // 一个上传页都不开，只报一句话。
        notifyPopup({ type: 'BATCH_PROGRESS', stage: 'probing', text: '正在确认油管账号…' });
        const { channelId, tabId: shortsTabId } = await openYtShortsTab();
        if (!channelId) {
          notifyPopup({ type: 'BATCH_ERROR', text: '没检测到油管账号，留下的那页就是登录页，请先登录再点。' });
          batchInProgress = false;
          return;
        }
        if (preOpenCalendar) {
          try {
            await chrome.tabs.update(shortsTabId, { url: YT_CHANNEL_BASE + channelId + YT_SHORTS_SUFFIX });
            usedCalendar = true;
            notifyPopup({ type: 'BATCH_PROGRESS', stage: 'got_id', text: '已确认频道，正在打开短视频列表…' });
          } catch {}
        } else {
          // 前置任务没开，探测页只是用来确认账号，拿到编号就关掉。
          try { await chrome.tabs.remove(shortsTabId); } catch {}
        }
        notifyPopup({ type: 'BATCH_PROGRESS', stage: 'opening', text: '正在打开上传页…' });
        for (let i = 0; i < count; i++) { try { await chrome.tabs.create({ url: YT_UPLOAD, active: true }); opened++; } catch {} }
        notifyPopup({ type: 'BATCH_DONE', mode: 'yt', pageId: '', usedCalendar, opened: count });
        batchInProgress = false;
        return;
      }
      notifyPopup({ type: 'BATCH_PROGRESS', stage: 'probing', text: '正在打开探测页，确认真实主页编号…' });
      const { pageId, tabId: probeTabId } = await probeRealPageId();
      // 没账号不打开：拿不到编号就是没登录脸书账号，探测页留着
      // （那页就是登录页，让用户自己去登录），一个创建页都不开，只报一句话。
      if (!pageId) {
        notifyPopup({ type: 'BATCH_ERROR', text: '没检测到脸书账号，留下的那页就是登录页，请先登录再点。' });
        batchInProgress = false;
        return;
      }
      let remaining = count; let usedCalendar = false;
      notifyPopup({ type: 'BATCH_PROGRESS', stage: 'got_id', text: '已获取真实公共主页编号 ' + pageId, pageId });
      if (preOpenCalendar) { try { await chrome.tabs.update(probeTabId, { url: buildCalendarUrl(pageId) }); usedCalendar = true; } catch {} }
      else { remaining -= 1; }
      if (remaining > 0) {
        notifyPopup({ type: 'BATCH_PROGRESS', stage: 'opening', text: '正在打开 ' + remaining + ' 个创建页…' });
        for (let i = 0; i < remaining; i++) { try { await chrome.tabs.create({ url: buildReelsUrl(pageId), active: true }); } catch {} }
      }
      notifyPopup({ type: 'BATCH_DONE', mode: 'fb', pageId, usedCalendar, opened: count });
      batchInProgress = false;
    })().catch(() => { batchInProgress = false; notifyPopup({ type: 'BATCH_ERROR', text: '批量打开失败，请重试。' }); });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'GET_AVATAR') {
    const pageId = msg.pageId;
    if (!pageId || !/^\d{10,20}$/.test(pageId)) { sendResponse({ ok: false, error: 'invalid pageId' }); return false; }
    const url = `https://graph.facebook.com/${pageId}/picture?width=80&height=80&type=normal`;
    (async () => {
      try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (!resp.ok) throw new Error('http ' + resp.status);
        const finalUrl = new URL(resp.url);
        if (finalUrl.protocol !== 'https:' || !/(^|\.)fbcdn\.net$/.test(finalUrl.hostname)) throw new Error('unexpected image redirect');
        const mime = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)) throw new Error('unsupported image type');
        const contentLength = Number(resp.headers.get('content-length'));
        const MAX_IMAGE_BYTES = 1024 * 1024;
        if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) throw new Error('image too large');
        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength < 100 || buffer.byteLength > MAX_IMAGE_BYTES) throw new Error('invalid image size');
        const bytes = new Uint8Array(buffer);
        let binary = ''; const CHUNK = 8192;
        for (let i = 0; i < bytes.byteLength; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        const dataUrl = `data:${mime};base64,${btoa(binary)}`;
        sendResponse({ ok: true, dataUrl });
      } catch (e) { sendResponse({ ok: false, error: e.message }); }
    })();
    return true;
  }
  return false;
});
