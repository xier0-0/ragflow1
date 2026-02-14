/**
 * 知识库列表与 CRUD
 */
async function refreshDatasets() {
  try {
    const data = await apiCall('GET', '/api/v1/datasets?page=1&page_size=50');
    const raw = data.data || data;
    datasets = raw.datasets || raw.data || raw || [];
    if (!Array.isArray(datasets)) datasets = [];
    renderKbList();
  } catch (e) {
    datasets = [];
    renderKbList();
  }
}

function renderKbList() {
  const ul = document.getElementById('kbList');
  ul.innerHTML = '';
  datasets.forEach(ds => {
    const li = document.createElement('li');
    li.dataset.id = ds.id;
    li.classList.toggle('active', ds.id === currentDatasetId);
    const docCount = (ds.document_count != null) ? ds.document_count : (ds.document_count || 0);
    const chunkCount = (ds.chunk_count != null) ? ds.chunk_count : 0;
    li.innerHTML = '<div><div class="name">' + escapeHtml(ds.name || '') + '</div><div class="meta">' + docCount + ' 文档 · ' + chunkCount + ' chunks</div></div><button type="button" class="btn-del">删除</button>';
    li.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); confirmDelKb(ds); });
    li.addEventListener('click', e => { if (!e.target.closest('.btn-del')) selectDataset(ds.id); });
    ul.appendChild(li);
  });
}

function selectDataset(id) {
  currentDatasetId = id;
  currentChatId = null;
  saveSelectedIds();
  renderChatList();
  renderKbList();
  showDocView();
}

function confirmDelKb(ds) {
  const safeName = escapeHtml(ds.name || '');
  showModal('删除知识库', '<p>将删除知识库「' + safeName + '」。为确认操作，请在下方输入该知识库名称：</p><label>输入知识库名称</label><input type="text" id="mDelKbName" placeholder="请输入与上方完全一致的名称" autocomplete="off" />', async () => {
    const input = document.getElementById('mDelKbName');
    const typed = (input && input.value) ? input.value.trim() : '';
    const expected = (ds.name || '').trim();
    if (typed !== expected) {
      toast('输入的名称与知识库名称不一致，请重新输入', 'error');
      return false;
    }
    try {
      await apiCall('DELETE', '/api/v1/datasets', { ids: [ds.id] });
      toast('已删除', 'success');
      if (currentDatasetId === ds.id) {
        currentDatasetId = null;
        showWelcome();
      }
      saveSelectedIds();
      await refreshDatasets();
      await refreshChats();
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  });
}

document.getElementById('btnNewKb').addEventListener('click', () => {
  const chunkOptions = [
    { value: 'naive', label: '通用文档' },
    { value: 'paper', label: '论文/报告' },
    { value: 'book', label: '书籍/长文' },
    { value: 'laws', label: '法律/条款' },
    { value: 'presentation', label: '演示文稿' },
    { value: 'manual', label: '说明书/手册' },
    { value: 'qa', label: '问答/FAQ' },
  ];
  const opts = chunkOptions.map(o => '<option value="' + o.value + '">' + o.label + '</option>').join('');
  showModal('新建知识库', '<label>名称</label><input id="mKbName" /> <label>描述</label><input id="mKbDesc" /> <label>文档类型</label><select id="mKbChunk">' + opts + '</select>', async () => {
    const name = document.getElementById('mKbName').value.trim();
    if (!name) {
      toast('请输入名称', 'error');
      return false;
    }
    try {
      await apiCall('POST', '/api/v1/datasets', {
        name,
        description: document.getElementById('mKbDesc').value.trim() || undefined,
        chunk_method: document.getElementById('mKbChunk').value
      });
      toast('创建成功', 'success');
      await refreshDatasets();
      currentDatasetId = null;
      renderKbList();
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  });
});
