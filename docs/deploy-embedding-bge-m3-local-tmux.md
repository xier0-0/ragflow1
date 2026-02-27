# 本地 bge-m3 向量服务部署文档（基于 ModelScope + tmux）

本文档说明如何在 **无翻墙** 的前提下：

- 使用 **ModelScope** 在本地下载 `BAAI/bge-m3` 嵌入模型；
- 用 **FastAPI + sentence-transformers** 起一个 **OpenAI 兼容的 Embedding 服务**；
- 使用 **tmux** 在后台长期运行该服务；
- 在 **RAGFlow** 中作为 Embedding 模型使用。

基础目录统一约定为：`/mnt/cfs/zhangjiyuan`。

---

## 1. 目录与虚拟环境准备

### 1.1 目录

```bash
mkdir -p /mnt/cfs/zhangjiyuan/{models,modelscope_cache,logs}
```

### 1.2 Python 虚拟环境

```bash
python3 -m venv /mnt/cfs/zhangjiyuan/.venv_xinference
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
```

安装依赖：

```bash
pip install -U modelscope sentence-transformers fastapi uvicorn -i https://mirrors.aliyun.com/pypi/simple/
```

---

## 2. 使用 ModelScope 本地下载 bge-m3

在 `/mnt/cfs/zhangjiyuan` 下创建下载脚本：

```bash
cat > /mnt/cfs/zhangjiyuan/download_bge_m3.py << 'PY'
from modelscope import snapshot_download
from pathlib import Path

BASE = Path("/mnt/cfs/zhangjiyuan/models")
CACHE = "/mnt/cfs/zhangjiyuan/modelscope_cache"
BASE.mkdir(parents=True, exist_ok=True)

local_dir = BASE / "bge-m3"
local_dir.mkdir(parents=True, exist_ok=True)

print("[DOWNLOAD] BAAI/bge-m3 ->", local_dir)
snapshot_download(
    model_id="BAAI/bge-m3",
    cache_dir=str(CACHE),
    local_dir=str(local_dir),
)
print("[DONE] BAAI/bge-m3")
PY
```

执行下载：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export MODELSCOPE_CACHE=/mnt/cfs/zhangjiyuan/modelscope_cache
python /mnt/cfs/zhangjiyuan/download_bge_m3.py
```

检查目录：

```bash
ls -lah /mnt/cfs/zhangjiyuan/models/bge-m3
```

---

## 3. 编写本地 Embedding 服务（OpenAI 兼容接口）

在 `/mnt/cfs/zhangjiyuan` 下创建 `embedding_server.py`：

```bash
cat > /mnt/cfs/zhangjiyuan/embedding_server.py << 'PY'
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Union
from sentence_transformers import SentenceTransformer
import uvicorn

MODEL_PATH = "/mnt/cfs/zhangjiyuan/models/bge-m3"
MODEL_NAME = "bge-m3-local"

app = FastAPI()
model = SentenceTransformer(MODEL_PATH)


class EmbeddingRequest(BaseModel):
    model: str
    input: Union[str, List[str]]


class EmbeddingData(BaseModel):
    index: int
    embedding: List[float]
    object: str = "embedding"


class EmbeddingResponse(BaseModel):
    object: str = "list"
    data: List[EmbeddingData]


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
def create_embeddings(req: EmbeddingRequest):
    texts = req.input if isinstance(req.input, list) else [req.input]
    vectors = model.encode(texts, normalize_embeddings=False)
    data = [
        EmbeddingData(index=i, embedding=v.tolist())
        for i, v in enumerate(vectors)
    ]
    return EmbeddingResponse(data=data)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9100)
PY
```

---

## 4. 使用 tmux 在后台运行 Embedding 服务

### 4.1 第一次启动服务（新建 tmux 会话）

```bash
tmux new -s bge-embedding
```

进入 tmux 后，在会话内执行：

```bash
cd /mnt/cfs/zhangjiyuan
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

python /mnt/cfs/zhangjiyuan/embedding_server.py
```

看到日志类似：

```text
Uvicorn running on http://0.0.0.0:9100 (Press CTRL+C to quit)
```

说明服务已启动成功。

然后按：

- `Ctrl + B`，再按 `D`

即可挂起 tmux 会话，让服务在后台继续运行。

### 4.2 查看 / 管理 tmux 会话

- 查看会话：

  ```bash
  tmux ls
  ```

- 重新进入会话：

  ```bash
  tmux attach -t bge-embedding
  ```

- 在会话内按 `Ctrl + C` 可以停止服务；  
  如需彻底删除会话：

  ```bash
  tmux kill-session -t bge-embedding
  ```

---

## 5. 自测 Embedding 接口

在任意终端执行（不需要在 tmux 里）：

```bash
curl -s -X POST http://127.0.0.1:9100/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"bge-m3-local","input":["你好，测试一下向量服务"]}'
```

如果返回类似：

```json
{
  "object": "list",
  "data": [
    {
      "index": 0,
      "embedding": [ ... 向量数值 ... ],
      "object": "embedding"
    }
  ]
}
```

说明本地 bge-m3 Embedding 服务工作正常。

---

## 6. 在 RAGFlow 中使用本地 bge-m3 Embedding

### 6.1 添加 Embedding Provider

1. 打开 RAGFlow Web 界面。  
2. 右上角头像 → `Model providers`。  
3. 新增一个 **OpenAI 兼容** Provider，例如命名为：`Local-BGE-M3`。  
4. 配置：
   - **Base URL**：`http://127.0.0.1:9100/v1`
   - **API Key**：任意非空字符串，如 `bge-m3-local-key`

### 6.2 绑定为系统 / 知识库默认嵌入模型

- 在「系统模型设置」或知识库的 Embedding 配置中：  
  - Provider 选择：`Local-BGE-M3`  
  - Model 名填：`bge-m3-local`

之后：

- 所有使用该 Provider 的 Embedding 请求，都会通过本地 `embedding_server.py` + `bge-m3` 完成向量计算；
- 数据不会出本机，也不依赖外网。

---

## 7. 常见问题与排查

### 7.1 访问根路径返回 404

日志中看到：

```text
GET / HTTP/1.1" 404 Not Found
```

说明有人（浏览器/探活工具）访问了 `/` 路径，而我们只实现了 `/v1/embeddings`；这是**正常现象**，可以忽略。

### 7.2 `ModuleNotFoundError` / `sentence_transformers` 相关错误

确保当前虚拟环境中已安装：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
pip install -U sentence-transformers -i https://mirrors.aliyun.com/pypi/simple/
```

### 7.3 服务端口占用

如果 9100 被占用，可以换一个端口（同时修改 `embedding_server.py` 中的 `port`，以及 RAGFlow 中的 Base URL）。

---

## 8. 管理速查

```bash
# 启动 tmux 会话并运行服务
tmux new -s bge-embedding
  cd /mnt/cfs/zhangjiyuan
  source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
  python embedding_server.py

# 挂起会话
Ctrl + B, 然后 D

# 查看会话
tmux ls

# 重新进入会话
tmux attach -t bge-embedding

# 停止服务（会话内 Ctrl + C），然后删除会话
tmux kill-session -t bge-embedding

# 快速查看服务日志（在会话内）
tail -n 100 /mnt/cfs/zhangjiyuan/logs/embedding.log  # 如你将日志重定向到该文件
```

按本文操作，你就可以在本地通过 ModelScope 下载 bge-m3，并用 tmux 持久运行一个 OpenAI 兼容的 Embedding 服务，供 RAGFlow 或其他应用调用。***
