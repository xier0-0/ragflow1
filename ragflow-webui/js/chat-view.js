/**
 * 聊天消息渲染、引用气泡、流式发送
 */
function simpleMarkdown(s) {
  if (!s) return '';
  let t = escapeHtml(s);
  t = t.replace(/\n/g, '<br/>');
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  return t;
}

const refTooltip = document.getElementById('refTooltip');
let refTooltipHideTimeout = null;

function renderRefTooltip(ref) {
  if (!ref) return;
  const name = ref.document_name || ref.doc_name || ref.file_name || '文档';
  const score = (ref.similarity != null ? ref.similarity : (ref.score != null ? ref.score : ''));
  const meta = ref.document_metadata || ref.metadata || {};
  const metaList = Object.keys(meta).length
    ? Object.entries(meta).map(([k, v]) => '<div>' + escapeHtml(k) + ': ' + escapeHtml(String(v)) + '</div>').join('')
    : '';
  const content = (ref.content || ref.content_with_weight || ref.text || ref.chunk || '').toString();
  refTooltip.innerHTML =
    '<div class="title">' + escapeHtml(name) + '</div>' +
    '<div class="meta">' +
    (score !== '' ? ('相似度: ' + escapeHtml(String(score))) : '') +
    '</div>' +
    (metaList ? ('<div class="meta">' + metaList + '</div>') : '') +
    '<div class="snippet">' + escapeHtml(content || '无检索内容') + '</div>';
}

function positionRefTooltip(e) {
  const padding = 12;
  const rect = refTooltip.getBoundingClientRect();
  let x = e.clientX + 12;
  let y = e.clientY + 12;
  if (x + rect.width + padding > window.innerWidth) x = window.innerWidth - rect.width - padding;
  if (y + rect.height + padding > window.innerHeight) y = window.innerHeight - rect.height - padding;
  refTooltip.style.left = x + 'px';
  refTooltip.style.top = y + 'px';
}

function showRefTooltip(e, ref) {
  if (refTooltipHideTimeout) {
    clearTimeout(refTooltipHideTimeout);
    refTooltipHideTimeout = null;
  }
  renderRefTooltip(ref);
  refTooltip.style.display = 'block';
  positionRefTooltip(e);
}

function hideRefTooltip() {
  refTooltip.style.display = 'none';
}

function scheduleHideRefTooltip() {
  if (refTooltipHideTimeout) clearTimeout(refTooltipHideTimeout);
  refTooltipHideTimeout = setTimeout(hideRefTooltip, 200);
}

function cancelScheduleHideRefTooltip() {
  if (refTooltipHideTimeout) {
    clearTimeout(refTooltipHideTimeout);
    refTooltipHideTimeout = null;
  }
}

(function initRefTooltipHover() {
  refTooltip.addEventListener('mouseenter', cancelScheduleHideRefTooltip);
  refTooltip.addEventListener('mouseleave', hideRefTooltip);
})();

function downloadRef(ref) {
  if (!ref) return;
  const name = (ref.document_name || ref.doc_name || ref.file_name || '引用').replace(/[<>:"/\\|?*]/g, '_');
  const score = (ref.similarity != null ? ref.similarity : (ref.score != null ? ref.score : ''));
  const meta = ref.document_metadata || ref.metadata || {};
  const metaStr = Object.keys(meta).length
    ? Object.entries(meta).map(([k, v]) => k + ': ' + v).join('\n')
    : '';
  const content = (ref.content || ref.content_with_weight || ref.text || ref.chunk || '').toString();
  const text = '标题: ' + name + '\n' +
    (score !== '' ? '相似度: ' + score + '\n' : '') +
    (metaStr ? '元数据:\n' + metaStr + '\n' : '') +
    '\n--- 内容 ---\n' + content;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (name.slice(0, 50) || 'reference') + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

/** 按显示宽度截断标题：中文约 2 单位，英文/数字 1 单位，超出用省略号 */
function truncateRefBadgeTitle(str, maxUnits) {
  if (!str || typeof str !== 'string') return '文档';
  var s = str.trim();
  if (!s) return '文档';
  var units = 0;
  var i = 0;
  while (i < s.length && units < maxUnits) {
    units += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(s[i]) ? 2 : 1;
    i++;
  }
  if (i >= s.length) return s;
  return s.slice(0, i) + '…';
}

function getRefByIdOrIndex(refs, idStr) {
  if (!refs || !refs.length) return null;
  const n = parseInt(idStr, 10);
  const byId = refs.find(r => String(r.id || r.chunk_id || r.chunkId || '') === idStr);
  if (byId) return byId;
  if (!Number.isNaN(n)) {
    if (n >= 0 && n < refs.length) return refs[n];
    if (n >= 1 && n <= refs.length) return refs[n - 1];
  }
  return null;
}

/**
 * 去掉非 [ID:n] 的引用变体（[^1]、ID-1、[[ id='']] 等），仅用于纯文本片段
 */
function stripJunkRefMarkers(s) {
  if (!s || typeof s !== 'string') return '';
  let t = s;
  t = t.replace(/\[\^\d+\]/g, '');
  t = t.replace(/\bID-\d+\b/gi, '');
  t = t.replace(/\.\s*\[\[\s*id\s*=\s*['"][^'"]*['"]\s*\]\]/gi, '');
  t = t.replace(/\[\[\s*id\s*=\s*['"][^'"]*['"]\s*\]\]/gi, '');
  t = t.replace(/\[\[\s*id\s*=\s*\d+\s*\]\]/gi, '');
  t = t.replace(/\.\s*\[\[\s*id\s*=\s*\d+\s*\]\]/gi, '');
  return t;
}

function renderAssistantContent(bubble, content, refs) {
  const contentEl = document.createElement('div');
  contentEl.className = 'md-content';
  const refMap = {};
  if (refs && refs.length) {
    refs.forEach((r, i) => {
      const id = r.id || r.chunk_id || r.chunkId;
      if (id != null && refMap[String(id)] == null) refMap[String(id)] = r;
      if (refMap[String(i)] == null) refMap[String(i)] = r;
    });
  }
  const parts = (content || '').split(/(\[ID:\s*\d+\])/gi);
  for (const part of parts) {
    const match = part.match(/\[ID:\s*(\d+)\]/i);
    if (match) {
      const idStr = match[1];
      const ref = refMap[idStr] || getRefByIdOrIndex(refs, idStr);
      if (ref) {
        const n = parseInt(idStr, 10);
        const num = Number.isNaN(n) ? '?' : (n + 1);
        const btn = document.createElement('span');
        btn.className = 'ref-num';
        btn.textContent = num;
        btn.title = '悬停查看详情，点击下载';
        btn.addEventListener('mouseenter', e => showRefTooltip(e, ref));
        btn.addEventListener('mouseleave', scheduleHideRefTooltip);
        btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); downloadRef(ref); });
        contentEl.appendChild(btn);
      }
    } else {
      const wrap = document.createElement('span');
      wrap.innerHTML = simpleMarkdown(stripJunkRefMarkers(part));
      contentEl.appendChild(wrap);
    }
  }
  bubble.appendChild(contentEl);
}

/** 按文件去重后返回 ref 列表 */
function getUniqueRefsByFile(refs) {
  if (!refs || !refs.length) return [];
  const byFile = {};
  refs.forEach(ref => {
    const name = ref.document_name || ref.doc_name || ref.file_name || '文档';
    if (!byFile[name]) byFile[name] = ref;
  });
  return Object.values(byFile);
}

function buildRefBlock(refs) {
  const list = getUniqueRefsByFile(refs);
  if (!list.length) return null;
  const wrap = document.createElement('div');
  wrap.className = 'msg-refs';
  const title = document.createElement('span');
  title.className = 'msg-refs-label';
  title.textContent = '引用来源';
  wrap.appendChild(title);
  const badges = document.createElement('div');
  badges.className = 'msg-refs-badges';
  list.forEach(ref => {
    const fullName = ref.document_name || ref.doc_name || ref.file_name || '文档';
    const badge = document.createElement('span');
    badge.className = 'ref-badge';
    badge.textContent = truncateRefBadgeTitle(fullName, 10);
    badge.title = fullName + '\n悬停查看详情，点击下载';
    badge.addEventListener('mouseenter', e => showRefTooltip(e, ref));
    badge.addEventListener('mouseleave', scheduleHideRefTooltip);
    badge.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      downloadRef(ref);
    });
    badges.appendChild(badge);
  });
  wrap.appendChild(badges);
  return wrap;
}

function renderChatMessages() {
  const container = document.getElementById('chatMessages');
  container.innerHTML = '';
  chatMessages.forEach(m => {
    const div = document.createElement('div');
    div.className = 'msg ' + (m.role === 'user' ? 'user' : 'assistant');
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    if (m.role === 'user') {
      bubble.textContent = m.content;
    } else {
      renderAssistantContent(bubble, m.content || '', m.references);
    }
    div.appendChild(bubble);
    if (m.role === 'assistant' && m.references && m.references.length) {
      const refBlock = buildRefBlock(m.references);
      if (refBlock) div.appendChild(refBlock);
    }
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function updateLastAssistantContent(text, refs) {
  const last = chatMessages[chatMessages.length - 1];
  if (last && last.role === 'assistant') {
    last.content = text;
    if (refs) last.references = refs;
    renderChatMessages();
    saveChatMessagesToStorage(currentChatId, chatMessages);
  }
}

function extractReferenceChunks(obj) {
  if (!obj) return null;
  const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
  const message = obj.choices && obj.choices[0] && obj.choices[0].message;
  const ref = (delta && delta.reference) || (message && message.reference) || obj.reference;
  if (Array.isArray(ref)) return ref;
  if (ref && Array.isArray(ref.chunks)) return ref.chunks;
  return null;
}

async function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !currentChatId) return;
  const sys = document.getElementById('systemPrompt').value.trim();
  const useRef = document.getElementById('optReference').checked;
  const useRefMeta = document.getElementById('optRefMeta').checked;
  const messages = [];
  if (sys) messages.push({ role: 'system', content: sys });
  chatMessages.forEach(m => { messages.push({ role: m.role, content: m.content || '' }); });
  messages.push({ role: 'user', content: text });
  chatMessages.push({ role: 'user', content: text });
  chatMessages.push({ role: 'assistant', content: '', rendered: '' });
  input.value = '';
  renderChatMessages();
  saveChatMessagesToStorage(currentChatId, chatMessages);
  const btn = document.getElementById('btnSend');
  btn.disabled = true;
  btn.classList.add('loading');
  const extraBody = { reference: useRef };
  if (useRefMeta) extraBody.reference_metadata = { include: true };
  try {
    const body = await streamChat(currentChatId, messages, extraBody);
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let refs = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '').trim();
        if (jsonStr === '[DONE]') continue;
        try {
          const obj = JSON.parse(jsonStr);
          const delta = obj.choices && obj.choices[0] && obj.choices[0].delta;
          if (delta && delta.content) fullContent += delta.content;
          const refChunks = extractReferenceChunks(obj);
          if (refChunks) refs = refChunks;
        } catch (_) {}
      }
      updateLastAssistantContent(fullContent, refs);
    }
    if (buffer.trim()) {
      const jsonStr = buffer.replace(/^data:\s*/, '').trim();
      if (jsonStr !== '[DONE]') {
        try {
          const obj = JSON.parse(jsonStr);
          const refChunks = extractReferenceChunks(obj);
          if (refChunks) refs = refChunks;
        } catch (_) {}
      }
      updateLastAssistantContent(fullContent, refs);
    }
    saveConfig();
  } catch (e) {
    const last = chatMessages[chatMessages.length - 1];
    if (last && last.role === 'assistant') last.content = '错误: ' + e.message;
    renderChatMessages();
    saveChatMessagesToStorage(currentChatId, chatMessages);
    toast('请求失败: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.classList.remove('loading');
}

document.getElementById('btnSend').addEventListener('click', sendChatMessage);
document.getElementById('chatInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});
document.getElementById('btnClearHistory').addEventListener('click', () => {
  chatMessages = [];
  renderChatMessages();
  saveChatMessagesToStorage(currentChatId, chatMessages);
  toast('已清空当前对话', 'success');
});
