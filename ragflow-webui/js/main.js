/**
 * 入口：加载配置并初始化视图
 */
loadConfig();

(async function init() {
  if (getInputBaseUrl() && getInputApiKey()) {
    await applyConfig(null, { silent: true });
  }
  renderChatList();
  renderKbList();
  if (currentChatId) {
    chatMessages = loadChatMessagesFromStorage(currentChatId);
    showChatView();
  } else if (currentDatasetId) showDocView();
})();
