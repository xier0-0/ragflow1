/**
 * 配置与存储
 */
const STORAGE_KEYS = {
  baseUrl: 'ragflow_webui_base_url',
  apiKey: 'ragflow_webui_api_key',
  lastChatId: 'ragflow_webui_last_chat_id',
  lastDatasetId: 'ragflow_webui_last_dataset_id',
  systemPrompt: 'ragflow_webui_system_prompt',
  sidebarCollapsed: 'ragflow_webui_sidebar_collapsed'
};

const CHAT_MESSAGES_PREFIX = 'ragflow_webui_chat_';
const CREATED_CHATS_KEY = 'ragflow_webui_created_chat_ids';

function getCreatedChatIds() {
  try {
    const raw = localStorage.getItem(CREATED_CHATS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function addCreatedChatId(chatId) {
  if (!chatId) return;
  try {
    const ids = getCreatedChatIds();
    if (!ids.includes(chatId)) {
      ids.push(chatId);
      localStorage.setItem(CREATED_CHATS_KEY, JSON.stringify(ids));
    }
  } catch (e) {}
}

function removeCreatedChatId(chatId) {
  if (!chatId) return;
  try {
    const ids = getCreatedChatIds();
    const filtered = ids.filter(id => id !== chatId);
    localStorage.setItem(CREATED_CHATS_KEY, JSON.stringify(filtered));
  } catch (e) {}
}

function saveChatMessagesToStorage(chatId, messages) {
  if (!chatId) return;
  try {
    const data = JSON.stringify(messages || []);
    localStorage.setItem(CHAT_MESSAGES_PREFIX + chatId, data);
  } catch (e) {}
}

function loadChatMessagesFromStorage(chatId) {
  if (!chatId) return [];
  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_PREFIX + chatId);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function deleteChatMessagesFromStorage(chatId) {
  if (!chatId) return;
  try {
    localStorage.removeItem(CHAT_MESSAGES_PREFIX + chatId);
  } catch (e) {}
}

const DEFAULT_SYSTEM_PROMPT = '你是一个智能助手，请总结知识库的内容来回答问题，请列举知识库中的数据详细回答。当所有知识库内容都与问题无关时，你的回答必须包括"知识库中未找到您要的答案！"这句话。回答需要考虑聊天历史。\\n以下是知识库：\\n{knowledge}\\n以上是知识库。';

function getInputBaseUrl() {
  return (document.getElementById('baseUrl').value || '').replace(/\/$/, '');
}

function getInputApiKey() {
  return document.getElementById('apiKey').value || '';
}

function getBaseUrl() {
  return (appliedBaseUrl || getInputBaseUrl());
}

function getApiKey() {
  return appliedApiKey || getInputApiKey();
}

function saveConfig() {
  try {
    localStorage.setItem(STORAGE_KEYS.baseUrl, getInputBaseUrl());
    localStorage.setItem(STORAGE_KEYS.apiKey, getInputApiKey());
    localStorage.setItem(STORAGE_KEYS.systemPrompt, document.getElementById('systemPrompt').value);
  } catch (e) {}
}

function loadConfig() {
  try {
    const u = localStorage.getItem(STORAGE_KEYS.baseUrl);
    if (u) document.getElementById('baseUrl').value = u;
    const k = localStorage.getItem(STORAGE_KEYS.apiKey);
    if (k) document.getElementById('apiKey').value = k;
    const p = localStorage.getItem(STORAGE_KEYS.systemPrompt);
    if (p != null && p !== '') document.getElementById('systemPrompt').value = p;
    if (!document.getElementById('systemPrompt').value.trim()) {
      document.getElementById('systemPrompt').value = DEFAULT_SYSTEM_PROMPT;
      try {
        localStorage.setItem(STORAGE_KEYS.systemPrompt, DEFAULT_SYSTEM_PROMPT);
      } catch (e) {}
    }
    const cid = localStorage.getItem(STORAGE_KEYS.lastChatId);
    if (cid) currentChatId = cid;
    const did = localStorage.getItem(STORAGE_KEYS.lastDatasetId);
    if (did) currentDatasetId = did;
    const collapsed = localStorage.getItem(STORAGE_KEYS.sidebarCollapsed);
    if (collapsed === '1') document.getElementById('sidebar').classList.add('collapsed');
    appliedBaseUrl = getBaseUrl();
    appliedApiKey = getApiKey();
  } catch (e) {}
}

function saveSelectedIds() {
  try {
    if (currentChatId) localStorage.setItem(STORAGE_KEYS.lastChatId, currentChatId);
    if (currentDatasetId) localStorage.setItem(STORAGE_KEYS.lastDatasetId, currentDatasetId);
  } catch (e) {}
}

document.getElementById('btnSidebarToggle').addEventListener('click', function () {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed');
  try {
    localStorage.setItem(STORAGE_KEYS.sidebarCollapsed, sidebar.classList.contains('collapsed') ? '1' : '0');
  } catch (e) {}
});
