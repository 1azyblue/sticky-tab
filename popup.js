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

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const iconInput = document.getElementById('iconInput');
  const nameInput = document.getElementById('nameInput');
  const saveBtn = document.getElementById('saveBtn');
  const row = iconInput.parentElement;
  let emojiPanel = null;
  let activeCategoryKey = 'smileys';
  let recentEmojis = [];

  const clearIconBtn = document.createElement('button');
  clearIconBtn.type = 'button';
  clearIconBtn.id = 'clearIconBtn';
  clearIconBtn.textContent = '×';
  clearIconBtn.title = '아이콘 지우기';
  row.appendChild(clearIconBtn);

  function updateClearIconBtn() {
    clearIconBtn.style.display = iconInput.value ? 'block' : 'none';
  }

  clearIconBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    iconInput.value = '';
    updateClearIconBtn();
    nameInput.focus();
  });

  const info = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_INFO', tabId: tab.id });
  nameInput.value = info.name || '';
  iconInput.value = info.icon || '';
  updateClearIconBtn();
  nameInput.focus();
  nameInput.select();

  function closeEmojiPanel() {
    if (emojiPanel) {
      emojiPanel.remove();
      emojiPanel = null;
    }
  }

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
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        iconInput.value = emoji;
        updateClearIconBtn();
        addRecentEmoji(emoji);
        closeEmojiPanel();
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
    tabBar.id = 'emojiTabBar';

    const tabs = [{ key: 'recent', label: '최근 사용', icon: '🕐' }, ...STICKYTAB_EMOJI_CATEGORIES];
    const tabButtons = [];

    tabs.forEach((tab_) => {
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.textContent = tab_.icon;
      tabBtn.title = tab_.label;
      if (tab_.key === activeCategoryKey) tabBtn.classList.add('active');
      tabBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeCategoryKey = tab_.key;
        searchInput.value = '';
        tabButtons.forEach((b) => b.classList.remove('active'));
        tabBtn.classList.add('active');
        renderEmojiGrid(grid, '');
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
    emojiPanel.id = 'emojiPanel';

    const searchInput = document.createElement('input');
    searchInput.id = 'emojiSearch';
    searchInput.type = 'text';
    searchInput.placeholder = '이모지 검색';

    const grid = document.createElement('div');
    grid.id = 'emojiGrid';

    const tabBar = buildTabBar(grid, searchInput);

    searchInput.addEventListener('click', (e) => e.stopPropagation());
    searchInput.addEventListener('input', () => renderEmojiGrid(grid, searchInput.value));

    getRecentEmojis().then((list) => {
      recentEmojis = list;
      if (activeCategoryKey === 'recent') renderEmojiGrid(grid, searchInput.value);
    });

    renderEmojiGrid(grid, '');

    emojiPanel.appendChild(searchInput);
    emojiPanel.appendChild(tabBar);
    emojiPanel.appendChild(grid);
    row.appendChild(emojiPanel);
    searchInput.focus();
  }

  iconInput.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEmojiPanel();
  });
  nameInput.addEventListener('focus', closeEmojiPanel);

  const save = async () => {
    await chrome.runtime.sendMessage({
      type: 'USER_SET_TAB_INFO',
      name: nameInput.value.trim(),
      icon: iconInput.value.trim(),
      tabId: tab.id,
    });
    window.close();
  };

  saveBtn.addEventListener('click', save);
  document.getElementById('helpLink').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    window.close();
  });
  [iconInput, nameInput].forEach((el) => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
    });
  });
})();
