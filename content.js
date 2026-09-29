if (!window.__stickyTabInjected) {
  window.__stickyTabInjected = true;

  let titleObserver = null;
  let overrideName = null;
  let originalTitle = null;

  let iconObserver = null;
  let overrideIconHref = null;
  let overrideIconEmoji = null;
  let originalIconLinksHtml = null;

  function getTitleEl() {
    const existing = document.querySelector('title');
    if (existing) return existing;
    const el = document.createElement('title');
    (document.head || document.documentElement).appendChild(el);
    return el;
  }

  function applyNameOverride(name) {
    if (originalTitle === null) originalTitle = document.title;
    overrideName = name;
    document.title = name;

    if (titleObserver) titleObserver.disconnect();
    titleObserver = new MutationObserver(() => {
      if (document.title !== overrideName) {
        document.title = overrideName;
      }
    });
    titleObserver.observe(getTitleEl(), { childList: true, characterData: true, subtree: true });
  }

  function clearNameOverride() {
    overrideName = null;
    if (titleObserver) {
      titleObserver.disconnect();
      titleObserver = null;
    }
    if (originalTitle !== null) {
      document.title = originalTitle;
      originalTitle = null;
    }
  }

  function getIconLinks() {
    return Array.from(document.querySelectorAll('link[rel~="icon"]'));
  }

  function emojiToFaviconDataUrl(emoji) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 32, 36);
    return canvas.toDataURL('image/png');
  }

  function setFaviconLink(href) {
    getIconLinks().forEach((el) => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = href;
    document.head.appendChild(link);
  }

  function applyIconOverride(emoji) {
    if (originalIconLinksHtml === null) {
      originalIconLinksHtml = getIconLinks().map((el) => el.outerHTML);
    }
    overrideIconEmoji = emoji;
    overrideIconHref = emojiToFaviconDataUrl(emoji);
    setFaviconLink(overrideIconHref);

    if (iconObserver) iconObserver.disconnect();
    iconObserver = new MutationObserver(() => {
      const links = getIconLinks();
      const stillOurs = links.length === 1 && links[0].href === overrideIconHref;
      if (!stillOurs) {
        setFaviconLink(overrideIconHref);
      }
    });
    iconObserver.observe(document.head, { childList: true, subtree: true });
  }

  function clearIconOverride() {
    overrideIconHref = null;
    overrideIconEmoji = null;
    if (iconObserver) {
      iconObserver.disconnect();
      iconObserver = null;
    }
    getIconLinks().forEach((el) => el.remove());
    if (originalIconLinksHtml) {
      originalIconLinksHtml.forEach((html) => {
        const template = document.createElement('template');
        template.innerHTML = html;
        if (template.content.firstChild) {
          document.head.appendChild(template.content.firstChild);
        }
      });
    }
    originalIconLinksHtml = null;
  }

  function showRenameOverlay() {
    const existing = document.getElementById('__sticky_tab_overlay__');
    if (existing) existing.remove();

    const AUTO_CLOSE_MS = 10000;
    let closeTimer = null;

    const wrapper = document.createElement('div');
    wrapper.id = '__sticky_tab_overlay__';
    wrapper.style.cssText = `
      position: fixed; top: 80px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
      background: #1f2430; padding: 10px; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35); font-family: sans-serif; font-size: 13px;
      display: flex; gap: 6px; align-items: center;
    `;

    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.placeholder = '🙂';
    iconInput.value = overrideIconEmoji || '';
    iconInput.style.cssText =
      'padding:6px 4px; border-radius:6px; border:none; font-size:15px; width:36px; text-align:center;';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '탭 이름 입력';
    nameInput.value = overrideName || '';
    nameInput.style.cssText =
      'padding:6px 8px; border-radius:6px; border:none; font-size:13px; width:170px;';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '✓';
    saveBtn.title = '저장';
    saveBtn.style.cssText =
      'padding:6px 10px; border-radius:6px; border:none; background:#4f7cff; color:#fff; cursor:pointer; font-size:14px; line-height:1;';

    function closeOverlay() {
      if (closeTimer) clearTimeout(closeTimer);
      document.removeEventListener('mousedown', onOutsideClick, true);
      wrapper.remove();
    }

    function resetAutoCloseTimer() {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(closeOverlay, AUTO_CLOSE_MS);
    }

    function saveAndClose() {
      const name = nameInput.value.trim();
      const icon = iconInput.value.trim();
      chrome.runtime.sendMessage({ type: 'USER_SET_TAB_INFO', name, icon });
      closeOverlay();
    }

    function onOutsideClick(e) {
      if (!wrapper.contains(e.target)) {
        closeOverlay();
      }
    }

    [iconInput, nameInput].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveAndClose();
        if (e.key === 'Escape') closeOverlay();
      });
      el.addEventListener('input', resetAutoCloseTimer);
    });

    saveBtn.addEventListener('click', saveAndClose);

    wrapper.appendChild(iconInput);
    wrapper.appendChild(nameInput);
    wrapper.appendChild(saveBtn);
    document.body.appendChild(wrapper);

    document.addEventListener('mousedown', onOutsideClick, true);
    resetAutoCloseTimer();

    nameInput.focus();
    nameInput.select();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'SET_NAME') {
      applyNameOverride(msg.name);
    } else if (msg.type === 'CLEAR_NAME') {
      clearNameOverride();
    } else if (msg.type === 'SET_ICON') {
      applyIconOverride(msg.icon);
    } else if (msg.type === 'CLEAR_ICON') {
      clearIconOverride();
    } else if (msg.type === 'SHOW_RENAME_OVERLAY') {
      showRenameOverlay();
    }
  });
}
