# Xinference + ModelScope 本地部署三模型（低可用显存版）

本指南用于你当前这类场景：

- 机器 GPU 总显存很大（A100 80G），但**可用显存不高**（大部分已被占用）
- 不想再走在线自动拉模型，改为 **ModelScope 先下载到本地目录**
- 通过 Xinference 部署三类模型并接入 RAGFlow：
  - Chat LLM：`Qwen/Qwen3-4B-Instruct-2507`（对话版，Xinference 内置名 `Qwen3-Instruct`）
  - Embedding：`BAAI/bge-m3`
  - Rerank：`BAAI/bge-reranker-v2-m3`

> 本文默认基础目录：`/mnt/cfs/zhangjiyuan`
>  
> 默认使用 Python venv，不使用 conda。

---

## 1. 目录准备

```bash
mkdir -p /mnt/cfs/zhangjiyuan/{models,modelscope_cache,xinference,logs}
```

建议目录用途：

- 本地模型目录：`/mnt/cfs/zhangjiyuan/models`
- ModelScope 缓存：`/mnt/cfs/zhangjiyuan/modelscope_cache`
- Xinference 运行目录：`/mnt/cfs/zhangjiyuan/xinference`
- 日志目录：`/mnt/cfs/zhangjiyuan/logs`

---

## 2. 虚拟环境与依赖

```bash
python3 -m venv /mnt/cfs/zhangjiyuan/.venv_xinference
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

# 核心依赖（先装最小集）
pip install -U xinference modelscope -i https://mirrors.aliyun.com/pypi/simple/
```

> 说明：  
> 本文优先采用 `transformers` 引擎，避免 vLLM 默认显存预留过高导致启动失败。

---

## 3. 一次性下载三模型（ModelScope 本地目录）

在 `/mnt/cfs/zhangjiyuan` 下创建下载脚本：

```bash
cat > /mnt/cfs/zhangjiyuan/download_3_models.py << 'PY'
from pathlib import Path
from modelscope import snapshot_download

BASE = Path("/mnt/cfs/zhangjiyuan/models")
CACHE = "/mnt/cfs/zhangjiyuan/modelscope_cache"
BASE.mkdir(parents=True, exist_ok=True)

models = [
    ("Qwen/Qwen3-4B-Instruct-2507", "Qwen3-4B-Instruct"),
    ("BAAI/bge-m3", "bge-m3"),
    ("BAAI/bge-reranker-v2-m3", "bge-reranker-v2-m3"),
]

for model_id, local_name in models:
    local_dir = BASE / local_name
    local_dir.mkdir(parents=True, exist_ok=True)
    print(f"[DOWNLOAD] {model_id} -> {local_dir}")
    snapshot_download(
        model_id=model_id,
        cache_dir=CACHE,
        local_dir=str(local_dir),
    )
    print(f"[DONE] {model_id}")
PY
```

执行下载：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export MODELSCOPE_CACHE=/mnt/cfs/zhangjiyuan/modelscope_cache
python /mnt/cfs/zhangjiyuan/download_3_models.py
```

检查目录：

```bash
ls -lah /mnt/cfs/zhangjiyuan/models
```

预期包含：

- `/mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct`
- `/mnt/cfs/zhangjiyuan/models/bge-m3`
- `/mnt/cfs/zhangjiyuan/models/bge-reranker-v2-m3`

---

## 4. 启动 Xinference（后台 nohup）

先清理旧进程与旧状态：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
pkill -f xinference || true
rm -rf /mnt/cfs/zhangjiyuan/xinference
mkdir -p /mnt/cfs/zhangjiyuan/xinference
mkdir -p /mnt/cfs/zhangjiyuan/logs
```

后台启动（关键参数：关闭模型子虚拟环境，避免 `xoscar` 子环境缺包问题）：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference
export XINFERENCE_ENABLE_VIRTUAL_ENV=0

nohup xinference-local --host 0.0.0.0 --port 9997 \
  > /mnt/cfs/zhangjiyuan/logs/xinference.log 2>&1 &
```

健康检查：

```bash
sleep 3
curl http://127.0.0.1:9997/v1/models
```

看日志：

```bash
tail -n 80 /mnt/cfs/zhangjiyuan/logs/xinference.log
```

---

## 5. 低显存策略说明（务必看）

你当前机器常见状态是每张卡只剩十几 GB 可用显存。  
因此推荐：

1. 先用 `transformers` 引擎跑通三模型；
2. 全部加 `--disable-virtual-env`；
3. 需要时再切 vLLM（并显式降低 `gpu-memory-utilization`）。

另外，`--model-name` 必须使用 Xinference 识别的模型名；  
你自己的别名请用 `--model-uid`。

---

## 6. 启动三模型（本地目录，低显存优先）

### 6.1 启动 Embedding：bge-m3

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

xinference launch \
  --endpoint http://127.0.0.1:9997 \
  --model-name bge-m3 \
  --model-uid bge-m3-local \
  --model-type embedding \
  --model-engine transformers \
  --model-path /mnt/cfs/zhangjiyuan/models/bge-m3 \
  --size-in-billions 0.6 \
  --disable-virtual-env
```

### 6.2 启动 Rerank：bge-reranker-v2-m3

> **注意**：`bge-reranker-v2-m3` 在 Xinference 中**不支持** `transformers` 引擎，需用 `vllm`。显存紧张时需加 `--gpu-memory-utilization 0.2` 降低占用。

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

# 需先安装：pip install "xinference[vllm]"
xinference launch \
  --endpoint http://127.0.0.1:9997 \
  --model-name bge-reranker-v2-m3 \
  --model-uid bge-reranker-v2-m3-local \
  --model-type rerank \
  --model-engine vllm \
  --model-path /mnt/cfs/zhangjiyuan/models/bge-reranker-v2-m3 \
  --size-in-billions 0.6 \
  --gpu-memory-utilization 0.2 \
  --disable-virtual-env
```

若 vLLM 仍 OOM，可改用 `bge-reranker-base`（支持 transformers，体积更小）：

```bash
# 下载：("BAAI/bge-reranker-base", "bge-reranker-base")
xinference launch \
  --endpoint http://127.0.0.1:9997 \
  --model-name bge-reranker-base \
  --model-uid bge-reranker-base-local \
  --model-type rerank \
  --model-engine transformers \
  --model-path /mnt/cfs/zhangjiyuan/models/bge-reranker-base \
  --disable-virtual-env
```

### 6.3 启动 LLM：Qwen3-4B-Instruct

> **注意**：Xinference 内置 LLM 名为 `Qwen3-Instruct`（不是 `Qwen3-4B`），需配合 `--size-in-billions 4` 和本地 Instruct 权重目录。

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

xinference launch \
  --endpoint http://127.0.0.1:9997 \
  --model-name Qwen3-Instruct \
  --model-uid qwen3-4b-chat-local \
  --model-type LLM \
  --model-engine transformers \
  --model-path /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct \
  --size-in-billions 4 \
  --disable-virtual-env
```

> 如果 LLM 仍因显存不足失败，可先只启 embedding + rerank，LLM 改用更小模型或等待空闲显存。

---

## 7. 三类接口验证

### 7.1 Embedding 验证

```bash
curl -s -X POST http://127.0.0.1:9997/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"bge-m3-local","input":["你好，Xinference"]}'
```

### 7.2 Rerank 验证

```bash
curl -s -X POST http://127.0.0.1:9997/v1/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "model":"bge-reranker-v2-m3-local",
    "query":"中国的首都是哪里？",
    "documents":["北京是中国的首都","上海是中国的金融中心"]
  }'
```

### 7.3 Chat 验证

```bash
curl -s -X POST http://127.0.0.1:9997/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model":"qwen3-4b-chat-local",
    "messages":[{"role":"user","content":"请用中文介绍一下你自己"}]
  }'
```

---

## 8. RAGFlow 对接建议

在 RAGFlow 的 Model Provider 中添加 Xinference：

- Base URL（同机源码运行）：`http://localhost:9997/v1`
- 如果 RAGFlow 在 Docker 容器里：`http://host.docker.internal:9997/v1`

系统模型建议：

- Chat：`qwen3-4b-chat-local`
- Embedding：`bge-m3-local`
- Rerank：`bge-reranker-v2-m3-local`

---

## 9. 常见报错与对应处理

### 9.1 `Model not found, name: Qwen3-4B`

含义：Xinference 内置 LLM 名是 `Qwen3-Instruct`，不是 `Qwen3-4B`。  
处理：按 6.3 节使用 `--model-name Qwen3-Instruct`，且本地目录为 Instruct 版权重（`Qwen3-4B-Instruct-2507`）。

### 9.2 `Model not found in the model list`

含义：模型启动失败后被回收。  
先看日志：

```bash
grep -Ein "error|traceback|failed|oom|not found|xoscar|vllm|llama" /mnt/cfs/zhangjiyuan/logs/xinference.log | tail -n 120
```

### 9.3 `Model xxx cannot be run on engine transformers`（如 bge-reranker-v2-m3）

含义：该模型在 Xinference 中不支持 transformers，需用 vLLM。  
处理：
- 安装 `pip install "xinference[vllm]"`，然后 `--model-engine vllm`，并加 `--gpu-memory-utilization 0.2`；
- 或改用支持 transformers 的轻量 rerank，如 `bge-reranker-base`。

### 9.4 vLLM 显存报错（`desired GPU memory utilization`）

含义：可用显存太少。  
处理：

- 释放 GPU 上其他进程；
- 或改用 transformers；
- 或降低 vLLM 显存利用参数（如果你后续切回 vLLM）。

---

## 10. 管理命令速查

```bash
# 查看服务进程
ps -ef | grep xinference | grep -v grep

# 查看监听
ss -lntp | grep 9997

# 查看实时日志
tail -f /mnt/cfs/zhangjiyuan/logs/xinference.log

# 停服务
pkill -f xinference
```

如果后续你希望把 LLM 从 `transformers` 切换到 `vllm`，建议先确认单卡空闲显存足够，再逐步切换。
