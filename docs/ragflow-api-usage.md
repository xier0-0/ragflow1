# RAGFlow 接口使用说明（面向同事）

本文档说明如何**仅通过命令行（curl）** 使用本机已部署的 RAGFlow 服务，完成知识库管理、文档管理、聊天与检索，不依赖前端页面。所有接口均以 [RAGFlow HTTP API v0.24.0](https://ragflow.io/docs/v0.24.0/http_api_reference) 为准，未在官方文档中出现的接口不做描述。

---

## 一、环境与鉴权

- **服务地址**：`http://127.0.0.1:20088`
- **API Key**：`ragflow-nPMhN_qYo92Yvd7rpecTodOzkU5emBEYRj0kyIo8da4`
- **鉴权方式**：请求头中携带 `Authorization: Bearer <API_KEY>`

建议在终端先设置变量，后续示例均基于此。**默认知识库 ID** 用于快速测试（如你本机已有该知识库可直接用，否则用「2.2 创建知识库」返回的 id 替换）：

```bash
export RAGFLOW_HOST="http://127.0.0.1:20088"
export RAGFLOW_API_KEY="ragflow-nPMhN_qYo92Yvd7rpecTodOzkU5emBEYRj0kyIo8da4"
# 默认知识库 id，便于快速测试（无则先创建知识库或从列表接口获取）
export DATASET_ID="75ad2f5c15e911f1a394d51da451b596"
```

**通用请求头**（下文示例中若未单独写出，即默认使用）：

- `Authorization: Bearer $RAGFLOW_API_KEY`
- `Content-Type: application/json`（POST/PUT/DELETE 且 Body 为 JSON 时）

**错误码**（摘自官方文档）：400  Bad Request；401  Unauthorized；403  Forbidden；404  Not Found；500  Internal Server Error；1001  Invalid Chunk ID；1002  Chunk Update Failed。

---

## 二、知识库（Dataset）管理

RAGFlow 中的「知识库」对应接口中的 **Dataset**，路径前缀为 `/api/v1/datasets`。

### 2.1 查看知识库列表（查）

**接口**：`GET /api/v1/datasets`

**查询参数**（均为可选）：`page`（默认 1）、`page_size`（默认 30）、`orderby`（`create_time` | `update_time`）、`desc`（默认 true）、`name`、`id`。

**示例**：查看前 10 个知识库，按更新时间倒序

```bash
curl -s -X GET \
  "$RAGFLOW_HOST/api/v1/datasets?page=1&page_size=10&orderby=update_time&desc=true" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY"
```

**返回**：`code: 0` 时，`data` 为知识库数组，`total_datasets` 为总数。每个元素包含 `id`、`name`、`description`、`document_count`、`chunk_count`、`embedding_model`、`similarity_threshold`、`vector_similarity_weight`、`status` 等。

---

### 2.2 创建知识库（增）

**接口**：`POST /api/v1/datasets`

**Body**：`name`（必填）；可选：`avatar`、`description`、`embedding_model`、`permission`（`me` | `team`）、`chunk_method`、`parser_config`、或 ingestion 场景的 `parse_type` + `pipeline_id`（与 `chunk_method` 二选一，见官方文档）。

**示例**：仅创建名称

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/datasets" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-kb"}'
```

成功时返回 `data` 中包含新知识库的 `id`，后续操作需用到该 `id`。

---

### 2.3 更新知识库（改）

**接口**：`PUT /api/v1/datasets/{dataset_id}`

**Body**：可选 `name`、`avatar`、`description`、`embedding_model`、`permission`、`pagerank`、`chunk_method`、`parser_config` 等，仅传需要修改的字段。

**示例**：修改名称与描述

```bash
# 未设置 DATASET_ID 时：DATASET_ID="<上一步或列表接口拿到的 id>"
curl -s -X PUT \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-kb-v2", "description": "更新后的描述"}'
```

---

### 2.4 删除知识库（请谨慎使用）

**接口**：`DELETE /api/v1/datasets`

**Body**：`ids`：数组为要删除的 id 列表；`null` 表示删除当前用户全部知识库（慎用）。

**示例**：删除指定两个知识库

```bash
curl -s -X DELETE \
  "$RAGFLOW_HOST/api/v1/datasets" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["id1", "id2"]}'
```

---

## 三、知识库内文档管理

在已有知识库下上传、列出、下载、更新、删除文档及解析控制，路径为 `/api/v1/datasets/{dataset_id}/documents` 或相关子路径。

### 3.1 上传文档（并默认解析）

**接口**：`POST /api/v1/datasets/{dataset_id}/documents`

**Content-Type**：`multipart/form-data`。表单字段：`file`（可多个）。

上传后文档状态为 `UNSTART`，需**主动触发解析**后才会进入向量索引、可被检索/对话使用。下面示例：先上传一个文件，再从返回中取出 `document_id` 调用解析接口，实现「上传并默认解析」一条龙。

**示例一**：上传单个文件（使用默认 `DATASET_ID`）

```bash
# 使用前请确保已设置 RAGFLOW_HOST、RAGFLOW_API_KEY、DATASET_ID
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/documents" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -F "file=@./test1.txt"
```

**示例二**：上传后立即解析该文档（复制整段执行）

上传接口返回的 `data` 为数组，每项含 `id`（即 document_id）。下面用 `jq` 从响应中取出第一个文档的 id 并调用解析；若无 `jq`，可把第二步里的 `$DOC_ID` 改为你从第一步打印结果中手抄的 id。

```bash
# 1) 上传
RESP=$(curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/documents" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -F "file=@./test1.txt")

# 2) 取第一个文档 id 并触发解析（默认解析该文档）
DOC_ID=$(echo "$RESP" | jq -r '.data[0].id // empty')
if [ -n "$DOC_ID" ]; then
  curl -s -X POST \
    "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/chunks" \
    -H "Authorization: Bearer $RAGFLOW_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"document_ids\": [\"$DOC_ID\"]}"
  echo "已触发解析 document_id=$DOC_ID"
else
  echo "上传失败或返回无 data，请检查: $RESP"
fi
```

若上传多个文件并希望全部解析，可把 `document_ids` 设为所有返回的 `data[].id`，或多次调用解析接口。解析为异步，可通过「3.2 列出文档」查看 `run` 是否为 `DONE`。

---

### 3.2 列出文档

**接口**：`GET /api/v1/datasets/{dataset_id}/documents`

**查询参数**（可选）：`page`、`page_size`、`orderby`（`create_time` | `update_time`）、`desc`、`keywords`、`id`、`name`、`create_time_from`、`create_time_to`、`suffix`、`run`（如 UNSTART/RUNNING/DONE/FAIL）、`metadata_condition`（JSON 字符串）等。

**示例**：第一页、每页 10 条、仅处理成功的

```bash
curl -s -X GET \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/documents?page=1&page_size=10&run=DONE" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY"
```

---

### 3.3 下载文档

**接口**：`GET /api/v1/datasets/{dataset_id}/documents/{document_id}`

**示例**：下载到本地文件

```bash
DOCUMENT_ID="<文档 id>"
curl -s -X GET \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -o ./downloaded.txt
```

---

### 3.4 更新文档

**接口**：`PUT /api/v1/datasets/{dataset_id}/documents/{document_id}`

**Body**：可选 `name`、`meta_fields`、`chunk_method`、`parser_config`、`enabled`（1 可用，0 不可用）等，见官方文档。

**示例**：修改文档名并指定解析方式

```bash
curl -s -X PUT \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/documents/$DOCUMENT_ID" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "manual.txt", "chunk_method": "manual", "parser_config": {"chunk_token_num": 128}}'
```

---

### 3.5 删除文档

**接口**：`DELETE /api/v1/datasets/{dataset_id}/documents`

**Body**：`ids`：要删除的文档 id 数组。不传或未指定时行为见官方说明（可能删除全部，需谨慎）。

**示例**：删除指定文档

```bash
curl -s -X DELETE \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/documents" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["doc_id_1", "doc_id_2"]}'
```

---

### 3.6 触发解析 / 停止解析

- **解析**：`POST /api/v1/datasets/{dataset_id}/chunks`，Body：`{"document_ids": ["id1", "id2"]}`。
- **停止解析**：`DELETE /api/v1/datasets/{dataset_id}/chunks`，Body：`{"document_ids": ["id1", "id2"]}`。

示例（解析）：

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/datasets/$DATASET_ID/chunks" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"document_ids": ["doc_id_1", "doc_id_2"]}'
```

---

## 四、检索（直接查 chunk）

不经过对话，直接按问题在指定知识库/文档中检索 chunk。使用官方「Retrieve chunks」接口。

**接口**：`POST /api/v1/retrieval`

**Body**（摘自官方文档）：

- `question`（必填）：查询文本。
- `dataset_ids` 或 `document_ids`：二选一或按文档说明使用；`dataset_ids` 为知识库 id 数组，`document_ids` 为文档 id 数组（需同一 embedding 模型）。
- 可选：`page`（默认 1）、`page_size`（默认 30）、`similarity_threshold`、`vector_similarity_weight`、`top_k`、`rerank_id`、`keyword`、`highlight`、`cross_languages`、`metadata_condition`、`use_kg`、`toc_enhance` 等。

**示例**：在指定知识库中检索（快速测试可直接用默认 `DATASET_ID`）

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/retrieval" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"question\": \"RAGFlow 的优势是什么？\",
    \"dataset_ids\": [\"$DATASET_ID\"],
    \"page\": 1,
    \"page_size\": 10,
    \"highlight\": true
  }"
```

**返回**：`code: 0` 时，`data` 中包含 `chunks`（命中片段列表，含 `content`、`document_id`、`similarity` 等）和 `doc_aggs`（按文档聚合信息）。可根据 `document_id` 再调用「下载文档」接口获取原文。

**带元数据条件示例**（仅当知识库内文档配置了对应 metadata 时有效）：

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/retrieval" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"question\": \"报销流程\",
    \"dataset_ids\": [\"$DATASET_ID\"],
    \"metadata_condition\": {
      \"logic\": \"and\",
      \"conditions\": [
        {\"name\": \"author\", \"comparison_operator\": \"=\", \"value\": \"Toby\"},
        {\"name\": \"url\", \"comparison_operator\": \"not contains\", \"value\": \"amd\"}
      ]
    }
  }"
```

---

## 五、聊天（Chat Assistant）管理

RAGFlow 的「聊天」对应 **Chat Assistant**：先创建并绑定知识库，再通过「会话」进行多轮对话。

**如何拿到聊天助手 id（后文中的 `CHAT_ID`）**：会话管理、查看助手信息、发起对话等都要用到该 id。获取方式有两种——**① 创建助手**（5.1）时返回里的 `data.id`；**② 查看助手列表**（5.2）时返回的 `data[].id`（任选一个）。若已知 id，也可用 5.6 的「查看聊天助手信息」接口 `GET /api/v1/chats?id=xxx` 确认助手存在。拿到后建议在终端设变量便于后续示例复制使用：`export CHAT_ID="<上面任一步得到的 id>"`。

### 5.1 创建聊天助手（增）

**接口**：`POST /api/v1/chats`

**Body**（摘自官方文档）：

- `name`（必填）：助手名称。
- 可选：`avatar`、`dataset_ids`（绑定的知识库 id 数组）、`llm`（模型名及 temperature/top_p/presence_penalty/frequency_penalty 等）、`prompt`（如 similarity_threshold、keywords_similarity_weight、top_n、variables、rerank_model、empty_response、opener、show_quote、prompt 等）。

**示例**：创建并绑定一个知识库

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-assistant",
    "dataset_ids": ["0b2cbc8c877f11ef89070242ac120005"]
  }'
```

返回的 `data.id` 即为 `chat_id`，后续会话与对话均使用该 id。

---

### 5.2 查看聊天助手列表（查）

**接口**：`GET /api/v1/chats`

**查询参数**（可选）：`page`、`page_size`、`orderby`（`create_time` | `update_time`）、`desc`、`name`、`id`。

**示例**：查看前 10 个

```bash
curl -s -X GET \
  "$RAGFLOW_HOST/api/v1/chats?page=1&page_size=10" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY"
```

---

### 5.3 更新聊天助手（改）

**接口**：`PUT /api/v1/chats/{chat_id}`

**Body**：与创建时相同字段，仅传需要修改的项（如 `name`、`dataset_ids`、`llm`、`prompt`）。

**示例**：只改名称

```bash
CHAT_ID="<聊天助手 id>"
curl -s -X PUT \
  "$RAGFLOW_HOST/api/v1/chats/$CHAT_ID" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-assistant-v2"}'
```

---

### 5.4 删除聊天助手（删）

**接口**：`DELETE /api/v1/chats`

**Body**：`ids`：要删除的 chat id 数组。不传时行为见官方文档（可能删除全部，需谨慎）。

**示例**：删除指定两个

```bash
curl -s -X DELETE \
  "$RAGFLOW_HOST/api/v1/chats" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["chat_id_1", "chat_id_2"]}'
```

---

### 5.5 会话管理（创建 / 查看 / 更新 / 删除）

- **创建会话**：`POST /api/v1/chats/{chat_id}/sessions`，Body 可选 `name`、`user_id`。
- **查看会话列表**：`GET /api/v1/chats/{chat_id}/sessions`，可选参数 `page`、`page_size`、`orderby`、`desc`、`name`、`id`、`user_id`。
- **更新会话**：`PUT /api/v1/chats/{chat_id}/sessions/{session_id}`，Body 可选 `name`、`user_id`。
- **删除会话**：`DELETE /api/v1/chats/{chat_id}/sessions`，Body：`ids` 为要删除的 session id 数组。

**示例**：创建会话

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats/$CHAT_ID/sessions" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "new session"}'
```

返回的 `data.id` 即为 `session_id`，对话时可传入以延续该会话。

**示例**：查看某聊天助手下的会话

```bash
curl -s -X GET \
  "$RAGFLOW_HOST/api/v1/chats/$CHAT_ID/sessions?page=1&page_size=10" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY"
```

---

### 5.6 查看聊天助手信息（单条）

在发起对话前，可先确认助手是否存在、绑定了哪些知识库等。使用与「5.2 查看聊天助手列表」同一接口，通过查询参数 `id` 按聊天助手 id 过滤，即得到该助手详情。

**接口**：`GET /api/v1/chats`

**查询参数**：`id`（聊天助手 id，必填时即查单条）、可选 `page`、`page_size` 等。

**示例**：查看指定聊天助手信息（使用前请设置 `CHAT_ID`）

```bash
# CHAT_ID 来自 5.1 创建或 5.2 列表
curl -s -X GET \
  "$RAGFLOW_HOST/api/v1/chats?id=$CHAT_ID" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY"
```

**返回**：`code: 0` 时，`data` 为数组；若该 id 存在则含一条记录，包含 `id`、`name`、`avatar`、`dataset_ids`/`datasets`、`llm`、`prompt` 等，便于确认后再调用 5.7 进行对话。若不存在则 `data` 为空数组。

---

### 5.7 使用聊天助手对话（发问并获取回答）

RAGFlow 提供两种用法：**原生对话接口** 与 **OpenAI 兼容对话接口**。二者均需先有 `chat_id`（通过 5.1 创建或 5.2 列表获得）；可先按 **5.6 查看聊天助手信息** 确认助手存在再发问。

#### 方式一：原生对话接口（推荐用于简单问答）

**接口**：`POST /api/v1/chats/{chat_id}/completions`

**Body**：

- `question`（必填）：用户问题。
- `stream`：是否流式返回，默认 true。
- `session_id`：可选，传入则在该会话下多轮对话；不传则每次新建会话。
- `user_id`：可选，与 session 配合使用。
- `metadata_condition`：可选，检索时元数据过滤，结构同检索接口。

**示例**：非流式、不指定会话（服务端会返回新 session_id）

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats/$CHAT_ID/completions" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question": "请用一句话介绍知识库内容", "stream": false}'
```

**示例**：流式、指定会话

```bash
SESSION_ID="<上一步创建或列表拿到的 session_id>"
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats/$CHAT_ID/completions" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"继续说说细节\", \"stream\": true, \"session_id\": \"$SESSION_ID\"}"
```

响应格式见官方文档（流式为多条 `data: {...}`，非流式为单条 JSON，内含 `answer`、`reference`、`session_id` 等）。

#### 方式二：OpenAI 兼容对话接口（与 OpenAI 格式一致）

**接口**：`POST /api/v1/chats_openai/{chat_id}/chat/completions`

**重要**：这里的 `{chat_id}` 必须是 **RAGFlow 聊天助手 id**（即通过 `POST /api/v1/chats` 创建或 `GET /api/v1/chats` 列表里拿到的 `id`），不是知识库 id，也不是会话 id。若填错会报 404 或鉴权错误。

**请求说明**：

- **URL**：`http://127.0.0.1:20088/api/v1/chats_openai/{chat_id}/chat/completions`，把 `{chat_id}` 换成你的聊天助手 id。
- **必填请求头**：
  - `Content-Type: application/json`
  - `Authorization: Bearer <你的 API Key>`
- **Body 必填字段**：
  - `model`：string，服务端会解析，可填任意字符串如 `"model"`。
  - `messages`：数组，至少包含一条 `role: "user"` 的消息，且最后一条必须是 user（否则易报 `The last content of this conversation is not from user`）。
- **Body 可选**：
  - `stream`：boolean，默认 true（流式）；**建议先设为 false** 方便看完整 JSON 和排查问题。
  - `extra_body`：object，可选 `reference`（true 时返回引用）、`reference_metadata`（如 `include`、`fields`）、`metadata_condition`（检索过滤）。

**常见问题**：

1. **报错「The last content of this conversation is not from user」**：`messages` 最后一条必须是 `role: "user"`，不能以 `assistant` 结尾。
2. **404 或找不到对话**：确认 URL 里的 `chat_id` 是聊天助手 id（从 `GET /api/v1/chats` 的 `data[].id` 获取），不是 `dataset_id` 或 `session_id`。
3. **想一次拿到完整回复**：务必设 `"stream": false`，否则返回为多行 SSE（`data: {...}`），需按流式解析。

**示例 1**：最简非流式（先确保已设置 `CHAT_ID`，可从 5.2 列表、5.1 创建或 5.6 查看助手信息得到）

```bash
# 请先设置 CHAT_ID，例如：CHAT_ID="b1f2f15691f911ef81180242ac120003"
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats_openai/$CHAT_ID/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -d '{
    "model": "model",
    "messages": [{"role": "user", "content": "请用一句话介绍知识库内容"}],
    "stream": false
  }'
```

**示例 2**：非流式 + 带引用（返回里会多出引用片段信息）

```bash
curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats_openai/$CHAT_ID/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -d '{
    "model": "model",
    "messages": [{"role": "user", "content": "请根据知识库总结要点"}],
    "stream": false,
    "extra_body": {
      "reference": true,
      "reference_metadata": {"include": true, "fields": []}
    }
  }'
```

**如何读返回**（非流式 `stream: false`）：

- 回复正文：`response_json.choices[0].message.content`
- 引用（仅当请求里 `extra_body.reference === true`）：在 `choices[0].message.reference` 中，结构见官方文档（如 `chunks`、`doc_aggs` 等）。
- 若返回非 JSON（例如 HTML 或 404 页）：检查 URL 是否写错、`chat_id` 是否有效、服务是否为本机 20088。

**示例 3**：多轮对话（历史由上一轮 API 返回）

方式二**没有服务端 session**，多轮对话需**客户端自己维护历史**：每轮请求后从返回的 `choices[0].message.content` 取出助手回复，下一轮把「上一轮的 user + 上一轮的 assistant + 本轮的 user」一起放进 `messages` 再请求。下面用两轮连续请求演示（第一轮回复由接口返回，第二轮把该回复拼进 messages，无需手输历史）。

```bash
# 第一轮：用户问
RESP1=$(curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats_openai/$CHAT_ID/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -d '{
    "model": "model",
    "stream": false,
    "messages": [{"role": "user", "content": "知识库有哪些文档？请简要列出"}]
  }')

# 从第一轮响应中取出助手回复（若无 jq 可手抄下面 echo 出的内容）
ASSISTANT_1=$(echo "$RESP1" | jq -r '.choices[0].message.content // ""')
echo "第一轮助手回复: $ASSISTANT_1"

# 第二轮：把第一轮的 user + 第一轮的 assistant + 第二轮 user 拼成 messages（历史不手写）
USER_2='请总结第二篇的要点'
# 使用 jq 构造 JSON，避免手写 assistant 内容
BODY=$(jq -n \
  --arg a1 "$ASSISTANT_1" \
  --arg u2 "$USER_2" \
  '{
    model: "model",
    stream: false,
    messages: [
      {role: "user", content: "知识库有哪些文档？请简要列出"},
      {role: "assistant", content: $a1},
      {role: "user", content: $u2}
    ]
  }')

curl -s -X POST \
  "$RAGFLOW_HOST/api/v1/chats_openai/$CHAT_ID/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY" \
  -d "$BODY"
```

**无 jq 时**：第一轮请求后从打印的 JSON 里复制 `choices[0].message.content` 的值，在第二轮请求的 body 里把 `{role: "assistant", content: $a1}` 换成 `{"role": "assistant", "content": "你复制的上轮回复"}` 即可。编程时同理：用数组追加「上轮 user / 上轮 assistant / 本轮 user」，assistant 内容来自上一轮接口返回。

---

## 六、本机自测命令汇总

在已设置 `RAGFLOW_HOST`、`RAGFLOW_API_KEY` 和（可选）`DATASET_ID`（见第一节）的前提下，可直接复制执行：

```bash
# 1. 列知识库
curl -s -X GET "$RAGFLOW_HOST/api/v1/datasets?page=1&page_size=5" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY"

# 2. 列聊天助手
curl -s -X GET "$RAGFLOW_HOST/api/v1/chats?page=1&page_size=5" \
  -H "Authorization: Bearer $RAGFLOW_API_KEY"
```

若返回 `"code": 0` 且带 `data`，说明服务与鉴权正常，再按上文按需调用创建/检索/对话等接口。

---

## 七、参考链接

- 获取 API Key：[Acquire RAGFlow API key](https://ragflow.io/docs/acquire_ragflow_api_key)
- HTTP API 完整说明（v0.24.0）：[HTTP API | RAGFlow](https://ragflow.io/docs/v0.24.0/http_api_reference)

以上所有接口、参数与响应格式均以该官方文档为准，避免误用不存在的接口。
