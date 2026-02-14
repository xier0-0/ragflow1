/**
 * Toast / Modal / 工具函数
 */
function toast(message, type) {
  const c = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => { el.remove(); }, 3000);
}

function showModal(title, bodyHTML, onOk) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  const overlay = document.getElementById('modalOverlay');
  const okBtn = document.getElementById('modalOk');
  const cancelBtn = document.getElementById('modalCancel');
  const once = () => {
    overlay.classList.remove('show');
    okBtn.onclick = null;
    cancelBtn.onclick = null;
  };
  okBtn.onclick = () => { if (onOk && onOk() !== false) once(); };
  cancelBtn.onclick = once;
  overlay.classList.add('show');
}

function formatSize(bytes) {
  if (bytes == null || isNaN(bytes)) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatTime(str) {
  if (!str) return '-';
  try {
    const d = new Date(str);
    return isNaN(d.getTime()) ? str : d.toLocaleString('zh-CN');
  } catch (_) {
    return str;
  }
}

function statusClass(run) {
  const s = (run || '').toUpperCase();
  if (s === 'RUNNING') return 'running';
  if (s === 'DONE') return 'done';
  if (s === 'FAIL') return 'fail';
  return 'unstart';
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
