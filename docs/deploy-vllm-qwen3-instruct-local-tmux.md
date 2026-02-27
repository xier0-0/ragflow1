# 本地 Qwen3 LLM 服务部署文档（基于 ModelScope + vLLM + tmux）

本文档说明如何在 **无翻墙** 的前提下：

- 使用 **ModelScope** 在本地下载 `Qwen/Qwen3-4B-Instruct-2507`；
- 用 **vLLM** 起一个 **OpenAI 兼容的对话服务**（仅供 LLM 使用）；
- 使用 **tmux** 在后台长期运行该服务；
- 在 **RAGFlow** 中作为 Chat 模型使用。

基础目录统一约定为：`/mnt/cfs/zhangjiyuan`，端口选择 **20000**（避免 9000 冲突，如有需要可自行调整为 >20000 的空闲端口）。

---

## 1. 目录与虚拟环境准备

### 1.1 目录

```bash
mkdir -p /mnt/cfs/zhangjiyuan/{models,modelscope_cache,logs}
```

### 1.2 Python 虚拟环境（如已有可复用）

```bash
python3 -m venv /mnt/cfs/zhangjiyuan/.venv_xinference
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
```

安装依赖：

```bash
pip install -U vllm modelscope -i https://mirrors.aliyun.com/pypi/simple/
```

---

## 2. 使用 ModelScope 本地下载 Qwen3-4B-Instruct

我们在本地下载 `Qwen/Qwen3-4B-Instruct-2507` 到固定目录，以避免运行时联网下载。

在 `/mnt/cfs/zhangjiyuan` 下创建下载脚本：

```bash
cat > /mnt/cfs/zhangjiyuan/download_qwen3_4b_instruct.py << 'PY'
from modelscope import snapshot_download
from pathlib import Path

BASE = Path("/mnt/cfs/zhangjiyuan/models")
CACHE = "/mnt/cfs/zhangjiyuan/modelscope_cache"
BASE.mkdir(parents=True, exist_ok=True)

local_dir = BASE / "Qwen3-4B-Instruct"
local_dir.mkdir(parents=True, exist_ok=True)

print("[DOWNLOAD] Qwen/Qwen3-4B-Instruct-2507 ->", local_dir)
snapshot_download(
    model_id="Qwen/Qwen3-4B-Instruct-2507",
    cache_dir=str(CACHE),
    local_dir=str(local_dir),
)
print("[DONE] Qwen/Qwen3-4B-Instruct-2507")
PY
```

执行下载：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export MODELSCOPE_CACHE=/mnt/cfs/zhangjiyuan/modelscope_cache
python /mnt/cfs/zhangjiyuan/download_qwen3_4b_instruct.py
```

检查目录：

```bash
ls -lah /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct
```

---

## 3. 使用 vLLM 起本地 OpenAI 兼容 LLM 服务

我们使用 vLLM 的 `serve` 命令，直接从本地目录加载模型，并暴露 OpenAI 兼容接口。

### 3.1 选择端口并检查是否被占用

本文默认使用端口 **20000**，可先检查：

```bash
ss -lntp | grep 20000 || echo "20000 未被占用"
```

如已被占用，可以换成例如 `20001`、`21000` 等端口，并在后续命令中同步修改。

### 3.2 前台启动（首次调试时使用）

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

vllm serve /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct \
  --model /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct \
  --port 20000 \
  --host 0.0.0.0 \
  --trust-remote-code \
  --gpu-memory-utilization 0.3
```

说明：

- `--model` 这里直接使用本地目录路径，避免访问外网；
- `--gpu-memory-utilization 0.3` 为了在显存紧张时降低预留比例，如仍 OOM 可再调低。

看到类似日志：

```text
Uvicorn running on http://0.0.0.0:20000 (Press CTRL+C to quit)
```

说明服务已启动成功。

---

## 4. 使用 tmux 在后台运行 vLLM 服务

为了长期运行、掉线不影响，我们使用 `tmux` 管理 vLLM 服务。

### 4.1 新建 tmux 会话并启动服务

```bash
tmux new -s vllm-qwen3
```

进入 tmux 会话后执行：

```bash
cd /mnt/cfs/zhangjiyuan
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

vllm serve /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct \
  --model /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct \
  --port 20000 \
  --host 0.0.0.0 \
  --trust-remote-code \
  --gpu-memory-utilization 0.3
```

确认服务启动后，按：

- `Ctrl + B`，再按 `D`

即可挂起 tmux 会话，让 vLLM 服务在后台持续运行。

### 4.2 管理 tmux 会话

- 查看当前会话：

  ```bash
  tmux ls
  ```

- 重新进入会话：

  ```bash
  tmux attach -t vllm-qwen3
  ```

- 在会话内按 `Ctrl + C` 停止 vLLM 服务；如需删除会话：

  ```bash
  tmux kill-session -t vllm-qwen3
  ```

---

## 5. 自测 OpenAI 兼容接口

在任意终端执行（注意端口和模型名与上文一致）：

```bash
curl -s -X POST http://127.0.0.1:20000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dummy" \
  -d '{
    "model": "/mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct",
    "messages": [{"role": "user", "content": "用中文简单介绍一下你自己"}]
  }'
```

如果能返回一段中文回答，说明 vLLM LLM 服务工作正常。

> 提示：`"model"` 字段需要与你启动 vLLM 时的 `--model` 参数一致，这里我们统一使用本地路径字符串。

---

## 6. 在 RAGFlow 中配置本地 vLLM LLM

### 6.1 添加 LLM Provider

1. 打开 RAGFlow Web 界面。  
2. 右上角头像 → `Model providers`。  
3. 新增一个 **OpenAI 兼容** Provider，例如命名为：`Local-Qwen3-vLLM`。  
4. 配置：
   - **Base URL**：`http://127.0.0.1:20000/v1`
   - **API Key**：任意非空字符串，如 `qwen3-local-key`

### 6.2 绑定为系统默认 Chat 模型

在「系统模型设置」中：

- Provider 选择：`Local-Qwen3-vLLM`
- Chat 模型名填：`/mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct`

之后所有 Chat 调用，会通过本地 vLLM 服务 + Qwen3-4B-Instruct 模型完成。

---

## 7. 常见问题与排查

### 7.1 端口冲突

如果 20000 端口被占用，`vllm serve` 会启动失败。可先检查：

```bash
ss -lntp | grep 20000
```

如被占用，换一个端口，例如 20001：

```bash
vllm serve ... --port 20001 ...
```

同时在 RAGFlow 的 Base URL 中也改为 `http://127.0.0.1:20001/v1`。

### 7.2 CUDA / 显存不足

如果日志中出现类似：

```text
Free memory ... is less than desired GPU memory utilization ...
```

说明可用显存不足。可尝试：

- 降低 `--gpu-memory-utilization`，例如 `0.2` 或更低；
- 或换一张空闲显卡（配合 `CUDA_VISIBLE_DEVICES` 环境变量）；
- 或在不影响业务的情况下，停掉占用大量显存的其他进程。

### 7.3 `ModuleNotFoundError` 等依赖错误

确保当前虚拟环境中已安装：

```bash
pip install -U vllm -i https://mirrors.aliyun.com/pypi/simple/
```

如仍报依赖问题，根据具体模块名补装即可。

---

## 8. 管理速查

```bash
# 新建并进入 tmux 会话
tmux new -s vllm-qwen3

# 在会话内启动服务
cd /mnt/cfs/zhangjiyuan
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
vllm serve /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct \
  --model /mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct \
  --port 20000 \
  --host 0.0.0.0 \
  --trust-remote-code \
  --gpu-memory-utilization 0.3

# 挂起会话
Ctrl + B, 然后 D

# 查看会话
tmux ls

# 重新进入
tmux attach -t vllm-qwen3

# 停止服务（会话内）
Ctrl + C

# 删除会话
tmux kill-session -t vllm-qwen3
```

按本文操作，你就可以在本地通过 ModelScope 下载 Qwen3-4B-Instruct，并用 vLLM + tmux 持久运行一个 OpenAI 兼容的 LLM 服务，供 RAGFlow 或其他应用调用。***
