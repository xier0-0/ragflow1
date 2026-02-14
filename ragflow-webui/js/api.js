/**
 * API 封装
 */
async function apiCall(method, path, body, isFormData) {
  const url = getBaseUrl() + path;
  const headers = { 'Authorization': 'Bearer ' + getApiKey() };
  if (!isFormData) headers['Content-Type'] = 'application/json';
  const options = { method, headers };
  if (body) options.body = isFormData ? body : JSON.stringify(body);
  const res = await fetch(url, options);
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('服务器返回 HTML 错误页（HTTP ' + res.status + '），请检查后端状态');
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    throw new Error('响应不是有效 JSON');
  }
  if (!res.ok || (json.code !== undefined && json.code !== 0)) {
    throw new Error(json.message || '请求失败 (HTTP ' + res.status + ')');
  }
  return json;
}

async function streamChat(chatId, messages, extraBody) {
  const url = getBaseUrl() + '/api/v1/chats_openai/' + chatId + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getApiKey() },
    body: JSON.stringify({ model: 'model', messages, stream: true, extra_body: extraBody || {} })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || '请求失败 ' + res.status);
  }
  return res.body;
}
