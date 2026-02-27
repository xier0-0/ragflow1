# 本地重排模型部署文档（bge-reranker-base + FastAPI + tmux）

你当前在本地已有重排模型目录（假设已通过 ModelScope 下载）：

- `/mnt/cfs/zhangjiyuan/models/bge-reranker-base`

本文件说明如何：

- 用 **Transformers / sentence-transformers** 加载本地 `bge-reranker-base`；
- 用 **FastAPI** 暴露一个 `/v1/rerank` 接口（简单、兼容性好）；
- 用 **tmux** 在后台长期运行服务；
- 在 **RAGFlow** 中通过 `OpenAI-API-Compatible` 类型使用该 rerank 模型。

---

## 1. 目录与虚拟环境

### 1.1 目录约定

- 基础目录：`/mnt/cfs/zhangjiyuan`
- 模型目录：`/mnt/cfs/zhangjiyuan/models/bge-reranker-base`
- 虚拟环境：`/mnt/cfs/zhangjiyuan/.venv_xinference`
- Rerank 服务端口：`9300`（可按需修改）

确认模型目录存在：

```bash
ls -lah /mnt/cfs/zhangjiyuan/models/bge-reranker-base
```

如不存在，可先用 ModelScope 下载（参考其他文档的 download 脚本）。

### 1.2 虚拟环境与依赖

```bash
python3 -m venv /mnt/cfs/zhangjiyuan/.venv_xinference
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

pip install -U fastapi uvicorn sentence-transformers -i https://mirrors.aliyun.com/pypi/simple/
```

---

## 2. 编写本地 Rerank 代理服务（`rerank_server.py`）

在 `/mnt/cfs/zhangjiyuan` 下创建文件：

```bash
cat > /mnt/cfs/zhangjiyuan/rerank_server.py << 'PY'
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional

from sentence_transformers import CrossEncoder

MODEL_PATH = "/mnt/cfs/zhangjiyuan/models/bge-reranker-base"
MODEL_NAME = "bge-reranker-base-local"
PORT = 9300

app = FastAPI()

model = CrossEncoder(MODEL_PATH)


class RerankRequest(BaseModel):
    model: str
    query: str
    documents: List[str]
    top_n: Optional[int] = None  # 返回前多少个，None 表示全部


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": MODEL_NAME,
                "object": "model",
            }
        ],
    }


@app.post("/v1/rerank")
def rerank(req: RerankRequest):
    # 构造 (query, doc) 对
    pairs = [(req.query, doc) for doc in req.documents]
    scores = model.predict(pairs).tolist()

    items = [
        {"index": i, "score": float(s), "document": doc}
        for i, (s, doc) in enumerate(zip(scores, req.documents))
    ]

    # 按分数倒序排序
    items.sort(key=lambda x: x["score"], reverse=True)

    if req.top_n is not None and req.top_n > 0:
        items = items[: req.top_n]

    return {
        "object": "list",
        "data": items,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=PORT)
PY
```

说明：

- 请求格式简单清晰：

  ```json
  {
    "model": "bge-reranker-base-local",
    "query": "问题",
    "documents": ["候选文档1", "候选文档2"],
    "top_n": 2
  }
  ```

- 返回按照相关性分数从高到低排序的文档列表。

---

## 3. 使用 tmux 在后台运行 rerank 服务

### 3.1 第一次在 tmux 中启动

```bash
tmux new -s rerank-bge-base
```

进入 tmux 会话后执行：

```bash
cd /mnt/cfs/zhangjiyuan
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

python /mnt/cfs/zhangjiyuan/rerank_server.py
```

看到类似日志：

```text
Uvicorn running on http://0.0.0.0:9300 (Press CTRL+C to quit)
```

说明服务已启动成功。

按：

- `Ctrl + B`，然后 `D`

即可挂起 tmux 会话，让服务在后台运行。

### 3.2 管理 tmux 会话

- 查看会话：

  ```bash
  tmux ls
  ```

- 重新进入会话：

  ```bash
  tmux attach -t rerank-bge-base
  ```

- 在会话内按 `Ctrl + C` 停止服务；如需删除会话：

  ```bash
  tmux kill-session -t rerank-bge-base
  ```

---

## 4. 自测 `/v1/rerank` 接口

在任意终端（能访问 10.24.2.10:9300）执行：

```bash
curl -s -X POST http://127.0.0.1:9300/v1/rerank \
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

预期返回类似：

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

---

## 5. 在 RAGFlow 中配置本地 Rerank 模型

### 5.1 添加 Rerank Provider（OpenAI-API-Compatible）

1. 打开 RAGFlow Web 界面。  
2. 右上角头像 → `Model providers`。  
3. 找到或进入 **OpenAI-API-Compatible** 这一项，点击 `Add` 新增一条配置。  
4. 填写：
   - **名称**：`Local-BGE-Reranker-Base`（随意命名）
   - **Base URL**：  
     - 如果 RAGFlow 也在本机：`http://127.0.0.1:9300/v1`  
     - 如果在其它机器：`http://10.24.2.10:9300/v1`
   - **API Key**：任意非空字符串，例如 `local-rerank-key`
   - **默认模型名称**：`bge-reranker-base-local`

### 5.2 在系统模型设置 / 数据集配置中使用

在「系统模型设置」或具体检索配置中：

- Rerank 模型选择：  
  `OpenAI-API-Compatible / Local-BGE-Reranker-Base / bge-reranker-base-local`

之后：

- RAGFlow 在进行检索后重排时，会通过 `/v1/rerank` 调用你本地的 bge-reranker-base 服务；
- 向量检索仍可使用你本地的 `bge-m3-local` Embedding 服务；
- Chat 依然可以用你配置好的本地或云端 LLM。

---

## 6. 常见问题与排查

### 6.1 RAGFlow 报「Fail to access model(OpenAI-API-Compatible/...)」

核对以下几点：

1. 确认 `rerank_server.py` 已在 tmux 中运行，且 `ss -lntp | grep 9300` 能看到监听。  
2. 在 RAGFlow 所在机器上（如果在容器中，容器内）执行：

   ```bash
   curl -s http://127.0.0.1:9300/v1/models
   ```

   或：

   ```bash
   curl -s http://10.24.2.10:9300/v1/models
   ```

   能返回 `bge-reranker-base-local` 即可。

3. 确保 RAGFlow 使用的是 `OpenAI-API-Compatible / Local-BGE-Reranker-Base / bge-reranker-base-local`，而不是其它 Provider。

### 6.2 响应太慢

- `bge-reranker-base` 是 cross-encoder，计算量比Embedding大，建议：
  - 控制每次 rerank 的文档数量（如 top-K 召回 20~50 再重排）；  
  - 如 CPU 过慢，考虑放到 GPU 上运行（需要重启服务并调整加载方式）。

---

按本文操作，你就可以基于本地目录 `/mnt/cfs/zhangjiyuan/models/bge-reranker-base` 起一个稳定的本地重排服务，并通过 tmux 管理它的运行状态，让 RAGFlow 像调用“供应商模型”一样使用你的本地 reranker。***
