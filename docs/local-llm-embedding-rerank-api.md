# 本地 LLM / Embedding / Rerank HTTP 接口说明

本机已部署了 3 个基于本地模型文件的 HTTP 服务，其他同事只需在同一内网环境下，通过 HTTP 接口调用即可，无需关心底层模型和 tmux 细节。

- 服务器 IP：**10.24.2.10**
- 所有接口均为 **无鉴权**（仅限内网使用），通过 HTTP 调用。

## 总览

| 能力       | 模型标识                    | 地址                                  |
|------------|-----------------------------|---------------------------------------|
| Chat LLM   | `qwen3-4b-instruct-local`   | `http://10.24.2.10:20089/v1/chat/completions` |
| Embedding  | `bge-m3-local`              | `http://10.24.2.10:9100/v1/embeddings`        |
| Rerank     | `bge-reranker-base-local`   | `http://10.24.2.10:9300/v1/rerank`            |

下面分别说明请求格式与示例。

---

## 1. Chat LLM 接口（Qwen3-4B 本地服务）

- **模型标识**：`qwen3-4b-instruct-local`
- **HTTP 方法**：`POST`
- **URL**：`http://10.24.2.10:20089/v1/chat/completions`

### 1.1 请求格式

```json
{
  "model": "qwen3-4b-instruct-local",
  "messages": [
    {"role": "user", "content": "用中文简单介绍一下你自己"}
  ],
  "max_tokens": 128,
  "temperature": 0.7
}
```

- `model`：固定填 `qwen3-4b-instruct-local`
- `messages`：对话消息数组，支持 `user` / `assistant` 角色
- `max_tokens`：本次最多生成多少 token（可选，默认约 128，建议不要太大）
- `temperature`：采样温度，越大越发散（可选）

### 1.2 curl 示例

```bash
curl -s -X POST http://10.24.2.10:20089/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-4b-instruct-local",
    "messages": [
      {"role": "user", "content": "用中文简单介绍一下你自己"}
    ],
    "max_tokens": 128,
    "temperature": 0.7
  }'
```

### 1.3 返回示例（截断）


**说明**：该 LLM 服务目前运行在 CPU 上，响应速度相对云端模型会慢一些，请控制好 `max_tokens` 和上下文长度。

---

## 2. Embedding 接口（bge-m3 本地服务）

- **模型标识**：`bge-m3-local`
- **HTTP 方法**：`POST`
- **URL**：`http://10.24.2.10:9100/v1/embeddings`

### 2.1 请求格式

```json
{
  "model": "bge-m3-local",
  "input": [
    "今天心情很好",
    "这是第二句话"
  ]
}
```

- `model`：固定填 `bge-m3-local`
- `input`：可以是字符串或字符串数组

### 2.2 curl 示例

```bash
curl -s -X POST http://10.24.2.10:9100/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bge-m3-local",
    "input": [
      "今天心情很好",
      "这是第二句话"
    ]
  }'
```



**说明**：

- 返回的 `embedding` 为向量数组，可直接用于相似度计算（cosine / dot 等）。
- 当前服务仅支持 `bge-m3-local` 这一模型标识。

---

## 3. Rerank 接口（bge-reranker-base 本地服务）

- **模型标识**：`bge-reranker-base-local`
- **HTTP 方法**：`POST`
- **URL**：`http://10.24.2.10:9300/v1/rerank`

### 3.1 请求格式

```json
{
  "model": "bge-reranker-base-local",
  "query": "中国的首都是哪里？",
  "documents": [
    "北京是中国的首都，也是政治文化中心。",
    "上海是中国的金融中心，有东方明珠塔。"
  ],
  "top_n": 2
}
```

- `model`：固定填 `bge-reranker-base-local`
- `query`：查询文本
- `documents`：待重排的候选文档列表
- `top_n`：可选，返回前多少个结果；不填则返回全部排序结果

### 3.2 curl 示例

```bash
curl -s -X POST http://10.24.2.10:9300/v1/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bge-reranker-base-local",
    "query": "中国的首都是哪里？",
    "documents": [
      "北京是中国的首都，也是政治文化中心。",
      "上海是中国的金融中心，有东方明珠塔。"
    ],
    "top_n": 2
  }'
```

### 3.3 返回示例

```json
{
  "object": "list",
  "data": [
    {
      "index": 0,
      "score": 12.34,
      "document": "北京是中国的首都，也是政治文化中心。"
    },
    {
      "index": 1,
      "score": 5.67,
      "document": "上海是中国的金融中心，有东方明珠塔。"
    }
  ]
}
```

- `score` 越大，代表越相关。
- 返回的 `index` 对应原始 `documents` 中的下标。

**说明**：  
`bge-reranker-base` 是 cross-encoder，计算量比 Embedding 大，建议控制每次 rerank 的候选文档数量（例如 top-K 召回 20～50 再重排）。

---

## 4. Python 使用示例（简单版）

### 4.1 调用 Chat

```python
import requests

url = "http://10.24.2.10:20089/v1/chat/completions"
payload = {
    "model": "qwen3-4b-instruct-local",
    "messages": [{"role": "user", "content": "用中文简单介绍一下你自己"}],
    "max_tokens": 128,
    "temperature": 0.7,
}
r = requests.post(url, json=payload, timeout=60)
print(r.json()["choices"][0]["message"]["content"])
```

### 4.2 调用 Embedding

```python
import requests

url = "http://10.24.2.10:9100/v1/embeddings"
payload = {
    "model": "bge-m3-local",
    "input": ["今天心情很好", "这是第二句话"],
}
r = requests.post(url, json=payload, timeout=30)
embeddings = [item["embedding"] for item in r.json()["data"]]
```

### 4.3 调用 Rerank

```python
import requests

url = "http://10.24.2.10:9300/v1/rerank"
payload = {
    "model": "bge-reranker-base-local",
    "query": "中国的首都是哪里？",
    "documents": [
        "北京是中国的首都，也是政治文化中心。",
        "上海是中国的金融中心，有东方明珠塔。"
    ],
    "top_n": 2,
}
r = requests.post(url, json=payload, timeout=30)
for item in r.json()["data"]:
    print(item["score"], item["document"])
```

---

## 5. 注意事项

- 所有服务仅在内网开放，请勿暴露到公网。
- LLM（Qwen3-4B）延迟相对较高，建议：
  - 控制 `max_tokens` 大小；
  - 避免一次性传入过长的对话历史。


