/**
 * 左侧 Tab 切换 / 系统提示词保存
 */
document.querySelectorAll('.sidebar-tabs button').forEach(btn => {
  btn.addEventListener('click', function () {
    const tab = this.dataset.tab;
    document.querySelectorAll('.sidebar-tabs button').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('panelChat').style.display = tab === 'chat' ? 'block' : 'none';
    document.getElementById('panelKb').style.display = tab === 'kb' ? 'block' : 'none';
  });
});

function savePrompt() {
  try {
    localStorage.setItem(STORAGE_KEYS.systemPrompt, document.getElementById('systemPrompt').value);
  } catch (e) {}
}

document.getElementById('systemPrompt').addEventListener('blur', savePrompt);
