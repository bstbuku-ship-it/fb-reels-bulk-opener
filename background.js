'use strict';

// ══════════════════════════════════════════════════════════════════════
// background.js — v4.0
//
// 核心变化：不再从 DOM/script 里猜测真实 Page ID。
// 改为：直接打开 Facebook 官方的裸链接创建页
//   https://business.facebook.com/latest/reels_composer/?...
// Facebook 自己会把当前登录专业主页的真实编号回填到 URL 的 asset_id 参数里，
// 我们只需要监听这个"探测 tab"的 URL 变化，读到 asset_id 就拿到了真实 ID。
//
// 流程：
//   1. 打开探测 tab（裸链接，必须第一个打开）
//   2. 监听它的 URL 变化，等到 asset_id 出现 或 超时（8秒）
//   3a. 拿到 ID + 用户开启了"预开日程本" → 把探测 tab 切换成日程本页面，
//       再新开 count 个带真实 ID 的 Reels 创建页
//   3b. 拿到 ID + 用户关闭了"预开日程本" → 探测 tab 本身就算第 1 个 Reels 页
//       （它已经带上真实 ID 了），再补开 count-1 个
//   3c. 超时没拿到 ID → 探测 tab 保留作为第 1 个（盲开，Facebook 仍会在
//       它自己打开时自动补 ID），再补开 count-1 个裸链接（各自自动回填）
// ══════════════════════════════════════════════════════════════════════

const REELS_TEMPLATE    = 'https://business.facebook.com/latest/reels_composer/?ref=biz_web_content_manager_calendar_view&context_ref=CONTENT_CALENDAR';
const REELS_WITH_ID     = 'https://business.facebook.com/latest/reels_composer/?ref=biz_web_content_manager_calendar_view&asset_id=__ID__&context_ref=CONTENT_CALENDAR';
const CALENDAR_TEMPLATE = 'https://business.facebook.com/latest/content_calendar?asset_id=__ID__';
const PROBE_TIMEOUT_MS  = 8000;

function buildReelsUrl(pageId) {
  return pageId ? REELS_WITH_ID.replace('__ID__', pageId) : REELS_TEMPLATE;
}
function buildCalendarUrl(pageId) {
  return CALENDAR_TEMPLATE.replace('__ID__', pageId);
}
function extractAssetId(url) {
  try { return new URL(url).searchParams.get('asset_id') || ''; }
  catch { return ''; }
}
function isValidPageId(id) {
  return typeof id === 'string' && /^\d{10,20}$/.test(id);
}
function notifyPopup(msg) {
  try { chrome.runtime.sendMessage(msg); } catch {}
}

// ── 探测真实 Page ID：打开裸链接 tab，监听它被 FB 自动补上 asset_id ──
function probeRealPageId() {
  return new Promise((resolve) => {
    let settled    = false;
    let probeTabId = null;

    const listener = (tabId, changeInfo) => {
      if (tabId !== probeTabId || !changeInfo.url) return;
      const id = extractAssetId(changeInfo.url);
      if (id && isValidPageId(id)) finish(id);
    };

    function finish(id) {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve({ pageId: id || '', tabId: probeTabId });
    }

    chrome.tabs.onUpdated.addListener(listener);

    (async () => {
      try {
        const tab = await chrome.tabs.create({ url: REELS_TEMPLATE, active: true });
        probeTabId = tab.id;
        if (tab.url) {
          const id = extractAssetId(tab.url);
          if (id && isValidPageId(id)) { finish(id); return; }
        }
      } catch {
        finish('');
        return;
      }
      setTimeout(() => finish(''), PROBE_TIMEOUT_MS);
    })();
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // ── 一键批量流程（探测 → 可选切日程本 → 批量开 Reels）─────────
  if (msg.type === 'START_BATCH') {
    const { count, preOpenCalendar } = msg;

    (async () => {
      notifyPopup({ type: 'BATCH_PROGRESS', stage: 'probing', text: '⏳ 正在打开探测页，确认真实主页编号…' });

      const { pageId, tabId: probeTabId } = await probeRealPageId();
      let remaining   = count;
      let usedCalendar = false;

      if (pageId) {
        notifyPopup({ type: 'BATCH_PROGRESS', stage: 'got_id', text: '✅ 已获取真实公共主页编号 ' + pageId, pageId });

        if (preOpenCalendar) {
          try {
            await chrome.tabs.update(probeTabId, { url: buildCalendarUrl(pageId) });
            usedCalendar = true;
          } catch {}
          // 探测 tab 变成了日程本，不计入 Reels 数量，count 个全部新开
        } else {
          // 探测 tab 已经是一个合法的、带真实 ID 的 Reels 创建页，直接算第 1 个
          remaining -= 1;
        }
      } else {
        notifyPopup({ type: 'BATCH_PROGRESS', stage: 'timeout', text: '⚠️ 未能在 8 秒内确认真实编号，改为直接批量打开（Facebook 会自动回填）' });
        // 探测 tab 保留为第 1 个盲开 tab
        remaining -= 1;
      }

      if (remaining > 0) {
        notifyPopup({ type: 'BATCH_PROGRESS', stage: 'opening', text: '🚀 正在打开 ' + remaining + ' 个创建页…' });
        for (let i = 0; i < remaining; i++) {
          try { await chrome.tabs.create({ url: buildReelsUrl(pageId), active: true }); } catch {}
        }
      }

      notifyPopup({ type: 'BATCH_DONE', pageId, usedCalendar, opened: count });
    })();

    sendResponse({ ok: true });
    return true;
  }

  // ── 头像获取：graph.facebook.com/PAGE_ID/picture 完全公开，无需 token ──
  if (msg.type === 'GET_AVATAR') {
    const pageId = msg.pageId;

    if (!pageId || !/^\d{10,20}$/.test(pageId)) {
      sendResponse({ ok: false, error: 'invalid pageId' });
      return false;
    }

    const url = `https://graph.facebook.com/${pageId}/picture?width=80&height=80&type=normal`;
    (async () => {
      try {
        const resp = await fetch(url, { redirect: 'follow' });
        if (!resp.ok) throw new Error('http ' + resp.status);

        const mime = (resp.headers.get('content-type') || 'image/jpeg').split(';')[0];
        if (!mime.startsWith('image/')) throw new Error('not an image: ' + mime);

        const buffer = await resp.arrayBuffer();
        if (buffer.byteLength < 100) throw new Error('image too small, likely error response');

        const bytes = new Uint8Array(buffer);
        let binary  = '';
        const CHUNK = 8192;
        for (let i = 0; i < bytes.byteLength; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const dataUrl = `data:${mime};base64,${btoa(binary)}`;
        sendResponse({ ok: true, dataUrl });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  return false;
});
