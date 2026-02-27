# 本地 Qwen3-4B-Instruct 对话服务部署文档（ModelScope + Transformers + tmux）

本文档说明如何在 **无翻墙** 的前提下：

- 用 **ModelScope** 在本地下载 `Qwen/Qwen3-4B-Instruct-2507`；
- 用 **Transformers + FastAPI** 起一个简单的 **OpenAI `/v1/chat/completions` 兼容服务**；
- 用 **tmux** 在后台长期运行该服务；
- 在 **RAGFlow** 中作为 Chat 模型使用。

基础目录统一约定为：`/mnt/cfs/zhangjiyuan`，端口使用 **21000**（可按需修改）。

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
pip install -U modelscope fastapi uvicorn "transformers>=4.40.0" accelerate -i https://mirrors.aliyun.com/pypi/simple/
```

---

## 2. 使用 ModelScope 本地下载 Qwen3-4B-Instruct

我们在本地下载 `Qwen/Qwen3-4B-Instruct-2507` 到固定目录。

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

## 3. 编写本地 LLM 代理服务（Transformers + FastAPI）

在 `/mnt/cfs/zhangjiyuan` 下创建 `llm_server.py`（**纯 CPU 推理，不用 GPU**）：

```bash
cat > /mnt/cfs/zhangjiyuan/llm_server.py << 'PY'
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_PATH = "/mnt/cfs/zhangjiyuan/models/Qwen3-4B-Instruct"
MODEL_NAME = "qwen3-4b-instruct-local"

app = FastAPI()

# 强制使用 CPU，避免 CUDA / 显存相关问题
device = "cpu"

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    trust_remote_code=True,
    torch_dtype=torch.float32,
)
model.to(device)


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str
    messages: List[Message]
    max_tokens: Optional[int] = 512
    temperature: Optional[float] = 0.7


@app.post("/v1/chat/completions")
def chat_completions(req: ChatRequest):
    # 简单对话模板（可根据需要调整）
    history = ""
    for m in req.messages:
        if m.role == "user":
            history += f"用户：{m.content}\n"
        elif m.role == "assistant":
            history += f"助手：{m.content}\n"
    prompt = history + "助手："

    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    with torch.inference_mode():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=req.max_tokens,
            do_sample=True,
            temperature=req.temperature,
            pad_token_id=tokenizer.eos_token_id,
        )
    gen_ids = output_ids[0][inputs["input_ids"].shape[1]:]
    text = tokenizer.decode(gen_ids, skip_special_tokens=True)

    return {
        "id": "chatcmpl-local",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": text},
                "finish_reason": "stop",
            }
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=21000)
PY
```

> 说明：  
> 这里用的是一个非常简单的 Prompt 模板，如果你后面希望更贴合 Qwen 官方 chat 模板，可以在 `prompt` 构造部分做细化。

---

## 4. 使用 tmux 在后台运行 LLM 服务

### 4.1 新建 tmux 会话并启动服务

```bash
tmux new -s llm-qwen3
```

进入 tmux 会话后执行：

```bash
cd /mnt/cfs/zhangjiyuan
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

python /mnt/cfs/zhangjiyuan/llm_server.py
```

看到类似日志：

```text
Uvicorn running on http://0.0.0.0:21000 (Press CTRL+C to quit)
```

说明服务已启动成功。

按下：

- `Ctrl + B`，再按 `D`

即可挂起 tmux 会话，让服务在后台持续运行。

### 4.2 管理 tmux 会话

- 查看会话：

  ```bash
  tmux ls
  ```

- 重新进入会话：

  ```bash
  tmux attach -t llm-qwen3
  ```

- 在会话内按 `Ctrl + C` 停止服务；如需删除会话：

  ```bash
  tmux kill-session -t llm-qwen3
  ```

---

## 5. 自测 `/v1/chat/completions` 接口

在任意终端执行：

```bash
curl -s -X POST http://127.0.0.1:21000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-4b-instruct-local",
    "messages": [{"role": "user", "content": "用中文简单介绍一下你自己"}]
  }'
```

如果能返回类似：

```json
{
  "id": "chatcmpl-local",
  "object": "chat.completion",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "……"
      },
      "finish_reason": "stop"
    }
  ]
}
```

说明本地 LLM 代理服务工作正常。

---

## 6. 在 RAGFlow 中配置本地 Chat 模型

### 6.1 添加 LLM Provider

1. 打开 RAGFlow Web 界面。  
2. 右上角头像 → `Model providers`。  
3. 新增一个 **OpenAI 兼容** Provider，例如命名：`Local-Qwen3-Chat`。  
4. 配置：
   - **Base URL**：`http://127.0.0.1:21000/v1`
   - **API Key**：任意非空字符串，例如 `qwen3-local-key`

### 6.2 绑定为系统默认 Chat 模型

在「系统模型设置」中：

- Provider 选择：`Local-Qwen3-Chat`
- Chat 模型名填：`qwen3-4b-instruct-local`

之后所有 Chat 调用会通过本地 `llm_server.py` + Qwen3-4B-Instruct 完成。

---

## 7. 常见问题与排查

### 7.1 纯 CPU 场景下的性能提示

- 纯 CPU 模式下，大模型推理会明显慢于 GPU，建议：
  - 将 `max_tokens` 适当调小（例如 128 或 64）；  
  - 尽量减少系统消息和历史消息长度。  
- 如有条件，建议后续切换到更小的 Qwen3 变体（1.8B / 0.6B Instruct）以提升速度。

### 7.2 `ModuleNotFoundError` 等依赖错误

确保在虚拟环境中执行了：

```bash
pip install -U fastapi uvicorn "transformers>=4.40.0" accelerate -i https://mirrors.aliyun.com/pypi/simple/
```

### 7.3 端口冲突

如果 21000 被占用，可以在 `llm_server.py` 里改成其他端口（如 21001），并在 RAGFlow Provider 中同步修改 Base URL。

---

## 8. 管理速查（tmux + 服务）

```bash
# 新建并进入会话
tmux new -s llm-qwen3

# 在会话内启动服务
cd /mnt/cfs/zhangjiyuan
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
python llm_server.py

# 挂起会话
Ctrl + B, 然后 D

# 查看会话
tmux ls

# 重新进入会话
tmux attach -t llm-qwen3

# 停止服务（会话内）
Ctrl + C

# 删除会话
tmux kill-session -t llm-qwen3
```

按本文操作，你就可以在本地通过 ModelScope 下载 Qwen3-4B-Instruct，并用 Transformers + FastAPI + tmux 持久运行一个 OpenAI 兼容的 Chat 服务，供 RAGFlow 或其他应用调用。***
