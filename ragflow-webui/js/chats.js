/**
 * 会话列表与视图切换
 */
function showWelcome() {
  document.getElementById('welcome').style.display = 'flex';
  document.getElementById('chatView').classList.remove('active');
  document.getElementById('docView').classList.remove('active');
}

function showChatView() {
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('docView').classList.remove('active');
  document.getElementById('chatView').classList.add('active');
  renderChatMessages();
}

function showDocView() {
  document.getElementById('welcome').style.display = 'none';
  document.getElementById('chatView').classList.remove('active');
  document.getElementById('docView').classList.add('active');
  loadDocInfo();
  refreshDocList();
}

async function refreshChats() {
  try {
    const data = await apiCall('GET', '/api/v1/chats');
    const raw = data.data || data;
    chats = Array.isArray(raw) ? raw : (raw.chats || raw.data || []);
    renderChatList();
  } catch (e) {
    chats = [];
    renderChatList();
  }
}

function renderChatList() {
  const ul = document.getElementById('chatList');
  ul.innerHTML = '';
  const createdIds = getCreatedChatIds();
  chats.forEach(ch => {
    // 只显示在当前浏览器中创建的会话
    if (!createdIds.includes(ch.id)) {
      return; // 跳过不是在本浏览器创建的会话
    }
    const li = document.createElement('li');
    li.dataset.id = ch.id;
    li.classList.toggle('active', ch.id === currentChatId);
    const dsName = (ch.datasets && ch.datasets.length)
      ? ch.datasets[0].name
      : ((ch.dataset_ids || []).map(id => datasets.find(d => d.id === id)).filter(Boolean).map(d => d.name)[0]);
    const label = dsName || '-';
    li.innerHTML = '<div><div class="name">' + escapeHtml(ch.name || '') + '</div><div class="meta">' + escapeHtml(label) + '</div></div><div class="actions"><button type="button" class="btn-edit">设置</button><button type="button" class="btn-del">删除</button></div>';
    li.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); editChatDatasets(ch); });
    li.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); confirmDelChat(ch); });
    li.addEventListener('click', e => { if (!e.target.closest('.btn-del') && !e.target.closest('.btn-edit')) selectChat(ch.id); });
    ul.appendChild(li);
  });
  // 如果当前选中的会话不在列表中（被过滤掉了），清空选中状态
  if (currentChatId && !createdIds.includes(currentChatId)) {
    currentChatId = null;
    saveSelectedIds();
    showWelcome();
  }
}

function selectChat(id) {
  currentChatId = id;
  currentDatasetId = null;
  saveSelectedIds();
  renderChatList();
  renderKbList();
  chatMessages = loadChatMessagesFromStorage(id);
  showChatView();
}

function confirmDelChat(ch) {
  showModal('删除会话', '<p>确定要删除会话「' + escapeHtml(ch.name) + '」吗？</p>', async () => {
    try {
      await apiCall('DELETE', '/api/v1/chats', { ids: [ch.id] });
      deleteChatMessagesFromStorage(ch.id);
      removeCreatedChatId(ch.id);
      toast('已删除', 'success');
      if (currentChatId === ch.id) {
        currentChatId = null;
        showWelcome();
      }
      saveSelectedIds();
      await refreshChats();
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  });
}

async function editChatDatasets(ch) {
  if (!datasets.length) await refreshDatasets();
  const selectedId = (ch.dataset_ids && ch.dataset_ids[0]) || (ch.datasets && ch.datasets[0] && ch.datasets[0].id) || '';
  const options = datasets.map(d => '<option value="' + d.id + '"' + (selectedId === d.id ? ' selected' : '') + '>' + escapeHtml(d.name) + '</option>').join('');
  // 读取当前配置值（注意：API返回的 keywords_similarity_weight = 1 - vector_similarity_weight）
  const currentSimThreshold = (ch.prompt && ch.prompt.similarity_threshold) || 0.4;
  const currentKeywordsWeight = (ch.prompt && ch.prompt.keywords_similarity_weight) !== undefined ? (1 - ch.prompt.keywords_similarity_weight) : 0.4;
  const currentRerankModel = (ch.prompt && ch.prompt.rerank_model) || 'gte-rerank';
  // 获取可用的 rerank 模型列表
  let rerankOptions = '<option value="">（无）</option><option value="gte-rerank"' + (currentRerankModel === 'gte-rerank' ? ' selected' : '') + '>gte-rerank</option>';
  try {
    const llmData = await apiCall('GET', '/api/v1/llm/list?model_type=rerank');
    const llmList = llmData.data || {};
    const rerankModels = [];
    // 预定义的模型
    rerankModels.push({ name: 'BAAI/bge-reranker-v2-m3', factory: 'Builtin' });
    rerankModels.push({ name: 'maidalun1020/bce-reranker-base_v1', factory: 'Builtin' });
    // 从 API 获取的模型
    for (const factory in llmList) {
      const models = llmList[factory] || [];
      for (const model of models) {
        if (model.model_type && model.model_type.includes('rerank') && model.available) {
          rerankModels.push({ name: model.llm_name, factory: factory });
        }
      }
    }
    // 去重并生成选项
    const seen = new Set();
    rerankOptions = '<option value="">（无）</option>';
    for (const model of rerankModels) {
      const key = model.name;
      if (!seen.has(key)) {
        seen.add(key);
        const selected = currentRerankModel === key ? ' selected' : '';
        rerankOptions += '<option value="' + escapeHtml(key) + '"' + selected + '>' + escapeHtml(key) + '</option>';
      }
    }
    // 如果当前值不在列表中，也添加进去
    if (currentRerankModel && !seen.has(currentRerankModel)) {
      rerankOptions += '<option value="' + escapeHtml(currentRerankModel) + '" selected>' + escapeHtml(currentRerankModel) + '</option>';
    }
  } catch (e) {
    console.warn('获取 rerank 模型列表失败:', e);
    // 使用默认选项
  }
  const html = '<label>会话名称</label><input id="mChatName" value="' + escapeHtml(ch.name || '') + '" />' +
    '<label>检索知识库（单选）</label><select id="mChatDs">' + options + '</select>' +
    '<label>相似度阈值</label><input type="number" id="mSimThreshold" step="0.1" min="0" max="1" value="' + currentSimThreshold + '" />' +
    '<label>向量相似度权重</label><input type="number" id="mVectorWeight" step="0.1" min="0" max="1" value="' + currentKeywordsWeight + '" />' +
    '<label>重排序模型</label><select id="mRerankModel">' + rerankOptions + '</select>';
  showModal('编辑会话', html, async () => {
    const name = document.getElementById('mChatName').value.trim();
    if (!name) {
      toast('请输入会话名称', 'error');
      return false;
    }
    const sel = document.getElementById('mChatDs');
    const id = sel.value;
    const ids = id ? [id] : [];
    const simThreshold = parseFloat(document.getElementById('mSimThreshold').value) || 0.4;
    const vectorWeight = parseFloat(document.getElementById('mVectorWeight').value) || 0.4;
    const rerankModelSel = document.getElementById('mRerankModel');
    const rerankModel = rerankModelSel.value.trim();
    try {
      const updateData = { 
        name, 
        dataset_ids: ids,
        similarity_threshold: simThreshold,
        vector_similarity_weight: vectorWeight
      };
      // 只有当选择了 rerank 模型时才添加该参数
      if (rerankModel) {
        updateData.rerank_id = rerankModel;
      }
      await apiCall('PUT', '/api/v1/chats/' + ch.id, updateData);
      toast('已更新', 'success');
      await refreshChats();
      renderChatList();
      if (currentChatId === ch.id) showChatView();
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  });
}

document.getElementById('btnNewChat').addEventListener('click', async () => {
  if (!datasets.length) await refreshDatasets();
  const options = datasets.map(d => '<option value="' + d.id + '">' + escapeHtml(d.name) + '</option>').join('');
  // 获取可用的生成模型（chat 模型）
  let chatOptions = '<option value="">（使用系统默认）</option>';
  let defaultChatModel = '';
  try {
    const llmData = await apiCall('GET', '/api/v1/llm/list?model_type=chat');
    const llmList = llmData.data || {};
    const chatModels = [];
    for (const factory in llmList) {
      const models = llmList[factory] || [];
      for (const model of models) {
        if (model.model_type && model.model_type.includes('chat') && model.available) {
          chatModels.push(model.llm_name);
        }
      }
    }
    const seenChat = new Set();
    defaultChatModel = chatModels.length ? chatModels[0] : '';
    if (defaultChatModel) {
      chatOptions = '<option value="">（使用系统默认）</option>';
    }
    for (const name of chatModels) {
      if (seenChat.has(name)) continue;
      seenChat.add(name);
      const selected = name === defaultChatModel ? ' selected' : '';
      chatOptions += '<option value="' + escapeHtml(name) + '"' + selected + '>' + escapeHtml(name) + '</option>';
    }
  } catch (e) {
    console.warn('获取 chat 模型列表失败:', e);
  }
  const html =
    '<label>会话名称</label><input id="mChatName" />' +
    '<label>关联知识库（单选）</label><select id="mChatDs">' + options + '</select>' +
    '<label>生成模型</label><select id="mNewChatModel">' + chatOptions + '</select>' +
    '<label>相似度阈值</label><input type="number" id="mNewSimThreshold" step="0.1" min="0" max="1" value="0.3" />' +
    '<label>向量相似度权重</label><input type="number" id="mNewVectorWeight" step="0.1" min="0" max="1" value="0.3" />' +
    '<label>重排序模型</label><input id="mNewRerankModel" value="gte-rerank" />';
  showModal('新建会话', html, async () => {
    const name = document.getElementById('mChatName').value.trim();
    if (!name) {
      toast('请输入会话名称', 'error');
      return false;
    }
    // 检查服务器中是否已有同名会话
    try {
      await refreshChats();
      const existingChat = chats.find(ch => ch.name === name);
      if (existingChat) {
        const createdIds = getCreatedChatIds();
        if (!createdIds.includes(existingChat.id)) {
          toast('该会话名已经被用户使用', 'error');
          return false;
        }
        // 如果同名会话在当前浏览器中已存在，可以选择跳转到它或提示
        toast('该会话名已存在，将跳转到该会话', 'error');
        selectChat(existingChat.id);
        return false;
      }
    } catch (e) {
      // 如果刷新失败，继续尝试创建（可能是网络问题）
    }
    const sel = document.getElementById('mChatDs');
    const id = sel.value;
    const ids = id ? [id] : [];
    const simThreshold = parseFloat(document.getElementById('mNewSimThreshold').value) || 0.3;
    const vectorWeight = parseFloat(document.getElementById('mNewVectorWeight').value) || 0.3;
    const chatModelSel = document.getElementById('mNewChatModel');
    const chatModel = (chatModelSel && chatModelSel.value || '').trim();
    const rerankModel = (document.getElementById('mNewRerankModel').value || '').trim() || 'gte-rerank';
    try {
      const createData = {
        name,
        dataset_ids: ids.length ? ids : [],
        similarity_threshold: simThreshold,
        vector_similarity_weight: vectorWeight
      };
      if (chatModel) {
        createData.llm = {
          model_name: chatModel,
          model_type: 'chat'
        };
      }
      if (rerankModel) {
        createData.rerank_id = rerankModel;
      }
      const data = await apiCall('POST', '/api/v1/chats', createData);
      const newId = data.data && data.data.id;
      if (newId) {
        addCreatedChatId(newId);
        toast('创建成功', 'success');
        await refreshChats();
        selectChat(newId);
      } else {
        toast('创建失败：未返回会话ID', 'error');
        return false;
      }
    } catch (e) {
      // 如果后端返回错误，可能是名称冲突或其他原因
      const errMsg = e.message || '创建失败';
      if (errMsg.includes('name') || errMsg.includes('名称') || errMsg.includes('已存在') || errMsg.includes('重复')) {
        toast('该会话名已经被用户使用', 'error');
      } else {
        toast(errMsg, 'error');
      }
      return false;
    }
  });
});
