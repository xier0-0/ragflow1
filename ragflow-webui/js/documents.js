/**
 * 文档管理：知识库详情、文档列表、上传、解析
 */
function loadDocInfo() {
  const card = document.getElementById('docInfoCard');
  if (!currentDatasetId) {
    card.innerHTML = '';
    return;
  }
  const ds = datasets.find(d => d.id === currentDatasetId);
  if (!ds) {
    card.innerHTML = '<p>未找到知识库</p>';
    return;
  }
  card.innerHTML = '<h3>' + escapeHtml(ds.name || '') + '</h3><div class="meta">' + escapeHtml(ds.description || '') + ' · ' + (ds.document_count != null ? ds.document_count : 0) + ' 文档 · ' + (ds.chunk_count != null ? ds.chunk_count : 0) + ' chunks</div>';
}

async function refreshDocList() {
  if (!currentDatasetId) return;
  clearInterval(docPollTimer);
  docPollTimer = null;
  try {
    const data = await apiCall('GET', '/api/v1/datasets/' + currentDatasetId + '/documents?page=1&page_size=100');
    const raw = data.data || data;
    documents = raw.docs || raw.documents || [];
  } catch (e) {
    documents = [];
  }
  renderDocTable();
  const hasRunning = documents.some(d => (d.run_status || d.run || '').toUpperCase() === 'RUNNING');
  if (hasRunning) docPollTimer = setInterval(refreshDocList, 5000);
}

function renderDocTable() {
  const tbody = document.getElementById('docTableBody');
  tbody.innerHTML = '';
  documents.forEach(doc => {
    const run = (doc.run_status || doc.run || 'UNSTART').toUpperCase();
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><input type="checkbox" class="doc-cb" data-id="' + escapeHtml(doc.id) + '" /></td><td>' + escapeHtml(doc.name || doc.file_name || doc.id) + '</td><td>' + formatSize(doc.size) + '</td><td><span class="status-tag ' + statusClass(run) + '">' + run + '</span></td><td>' + formatTime(doc.create_time) + '</td><td class="op-cell"><button type="button" class="btn-parse">解析</button><button type="button" class="btn-stop">停止</button><button type="button" class="btn-del-doc">删除</button></td>';
    tr.querySelector('.btn-parse').addEventListener('click', () => triggerParse([doc.id]));
    tr.querySelector('.btn-stop').addEventListener('click', () => stopParse([doc.id]));
    tr.querySelector('.btn-del-doc').addEventListener('click', () => confirmDelDoc(doc));
    tbody.appendChild(tr);
  });
  document.getElementById('docSelectAll').checked = false;
  document.getElementById('docSelectAll').onchange = function () {
    tbody.querySelectorAll('.doc-cb').forEach(cb => { cb.checked = this.checked; });
  };
}

async function triggerParse(ids) {
  if (!currentDatasetId || !ids.length) return;
  try {
    await apiCall('POST', '/api/v1/datasets/' + currentDatasetId + '/chunks', { document_ids: ids });
    toast('已触发解析', 'success');
    refreshDocList();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function stopParse(ids) {
  if (!currentDatasetId || !ids.length) return;
  try {
    await apiCall('DELETE', '/api/v1/datasets/' + currentDatasetId + '/chunks', { document_ids: ids });
    toast('已停止解析', 'success');
    refreshDocList();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function confirmDelDoc(doc) {
  showModal('删除文档', '<p>确定要删除「' + escapeHtml(doc.name || doc.file_name || doc.id) + '」吗？</p>', async () => {
    try {
      await apiCall('DELETE', '/api/v1/datasets/' + currentDatasetId + '/documents', { ids: [doc.id] });
      toast('已删除', 'success');
      refreshDocList();
      loadDocInfo();
      await refreshDatasets();
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  });
}

function getSelectedDocIds() {
  return Array.from(document.querySelectorAll('.doc-cb:checked')).map(cb => cb.dataset.id);
}

document.getElementById('docSelectAll').addEventListener('change', function () {
  document.querySelectorAll('#docTableBody .doc-cb').forEach(cb => { cb.checked = this.checked; });
});

document.getElementById('btnBatchParse').addEventListener('click', () => {
  const ids = getSelectedDocIds();
  if (!ids.length) {
    toast('请先勾选文档', 'error');
    return;
  }
  triggerParse(ids);
});

document.getElementById('btnBatchDel').addEventListener('click', () => {
  const ids = getSelectedDocIds();
  if (!ids.length) {
    toast('请先勾选文档', 'error');
    return;
  }
  showModal('批量删除', '<p>确定要删除选中的 ' + ids.length + ' 个文档吗？</p>', async () => {
    try {
      await apiCall('DELETE', '/api/v1/datasets/' + currentDatasetId + '/documents', { ids });
      toast('已删除', 'success');
      refreshDocList();
      loadDocInfo();
      await refreshDatasets();
    } catch (e) {
      toast(e.message, 'error');
      return false;
    }
  });
});

const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => {
  e.preventDefault();
  uploadZone.classList.add('dragover');
});
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) doUpload(Array.from(e.dataTransfer.files));
});
document.addEventListener('dragover', e => {
  if (currentDatasetId && document.getElementById('docView').classList.contains('active')) e.preventDefault();
});
document.addEventListener('drop', e => {
  if (!currentDatasetId || !document.getElementById('docView').classList.contains('active')) return;
  e.preventDefault();
  if (e.dataTransfer.files.length) doUpload(Array.from(e.dataTransfer.files));
});
fileInput.addEventListener('change', function () {
  if (this.files.length) doUpload(Array.from(this.files));
  this.value = '';
});

async function doUpload(files) {
  if (!currentDatasetId) {
    toast('请先选择知识库', 'error');
    return;
  }
  const progressWrap = document.getElementById('uploadProgressWrap');
  const progressFill = document.getElementById('uploadProgress');
  progressWrap.style.display = 'block';
  const newIds = [];
  let done = 0;
  for (const file of files) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiCall('POST', '/api/v1/datasets/' + currentDatasetId + '/documents', fd, true);
      const list = Array.isArray(res.data) ? res.data : (res.data && res.data.documents ? res.data.documents : []);
      const id = list[0] && list[0].id ? list[0].id : (res.data && res.data.id ? res.data.id : null);
      if (id) newIds.push(id);
    } catch (e) {
      toast('上传失败: ' + e.message, 'error');
    }
    done++;
    progressFill.style.width = (100 * done / files.length) + '%';
  }
  if (newIds.length) await apiCall('POST', '/api/v1/datasets/' + currentDatasetId + '/chunks', { document_ids: newIds });
  progressWrap.style.display = 'none';
  progressFill.style.width = '0%';
  toast('上传完成，已触发解析', 'success');
  refreshDocList();
  loadDocInfo();
  await refreshDatasets();
}
