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

    if (originalIconLinksHtml && originalIconLinksHtml.length > 0) {
      // 원래 파비콘 링크가 있었으면 그대로 다시 삽입 (새 노드 삽입이라야 브라우저가 다시 그려줌)
      originalIconLinksHtml.forEach((html) => {
        const template = document.createElement('template');
        template.innerHTML = html;
        if (template.content.firstChild) {
          document.head.appendChild(template.content.firstChild);
        }
      });
    } else {
      // 원래 명시적인 파비콘이 없던 페이지: 기본 경로로 강제 재요청해서 실제 상태로 되돌림
      const fallback = document.createElement('link');
      fallback.rel = 'icon';
      fallback.href = `${location.origin}/favicon.ico?__stickytab_reset=${Date.now()}`;
      document.head.appendChild(fallback);
    }
    originalIconLinksHtml = null;
  }

  const RECENT_EMOJI_KEY = 'stickyTabRecentEmojis';
  const RECENT_EMOJI_LIMIT = 24;
  const EMOJI_NAME_MAP = new Map(STICKYTAB_EMOJIS.map(([emoji, label]) => [emoji, label]));

  function getRecentEmojis() {
    return new Promise((resolve) => {
      chrome.storage.local.get(RECENT_EMOJI_KEY, (res) => resolve(res[RECENT_EMOJI_KEY] || []));
    });
  }

  function addRecentEmoji(emoji) {
    chrome.storage.local.get(RECENT_EMOJI_KEY, (res) => {
      let list = (res[RECENT_EMOJI_KEY] || []).filter((e) => e !== emoji);
      list.unshift(emoji);
      if (list.length > RECENT_EMOJI_LIMIT) list = list.slice(0, RECENT_EMOJI_LIMIT);
      chrome.storage.local.set({ [RECENT_EMOJI_KEY]: list });
    });
  }

  function showRenameOverlay() {
    const existing = document.getElementById('__sticky_tab_overlay__');
    if (existing) existing.remove();

    const AUTO_CLOSE_MS = 10000;
    let closeTimer = null;
    let emojiPanel = null;

    const wrapper = document.createElement('div');
    wrapper.id = '__sticky_tab_overlay__';
    wrapper.style.cssText = `
      position: fixed; top: 80px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
      background: #1f2430; padding: 10px; border-radius: 10px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35); font-family: sans-serif; font-size: 13px;
      display: flex; gap: 6px; align-items: center;
    `;

    const style = document.createElement('style');
    style.textContent = `
      #__sticky_tab_overlay__ input::placeholder { color: #9aa0ab; opacity: 1; }
    `;
    wrapper.appendChild(style);

    const iconWrap = document.createElement('div');
    iconWrap.style.cssText = 'position:relative; display:inline-block;';

    const iconInput = document.createElement('input');
    iconInput.type = 'text';
    iconInput.placeholder = '+';
    iconInput.value = overrideIconEmoji || '';
    iconInput.readOnly = true;
    iconInput.style.cssText =
      'padding:6px 4px; border-radius:6px; border:none; font-size:15px; width:36px; text-align:center; cursor:pointer; caret-color: transparent;';

    const clearIconBtn = document.createElement('button');
    clearIconBtn.type = 'button';
    clearIconBtn.textContent = '×';
    clearIconBtn.title = '아이콘 지우기';
    clearIconBtn.style.cssText = `
      position:absolute; top:-6px; right:-6px; width:15px; height:15px; line-height:14px;
      border-radius:50%; border:none; background:#555; color:#fff; font-size:10px; padding:0;
      cursor:pointer; text-align:center; display:none;
    `;

    function updateClearIconBtn() {
      clearIconBtn.style.display = iconInput.value ? 'block' : 'none';
    }
    updateClearIconBtn();

    clearIconBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      iconInput.value = '';
      updateClearIconBtn();
      resetAutoCloseTimer();
      nameInput.focus();
    });

    iconWrap.appendChild(iconInput);
    iconWrap.appendChild(clearIconBtn);

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

    function closeEmojiPanel() {
      if (emojiPanel) {
        emojiPanel.remove();
        emojiPanel = null;
      }
    }

    let activeCategoryKey = 'smileys';
    let recentEmojis = [];

    function currentCategoryItems() {
      if (activeCategoryKey === 'recent') {
        return recentEmojis.map((e) => [e, EMOJI_NAME_MAP.get(e) || '']);
      }
      const cat = STICKYTAB_EMOJI_CATEGORIES.find((c) => c.key === activeCategoryKey);
      return cat ? cat.items : STICKYTAB_EMOJIS;
    }

    function renderEmojiGrid(grid, filterText) {
      grid.innerHTML = '';
      const needle = filterText.trim().toLowerCase();
      const list = needle
        ? STICKYTAB_EMOJIS.filter(([, , search]) => search.toLowerCase().includes(needle))
        : currentCategoryItems();

      list.forEach(([emoji, name]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = emoji;
        btn.title = name;
        btn.style.cssText =
          'width:28px; height:28px; border:none; background:transparent; font-size:16px; cursor:pointer; border-radius:4px;';
        btn.addEventListener('mouseenter', () => {
          btn.style.background = 'rgba(255,255,255,0.15)';
        });
        btn.addEventListener('mouseleave', () => {
          btn.style.background = 'transparent';
        });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          iconInput.value = emoji;
          updateClearIconBtn();
          addRecentEmoji(emoji);
          closeEmojiPanel();
          resetAutoCloseTimer();
          nameInput.focus();
        });
        grid.appendChild(btn);
      });

      if (list.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = needle ? '검색 결과 없음' : '아직 사용한 이모지가 없어요';
        empty.style.cssText =
          'grid-column: 1 / -1; color:#9aa0ab; font-size:12px; text-align:center; padding:12px 0;';
        grid.appendChild(empty);
      }
    }

    function buildTabBar(grid, searchInput) {
      const tabBar = document.createElement('div');
      tabBar.style.cssText =
        'display:flex; gap:2px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;';

      const tabs = [{ key: 'recent', label: '최근 사용', icon: '🕐' }, ...STICKYTAB_EMOJI_CATEGORIES];
      const tabButtons = [];

      tabs.forEach((tab) => {
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.textContent = tab.icon;
        tabBtn.title = tab.label;
        tabBtn.style.cssText =
          'flex:1; border:none; background:transparent; font-size:14px; cursor:pointer; border-radius:4px; padding:4px 0;';
        if (tab.key === activeCategoryKey) tabBtn.style.background = 'rgba(255,255,255,0.15)';
        tabBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          activeCategoryKey = tab.key;
          searchInput.value = '';
          tabButtons.forEach((b) => {
            b.style.background = 'transparent';
          });
          tabBtn.style.background = 'rgba(255,255,255,0.15)';
          renderEmojiGrid(grid, '');
          resetAutoCloseTimer();
        });
        tabButtons.push(tabBtn);
        tabBar.appendChild(tabBtn);
      });

      return tabBar;
    }

    function toggleEmojiPanel() {
      if (emojiPanel) {
        closeEmojiPanel();
        return;
      }
      emojiPanel = document.createElement('div');
      emojiPanel.style.cssText = `
        position: absolute; top: 100%; left: 0; margin-top: 6px; z-index: 2147483647;
        background: #2a3040; border-radius: 8px; padding: 6px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4);
        width: 232px;
      `;

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = '이모지 검색';
      searchInput.style.cssText =
        'width:100%; box-sizing:border-box; padding:6px 8px; margin-bottom:6px; border-radius:6px; border:none; font-size:12px;';

      const grid = document.createElement('div');
      grid.style.cssText = `
        display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;
        max-height: 220px; overflow-y: auto;
      `;

      const tabBar = buildTabBar(grid, searchInput);

      searchInput.addEventListener('click', (e) => e.stopPropagation());
      searchInput.addEventListener('input', () => {
        renderEmojiGrid(grid, searchInput.value);
        resetAutoCloseTimer();
      });
      searchInput.addEventListener('keydown', (e) => e.stopPropagation());

      getRecentEmojis().then((list) => {
        recentEmojis = list;
        if (activeCategoryKey === 'recent') renderEmojiGrid(grid, searchInput.value);
      });

      renderEmojiGrid(grid, '');

      emojiPanel.appendChild(searchInput);
      emojiPanel.appendChild(tabBar);
      emojiPanel.appendChild(grid);
      wrapper.appendChild(emojiPanel);
      searchInput.focus();
    }

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

    iconInput.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleEmojiPanel();
    });

    nameInput.addEventListener('focus', closeEmojiPanel);

    [iconInput, nameInput].forEach((el) => {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveAndClose();
        if (e.key === 'Escape') closeOverlay();
      });
      el.addEventListener('input', resetAutoCloseTimer);
    });

    saveBtn.addEventListener('click', saveAndClose);

    wrapper.appendChild(iconWrap);
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
