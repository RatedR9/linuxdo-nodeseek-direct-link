// ==UserScript==
// @name         LinuxDo & NodeSeek 外链直达与直链复制
// @namespace    https://github.com/RatedR9/linuxdo-nodeseek-direct-link
// @version      1.1
// @description  在 Linux.do (linuxfo) 和 NodeSeek 社区中，点击外部链接直接复制直链且阻止跳转；外链旁智能生成快捷复制按钮；彻底去除中间重定向拦截页；支持 Ctrl/Cmd/Alt+点击或中键直达原链
// @author       RatedR9 & Antigravity
// @match        *://linux.do/*
// @match        *://*.linux.do/*
// @match        *://nodeseek.com/*
// @match        *://*.nodeseek.com/*
// @run-at       document-start
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  // ── 0. 样式注入 ─────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('ns-ld-custom-styles')) return;
    const style = document.createElement('style');
    style.id = 'ns-ld-custom-styles';
    style.textContent = `
      .ns-ld-copy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 3px;
        margin-left: 5px;
        margin-right: 3px;
        padding: 1px 6px;
        font-size: 11px;
        line-height: 1.4;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #64748b;
        background: rgba(148, 163, 184, 0.14);
        border: 1px solid rgba(148, 163, 184, 0.25);
        border-radius: 4px;
        cursor: pointer;
        user-select: none;
        vertical-align: middle;
        text-decoration: none !important;
        font-weight: 500;
        transition: all 0.15s ease;
      }
      .ns-ld-copy-btn:hover {
        color: #16a34a;
        background: rgba(34, 197, 94, 0.15);
        border-color: rgba(34, 197, 94, 0.4);
        transform: translateY(-0.5px);
      }
      .ns-ld-copy-btn.copied {
        color: #ffffff !important;
        background: #16a34a !important;
        border-color: #16a34a !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  // ── 1. 判断是否为站外链接 ──────────────────────────────────────────────────
  function isExternalUrl(urlStr) {
    if (!urlStr) return false;
    try {
      const u = new URL(urlStr, location.origin);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

      const host = u.hostname.toLowerCase();
      const curHost = location.hostname.toLowerCase();

      // Linux.do 站内域名过滤
      if (curHost.includes('linux.do') && (host === 'linux.do' || host.endsWith('.linux.do'))) {
        return u.pathname.includes('/clicks/track');
      }

      // NodeSeek 站内域名过滤
      if (curHost.includes('nodeseek.com') && (host === 'nodeseek.com' || host.endsWith('.nodeseek.com'))) {
        return u.pathname.includes('/jump');
      }

      return true;
    } catch (_) {
      return false;
    }
  }

  // ── 2. 深度解析并提取真实直链 ──────────────────────────────────────────────
  function extractDirectUrl(a) {
    if (!a) return null;
    let rawHref = a.getAttribute('href') || a.href || '';
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return null;

    try {
      // 2.1 针对 NodeSeek 的 /jump?to=xxx 中转解析
      if (rawHref.includes('/jump') && rawHref.includes('to=')) {
        const u = new URL(rawHref, location.origin);
        const to = u.searchParams.get('to');
        if (to) return decodeURIComponent(to);
      }

      // 2.2 针对 Discourse (Linux.do) 的 /clicks/track?url=xxx 中转解析
      if (rawHref.includes('/clicks/track') && rawHref.includes('url=')) {
        const u = new URL(rawHref, location.origin);
        const target = u.searchParams.get('url');
        if (target) return decodeURIComponent(target);
      }

      // 2.3 检查 HTML5 dataset 属性是否藏有真实原链
      const dataHref = a.getAttribute('data-href') || a.getAttribute('data-url') || a.getAttribute('data-target');
      if (dataHref && (dataHref.startsWith('http://') || dataHref.startsWith('https://'))) {
        return dataHref;
      }

      const fullUrl = new URL(rawHref, location.origin).href;
      return fullUrl;
    } catch (_) {
      return rawHref;
    }
  }

  // ── 3. 复制文本到剪贴板 ────────────────────────────────────────────────────
  function copyToClipboard(text) {
    if (typeof GM_setClipboard === 'function') {
      try {
        GM_setClipboard(text, 'text');
        return true;
      } catch (_) {}
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        fallbackCopy(text);
      });
      return true;
    }

    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    } catch (_) {
      return false;
    }
  }

  // ── 4. 优雅轻量级 Toast 提示框 ─────────────────────────────────────────────
  let toastTimer = null;
  function showToast(title, link) {
    let container = document.getElementById('direct-link-toast');
    if (!container) {
      container = document.createElement('div');
      container.id = 'direct-link-toast';
      container.style.cssText = [
        'position: fixed',
        'top: 24px',
        'left: 50%',
        'transform: translateX(-50%) translateY(-20px)',
        'background: rgba(28, 30, 36, 0.94)',
        'backdrop-filter: blur(12px)',
        '-webkit-backdrop-filter: blur(12px)',
        'color: #ffffff',
        'padding: 12px 20px',
        'border-radius: 12px',
        'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35)',
        'border: 1px solid rgba(255, 255, 255, 0.15)',
        'z-index: 99999999',
        'display: flex',
        'flex-direction: column',
        'gap: 4px',
        'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        'pointer-events: none',
        'opacity: 0',
        'transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
        'max-width: 90vw',
        'width: max-content',
        'box-sizing: border-box'
      ].join(';');
      document.documentElement.appendChild(container);
    }

    container.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:16px;">📋</span>
        <span style="font-size:14px; font-weight:600; color:#4ade80;">${title}</span>
      </div>
      <div style="font-size:12px; color:#cbd5e1; word-break:break-all; max-width:420px; max-height:40px; overflow:hidden; text-overflow:ellipsis;">${link}</div>
      <div style="font-size:11px; color:#94a3b8; margin-top:2px;">💡 提示：按住 Ctrl / Cmd / Alt 点击或鼠标中键可在新标签页直接打开</div>
    `;

    requestAnimationFrame(() => {
      container.style.opacity = '1';
      container.style.transform = 'translateX(-50%) translateY(0)';
    });

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      container.style.opacity = '0';
      container.style.transform = 'translateX(-50%) translateY(-15px)';
    }, 2800);
  }

  // ── 5. 链接点击高亮反馈 ────────────────────────────────────────────────────
  function flashHighlight(element) {
    if (!element) return;
    const oldTransition = element.style.transition;
    const oldOutline = element.style.outline;
    element.style.transition = 'outline 0.15s ease';
    element.style.outline = '2px solid #4ade80';
    setTimeout(() => {
      element.style.outline = '2px solid transparent';
      setTimeout(() => {
        element.style.transition = oldTransition;
        element.style.outline = oldOutline;
      }, 200);
    }, 300);
  }

  // ── 6. 核心：全局捕获阶段劫持点击事件 ─────────────────────────────────────
  function handleGlobalLinkClick(e) {
    // 忽略点击在独立复制按钮上的情况（由按钮自身独立监听器处理）
    if (e.target.closest('.ns-ld-copy-btn')) return;

    const a = e.target.closest('a');
    if (!a) return;

    const directUrl = extractDirectUrl(a);
    if (!directUrl || !isExternalUrl(directUrl)) return;

    // A. 如果用户按下了快捷键 (Ctrl / Cmd / Alt / Shift) 或鼠标中键，放行并在新标签直接打开原链
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      window.open(directUrl, '_blank', 'noopener,noreferrer');
      showToast('🚀 已在新标签页直接直达原链', directUrl);
      return;
    }

    // B. 普通鼠标左键单击：彻底阻止跳转，直接复制直链到剪贴板！
    if (e.button === 0) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      copyToClipboard(directUrl);
      flashHighlight(a);
      showToast('直链已成功复制到剪贴板！', directUrl);
    }
  }

  window.addEventListener('click', handleGlobalLinkClick, true);
  window.addEventListener('auxclick', (e) => {
    if (e.button === 1) handleGlobalLinkClick(e);
  }, true);

  // ── 7. DOM 巡检、原链清洗与一键复制按钮注入 ────────────────────────────────
  function attachCopyButtonsAndPurify() {
    injectStyles();

    const links = document.querySelectorAll('a[href]');
    for (const a of links) {
      // 忽略头像、图片等无文字非内容链接
      if (a.closest('.avatar, .user-avatar, .header, nav, footer, #header')) continue;

      const direct = extractDirectUrl(a);
      if (!direct || !isExternalUrl(direct)) continue;

      // 7.1 原地替换为干净直链
      if (a.href !== direct) {
        a.href = direct;
      }

      // 7.2 增加 Tooltip 提示
      if (!a.hasAttribute('data-direct-handled')) {
        a.setAttribute('data-direct-handled', 'true');
        const origTitle = a.getAttribute('title') || '';
        a.setAttribute('title', (origTitle ? origTitle + '\n' : '') + '📋 单击直接复制直链 (Ctrl/Cmd+点击打开)');
      }

      // 7.3 在链接附近注入独立复制按钮
      if (!a.hasAttribute('data-has-copy-btn')) {
        // 确保紧邻的下一个兄弟节点不是已生成的按钮
        const next = a.nextElementSibling;
        if (!next || !next.classList.contains('ns-ld-copy-btn')) {
          const btn = document.createElement('span');
          btn.className = 'ns-ld-copy-btn';
          btn.innerHTML = '📋 复制';
          btn.title = '一键复制此直链到剪贴板';

          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            copyToClipboard(direct);
            showToast('直链已成功复制到剪贴板！', direct);

            // 按钮动效反馈
            btn.classList.add('copied');
            btn.innerHTML = '✓ 已复制';
            setTimeout(() => {
              btn.classList.remove('copied');
              btn.innerHTML = '📋 复制';
            }, 1200);
          });

          a.insertAdjacentElement('afterend', btn);
          a.setAttribute('data-has-copy-btn', 'true');
        }
      }
    }
  }

  // ── 8. 针对 NodeSeek /jump 中转落地页自动秒穿 ──────────────────────────────
  function handleJumpLandingPage() {
    if (location.pathname.includes('/jump')) {
      const params = new URLSearchParams(location.search);
      const target = params.get('to');
      if (target) {
        const decoded = decodeURIComponent(target);
        copyToClipboard(decoded);
        showToast('检测到中转页，直链已自动复制', decoded);
      }
    }
  }

  // ── 9. 生命周期挂载 ────────────────────────────────────────────────────────
  handleJumpLandingPage();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      attachCopyButtonsAndPurify();
      new MutationObserver(attachCopyButtonsAndPurify).observe(document.body, { childList: true, subtree: true });
    });
  } else {
    attachCopyButtonsAndPurify();
    new MutationObserver(attachCopyButtonsAndPurify).observe(document.body, { childList: true, subtree: true });
  }
})();
