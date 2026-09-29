(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const iconInput = document.getElementById('iconInput');
  const nameInput = document.getElementById('nameInput');
  const saveBtn = document.getElementById('saveBtn');

  const info = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_INFO', tabId: tab.id });
  nameInput.value = info.name || '';
  iconInput.value = info.icon || '';
  nameInput.focus();
  nameInput.select();

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
