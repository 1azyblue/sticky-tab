function normalize(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url;
  }
}

async function getTabState() {
  const { tabState } = await chrome.storage.session.get('tabState');
  return tabState || {};
}

async function setTabState(state) {
  await chrome.storage.session.set({ tabState: state });
}

async function getUrlInfoMap() {
  const { urlInfoMap } = await chrome.storage.local.get('urlInfoMap');
  return urlInfoMap || {};
}

async function setUrlInfoMap(map) {
  await chrome.storage.local.set({ urlInfoMap: map });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['emoji-data.js', 'content.js'] });
  } catch {
    // chrome://, 웹 스토어 등 스크립트 주입이 불가능한 페이지
  }
}

async function applyName(tabId, name) {
  await ensureContentScript(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SET_NAME', name });
  } catch {
    // no-op
  }
}

async function clearName(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_NAME' });
  } catch {
    // no-op
  }
}

async function applyIcon(tabId, icon) {
  await ensureContentScript(tabId);
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SET_ICON', icon });
  } catch {
    // no-op
  }
}

async function clearIcon(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_ICON' });
  } catch {
    // no-op
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'USER_SET_TAB_INFO') {
    (async () => {
      const tabId = sender.tab ? sender.tab.id : msg.tabId;
      const tab = await chrome.tabs.get(tabId);
      const key = normalize(tab.url);
      const name = (msg.name || '').trim();
      const icon = (msg.icon || '').trim();

      const tabState = await getTabState();
      tabState[tabId] = { path: key, name, icon };
      await setTabState(tabState);

      const urlInfoMap = await getUrlInfoMap();
      urlInfoMap[key] = { name, icon };
      await setUrlInfoMap(urlInfoMap);

      if (name) await applyName(tabId, name);
      else await clearName(tabId);

      if (icon) await applyIcon(tabId, icon);
      else await clearIcon(tabId);

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.type === 'GET_CURRENT_INFO') {
    (async () => {
      const tabState = await getTabState();
      const info = tabState[msg.tabId] || {};
      sendResponse({ name: info.name || '', icon: info.icon || '' });
    })();
    return true;
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const urlChanged = Boolean(changeInfo.url);
  const isReloadSignal = changeInfo.status === 'loading';
  if (!urlChanged && !isReloadSignal) return;

  const currentUrl = changeInfo.url || tab.url;
  if (!currentUrl) return;

  const newKey = normalize(currentUrl);
  const tabState = await getTabState();
  const prev = tabState[tabId];

  if (prev && prev.path === newKey) {
    // 경로가 그대로인 경우: 새로고침(콘텐츠 스크립트 상태 초기화)이거나
    // 쿼리/해시만 바뀐 경우. 저장해둔 이름/아이콘을 다시 적용해 둔다.
    if (prev.name) await applyName(tabId, prev.name);
    if (prev.icon) await applyIcon(tabId, prev.icon);
    return;
  }

  if (!urlChanged) return; // 경로 불일치인데 URL 변경 신호가 없으면 처리할 것 없음

  const urlInfoMap = await getUrlInfoMap();
  const remembered = urlInfoMap[newKey];

  if (remembered && (remembered.name || remembered.icon)) {
    tabState[tabId] = { path: newKey, name: remembered.name, icon: remembered.icon };
    await setTabState(tabState);
    if (remembered.name) await applyName(tabId, remembered.name);
    else await clearName(tabId);
    if (remembered.icon) await applyIcon(tabId, remembered.icon);
    else await clearIcon(tabId);
  } else {
    delete tabState[tabId];
    await setTabState(tabState);
    await clearName(tabId);
    await clearIcon(tabId);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const tabState = await getTabState();
  if (tabState[tabId]) {
    delete tabState[tabId];
    await setTabState(tabState);
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'rename-tab') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await ensureContentScript(tab.id);
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RENAME_OVERLAY' });
      } catch {
        // 탭에 content script가 없는 경우 (예: chrome:// 페이지, 새 탭 페이지)
      }
    }
  }
});
