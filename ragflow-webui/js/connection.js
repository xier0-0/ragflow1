/**
 * 连接状态与配置应用
 */
function setConnectionStatus(s) {
  connectionStatus = s;
  const dot = document.getElementById('statusDot');
  dot.classList.remove('connected', 'connecting');
  if (s === 'connected') dot.classList.add('connected');
  if (s === 'connecting') dot.classList.add('connecting');
}

function setBtnLoading(btn, loading) {
  if (!btn) return;
  btn.disabled = !!loading;
  btn.classList.toggle('loading', !!loading);
}

async function applyConfig(triggerBtn, options) {
  const baseUrl = getInputBaseUrl();
  const apiKey = getInputApiKey();
  const silent = options && options.silent;
  if (!baseUrl || !apiKey) {
    toast('请填写 Base URL 和 API Key', 'error');
    return;
  }
  setBtnLoading(triggerBtn, true);
  setConnectionStatus('connecting');
  const prevBase = appliedBaseUrl;
  const prevKey = appliedApiKey;
  appliedBaseUrl = baseUrl;
  appliedApiKey = apiKey;
  try {
    saveConfig();
    await apiCall('GET', '/api/v1/datasets?page=1&page_size=1');
    setConnectionStatus('connected');
    await refreshDatasets();
    await refreshChats();
    const changed = baseUrl !== prevBase || apiKey !== prevKey;
    if (changed) {
      currentChatId = null;
      currentDatasetId = null;
      chatMessages = [];
      saveSelectedIds();
      showWelcome();
    }
    if (!silent) toast('配置已应用', 'success');
  } catch (e) {
    appliedBaseUrl = prevBase;
    appliedApiKey = prevKey;
    setConnectionStatus('disconnected');
    toast('连接失败: ' + e.message, 'error');
  }
  setBtnLoading(triggerBtn, false);
}

document.getElementById('btnApply').addEventListener('click', function () {
  applyConfig(this);
});

document.getElementById('btnTest').addEventListener('click', function () {
  applyConfig(this);
});

document.getElementById('togglePwd').addEventListener('click', function () {
  const input = document.getElementById('apiKey');
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';
  this.textContent = isPwd ? '隐藏' : '显示';
});
