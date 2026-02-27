# 本地 Qwen3-4B 对话服务部署文档（基于现有模型目录 + Transformers + tmux）

你当前本地已经有一个模型目录：

- `Qwen3-4B`：位于 `/mnt/cfs/zhangjiyuan/models/Qwen3-4B`

本文不再下载模型，直接用 **Transformers + FastAPI** 起一个轻量的、本地 **OpenAI `/v1/chat/completions` 兼容服务**，并用 **tmux** 管理，让 RAGFlow 能通过 `openai-api-compatible` Provider 调用。

我们主要做三件事：

1. 用 Transformers 加载 `/mnt/cfs/zhangjiyuan/models/Qwen3-4B`，只加载一次，常驻内存；
2. 用 FastAPI 暴露 `/v1/chat/completions` 接口；
3. 用 tmux 在后台长期跑这个服务。

---

## 1. 环境与目录约定

- 基础目录：`/mnt/cfs/zhangjiyuan`
- 模型目录：`/mnt/cfs/zhangjiyuan/models/Qwen3-4B`
- 虚拟环境：`/mnt/cfs/zhangjiyuan/.venv_xinference`
- LLM 服务端口：`21010`（避免和已有端口冲突，可按需改成其它 >20000 的端口）

确保目录存在：

```bash
ls -lah /mnt/cfs/zhangjiyuan/models/Qwen3-4B
```

如不存在，再考虑用 ModelScope 下载；这里假定你已经有这个目录。

---

## 2. 准备 Python 虚拟环境与依赖

### 2.1 创建 / 激活虚拟环境

如之前已创建 `.venv_xinference` 可直接复用：

```bash
python3 -m venv /mnt/cfs/zhangjiyuan/.venv_xinference
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
```

### 2.2 安装依赖

```bash
pip install -U fastapi uvicorn "transformers>=4.40.0" accelerate -i https://mirrors.aliyun.com/pypi/simple/
```

> 说明：  
> - 使用 transformers 直接加载本地 Qwen3-4B；  
> - 通过 `accelerate` 等库帮助更好地在 GPU 上运行。

---

## 3. 编写本地 LLM 代理服务（`llm_server_qwen3_4b.py`）

在 `/mnt/cfs/zhangjiyuan` 下创建文件：

```bash
cat > /mnt/cfs/zhangjiyuan/llm_server_qwen3_4b.py << 'PY'
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
import os

MODEL_PATH = "/mnt/cfs/zhangjiyuan/models/Qwen3-4B"
MODEL_NAME = "qwen3-4b-local"
PORT = 21010

# 可选：指定使用哪块 GPU，例如 "0" 或 "1"；如果不需要固定，就注释掉下一行
# os.environ["CUDA_VISIBLE_DEVICES"] = "0"

app = FastAPI()

device = "cuda" if torch.cuda.is_available() else "cpu"

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    trust_remote_code=True,
    torch_dtype=torch.float16 if device == "cuda" else torch.float32,
)
model.to(device)
model.eval()


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str
    messages: List[Message]
    max_tokens: Optional[int] = 128
    temperature: Optional[float] = 0.7


@app.post("/v1/chat/completions")
def chat_completions(req: ChatRequest):
    # 简单拼接对话历史（为减小延迟，尽量保持提示词简洁）
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
        "id": "chatcmpl-qwen3-4b-local",
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

    uvicorn.run(app, host="0.0.0.0", port=PORT)
PY
```

**性能优化点（相对上一版）：**

- 默认 `max_tokens=128`，大幅缩短每次生成长度；
- 使用 `torch.inference_mode()`，避免多余的 autograd 开销；
- 模型只在启动时加载一次，不在每次请求重复加载；
- 可以通过 `CUDA_VISIBLE_DEVICES` 固定到一块相对空闲的 GPU。

---

## 4. 使用 tmux 在后台运行 LLM 服务

### 4.1 第一次在 tmux 中启动

```bash
tmux new -s llm-qwen3-4b
```

进入 tmux 会话后执行：

```bash
cd /mnt/cfs/zhangjiyuan
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

python /mnt/cfs/zhangjiyuan/llm_server_qwen3_4b.py
```

看到类似日志：

```text
Uvicorn running on http://0.0.0.0:21010 (Press CTRL+C to quit)
```

说明服务已经启动成功。

按下：

- `Ctrl + B`，然后 `D`

即可挂起 tmux 会话，让服务在后台持续运行。

### 4.2 管理 tmux 会话

- 查看会话：

  ```bash
  tmux ls
  ```

- 重新进入会话：

  ```bash
  tmux attach -t llm-qwen3-4b
  ```

- 在会话内按 `Ctrl + C` 停止服务；如需删除会话：

  ```bash
  tmux kill-session -t llm-qwen3-4b
  ```

---

## 5. 自测 `/v1/chat/completions` 接口

在新的终端中（不在 tmux 内）执行：

```bash
curl -s -X POST http://127.0.0.1:21010/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-4b-local",
    "messages": [{"role": "user", "content": "用中文简单介绍一下你自己"}]
  }'
```

如果返回一段中文回答，说明本地 LLM 代理服务已经工作正常。

> 如果长时间无响应，说明显存或 GPU 负载压力太大，可以：
> - 减小 `max_tokens`（例如改为 64）；  
> - 换到更空闲的 GPU（设置 `CUDA_VISIBLE_DEVICES`）；  
> - 或换成更小的 Qwen3 变体（如 1.8B / 0.6B）。

---

## 6. 在 RAGFlow 中配置本地 Chat 模型

### 6.1 添加 OpenAI 兼容 Provider

1. 打开 RAGFlow Web 界面。  
2. 右上角头像 → `Model providers`。  
3. 新增一个 **OpenAI-API-Compatible** Provider，例如命名为：`Local-Qwen3-4B`。  
4. 填写：
   - **Base URL**：`http://127.0.0.1:21010/v1`  
   - **API Key**：任意非空字符串，例如 `local-qwen3-4b-key`

### 6.2 绑定为系统默认 Chat 模型

在「系统模型设置」中：

- Provider 选择：`Local-Qwen3-4B`  
- Chat 模型名填：`qwen3-4b-local`

（只要和上面的 `ChatRequest.model` 使用的一致即可，服务端不会真正校验这个字符串。）

---

## 7. 性能与资源建议

- **模型大小**：Qwen3-4B 在单张 A100 上是可行的，但如果 GPU 已经被其它任务大量占用，请尽量：
  - 选择一张较空闲的卡，通过 `CUDA_VISIBLE_DEVICES` 固定；  
  - 或尝试更小的 Qwen3 变体（1.8B / 0.6B）。
- **每次生成长度**：`max_tokens` 越小，延迟越低；  
  - 如果只是用来做 RAG 回答，128 通常够用，可以视情况改为 64。

---

## 8. 快速命令速查

```bash
# 激活环境
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

# 启动 tmux 会话并运行服务
tmux new -s llm-qwen3-4b
  cd /mnt/cfs/zhangjiyuan
  source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
  python llm_server_qwen3_4b.py

# 挂起会话
Ctrl + B, 然后 D

# 查看会话
tmux ls

# 重新进入会话
tmux attach -t llm-qwen3-4b

# 停止服务（会话内）
Ctrl + C

# 删除会话
tmux kill-session -t llm-qwen3-4b
```

按本文执行，你就可以基于已有的 `/mnt/cfs/zhangjiyuan/models/Qwen3-4B` 目录，起一个更轻量、更可控的本地 Qwen3-4B 对话服务，并用 tmux 稳定管理。***
