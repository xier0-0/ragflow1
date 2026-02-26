# 使用 Xinference + ModelScope 部署本地 LLM / Embedding / Rerank（基于 /mnt/cfs/zhangjiyuan）

本文档说明如何在 **无 sudo 权限** 的情况下，在当前机器的 `/mnt/cfs/zhangjiyuan` 目录下，使用 **Xinference** 作为推理服务框架，通过 **ModelScope** 拉取并部署以下三类本地模型，并接入 RAGFlow：

- **Chat LLM**：`Qwen/Qwen3-14B`
- **Embedding**：`Qwen/Qwen3-Embedding-4B`
- **Rerank**：`dengcao/Qwen3-Reranker-4B-GGUF`

> **约定**：
> - 你的「个人工作根目录」是：`/mnt/cfs/zhangjiyuan`
> - 其中已经或将会包含：`xinference/`（Xinference 运行数据）、`modelscope_cache/`（ModelScope 缓存）、`models/`（本地模型目录）、`logs/`（日志）等。

---

## 一、目录与环境规划

### 1.1 目录结构约定

后续所有步骤以 `/mnt/cfs/zhangjiyuan` 为根目录：

| 用途                | 路径                                            |
|---------------------|-------------------------------------------------|
| 基础目录            | `/mnt/cfs/zhangjiyuan`                          |
| Python 虚拟环境（可选） | `/mnt/cfs/zhangjiyuan/.venv_xinference`         |
| Xinference 运行数据 | `/mnt/cfs/zhangjiyuan/xinference`               |
| ModelScope 缓存     | `/mnt/cfs/zhangjiyuan/modelscope_cache`         |
| 本地模型目录        | `/mnt/cfs/zhangjiyuan/models`                   |
| 日志目录（可选）    | `/mnt/cfs/zhangjiyuan/logs`                     |

初始化目录：

```bash
mkdir -p /mnt/cfs/zhangjiyuan/xinference
mkdir -p /mnt/cfs/zhangjiyuan/modelscope_cache
mkdir -p /mnt/cfs/zhangjiyuan/models
mkdir -p /mnt/cfs/zhangjiyuan/logs
```

---

## 二、安装 Python 环境 + Xinference + ModelScope（无 sudo）

### 2.1 创建 Python 虚拟环境

推荐为 Xinference 单独建一个虚拟环境：

```bash
# 创建虚拟环境（Python 3.10+）
python3 -m venv /mnt/cfs/zhangjiyuan/.venv_xinference

# 激活虚拟环境
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
```

后续所有命令都需要先执行 `source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate` 激活虚拟环境。

### 2.2 安装 Xinference 与 ModelScope（使用国内源）

```bash
# 安装 Xinference + ModelScope
pip install "xinference[all]" "modelscope" \
  -i https://mirrors.aliyun.com/pypi/simple/
```

> **说明**：
> - `xinference[all]` 会安装 vLLM / llama.cpp 等常用后端。
> - `modelscope` 用于从 ModelScope 拉取模型。

---

## 三、使用 ModelScope 拉取三个模型到本地

我们使用 ModelScope 的 `snapshot_download` 接口，把模型统一放到 `/mnt/cfs/zhangjiyuan/models` 下。

### 3.1 配置 ModelScope 缓存目录（可选）

为了避免模型散落在 `~/.cache` 下，可以显式指定：

```bash
export MODELSCOPE_CACHE=/mnt/cfs/zhangjiyuan/modelscope_cache
```

可以把这一行写入你的 `~/.bashrc`，下次登录也会生效。

### 3.2 编写下载脚本 `download_models.py`

在 `/mnt/cfs/zhangjiyuan` 下创建脚本：

```bash
cd /mnt/cfs/zhangjiyuan

cat > download_models.py << 'EOF'
from modelscope import snapshot_download
from pathlib import Path

BASE = Path("/mnt/cfs/zhangjiyuan/models")
BASE.mkdir(parents=True, exist_ok=True)

def download(model_id: str, local_name: str):
    local_dir = BASE / local_name
    local_dir.mkdir(parents=True, exist_ok=True)
    print(f"===> Downloading {model_id} to {local_dir}")
    snapshot_download(
        model_id=model_id,
        cache_dir="/mnt/cfs/zhangjiyuan/modelscope_cache",
        local_dir=str(local_dir),
    )
    print(f"<=== Done {model_id}")

if __name__ == "__main__":
    # 1. Embedding: Qwen3-Embedding-4B
    download("Qwen/Qwen3-Embedding-4B", "Qwen3-Embedding-4B")

    # 2. Rerank: Qwen3-Reranker-4B-GGUF
    download("dengcao/Qwen3-Reranker-4B-GGUF", "Qwen3-Reranker-4B-GGUF")

    # 3. LLM: Qwen3-14B
    download("Qwen/Qwen3-14B", "Qwen3-14B")
EOF
```

> **注意**：如果 **ModelScope 上这几个 ID 的实际名字与你环境不一致**（比如有 `-Chat` 后缀），只需要把 `model_id="..."` 换成 ModelScope 页面上真实的模型 ID 即可。

### 3.3 执行下载脚本

确保已激活虚拟环境：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
cd /mnt/cfs/zhangjiyuan
python download_models.py
```

下载完成后大致会有：

```bash
ls /mnt/cfs/zhangjiyuan/models

# 期望看到：
# Qwen3-Embedding-4B/
# Qwen3-Reranker-4B-GGUF/
# Qwen3-14B/
```

其中：

- `Qwen3-Embedding-4B/`：transformers 格式目录
- `Qwen3-14B/`：LLM 目录
- `Qwen3-Reranker-4B-GGUF/`：内部应包含一个或多个 `.gguf` 文件（重排模型的 GGUF 量化）

---

## 四、启动 Xinference 服务

### 4.1 设置 Xinference 数据目录

建议把 Xinference 的工作目录显式指定为 `/mnt/cfs/zhangjiyuan/xinference`：

```bash
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference
mkdir -p "$XINFERENCE_HOME"
```

### 4.2 启动 Xinference 服务（前台）

在**一个独立终端**中执行：

```bash
# 激活虚拟环境
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

# 监听所有 IP，端口 9997（RAGFlow 文档默认示例）
xinference-local --host 0.0.0.0 --port 9997
```

看到类似输出说明服务已启动：

```
 * Running on http://0.0.0.0:9997
 * API: http://0.0.0.0:9997/v1
```

> 你也可以用 `nohup ... &` 后台跑，这里为了方便调试建议先前台运行。

### 4.3 后台运行（可选）

如果你希望 Xinference 服务在后台运行：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

nohup xinference-local --host 0.0.0.0 --port 9997 \
  > /mnt/cfs/zhangjiyuan/logs/xinference.log 2>&1 &
```

以后查看日志可以用：

```bash
tail -f /mnt/cfs/zhangjiyuan/logs/xinference.log
```

---

## 五、在 Xinference 上手动挂载三个本地模型

我们通过 `xinference launch` 命令，把三个已经下载好的模型以指定类型注册为：

- Chat LLM：`qwen3-14b-chat-local`
- Embedding：`qwen3-embedding-4b-local`
- Rerank：`qwen3-reranker-4b-local`

### 5.1 启动本地 LLM：Qwen3-14B（用 transformers/vLLM 引擎）

在另一个终端中执行：

```bash
# 激活虚拟环境
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

# LLM：Qwen3-14B
xinference launch \
  --endpoint http://127.0.0.1:9997 \
  --model-name qwen3-14b-chat-local \
  --model-type LLM \
  --model-engine vllm \
  --model-path /mnt/cfs/zhangjiyuan/models/Qwen3-14B \
  --size-in-billions 14
```

> **说明**：如果你暂时不想用 vLLM（比如显存不够或环境问题），也可以把 `--model-engine vllm` 换成 `--model-engine transformers`，其它不变。

执行成功后，命令行会返回一个 `model_uid`，并在 Xinference Web/接口里多出一个可用的 LLM。

### 5.2 启动 Embedding 模型：Qwen3-Embedding-4B

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

xinference launch \
  --endpoint http://127.0.0.1:9997 \
  --model-name qwen3-embedding-4b-local \
  --model-type embedding \
  --model-engine transformers \
  --model-path /mnt/cfs/zhangjiyuan/models/Qwen3-Embedding-4B \
  --size-in-billions 4
```

> **说明**：这里指定 `--model-type embedding`，Xinference 会以向量模型方式对外暴露接口（OpenAI embeddings 兼容）。

### 5.3 启动 Rerank 模型：Qwen3-Reranker-4B-GGUF（GGUF + llama.cpp 引擎）

首先确认 GGUF 文件的实际路径：

```bash
ls /mnt/cfs/zhangjiyuan/models/Qwen3-Reranker-4B-GGUF
# 找到实际的 .gguf 文件名，假设为：
# qwen3-reranker-4b-q5_k_m.gguf
```

然后执行：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

xinference launch \
  --endpoint http://127.0.0.1:9997 \
  --model-name qwen3-reranker-4b-local \
  --model-type rerank \
  --model-engine llama.cpp \
  --model-path /mnt/cfs/zhangjiyuan/models/Qwen3-Reranker-4B-GGUF/qwen3-reranker-4b-q5_k_m.gguf \
  --size-in-billions 4
```

> **注意**：
> - GGUF 格式下，`--model-path` 需要直接指向 `.gguf` 文件。
> - 如果实际文件名和这里不一样，改成你真实的文件名即可。

### 5.4 快速验证 Xinference 模型列表

```bash
curl http://127.0.0.1:9997/v1/models
```

返回的 JSON 中应当能看到类似：

- `qwen3-14b-chat-local`
- `qwen3-embedding-4b-local`
- `qwen3-reranker-4b-local`

---

## 六、在 RAGFlow 中接入 Xinference（Chat / Embedding / Rerank）

### 6.1 确认 RAGFlow 到 Xinference 的连通性（可选但推荐）

在运行 RAGFlow 的那台机器上（同一台机），执行：

```bash
curl http://127.0.0.1:9997/v1/models
```

若返回 JSON 列表，则说明网络连通正常。

> 若未来 RAGFlow 迁入 Docker 容器，需要将 `localhost` 改成 `host.docker.internal`，下文会说明。

### 6.2 在 RAGFlow Web 界面添加 Xinference Provider

1. 打开 RAGFlow Web 前端。
2. 右上角点击头像/Logo → 进入 **Model providers（模型提供商）** 页面。
3. 找到 **Xinference** 条目，点击 **Add** 或 **添加**。
4. 在弹出的配置对话框中填写：
   - **Base URL**：
     - 如果 RAGFlow 也是在宿主机（源码本地起服务）：填写 `http://localhost:9997/v1`
     - 如果未来 RAGFlow 在 Docker 容器里，而 Xinference 在宿主机：填写 `http://host.docker.internal:9997/v1`
   - **API Key**：Xinference 默认不需要，可留空或填 `dummy`。
5. 点击保存/确认。

> **说明**：对于 rerank（重排）模型，RAGFlow 文档中常用的 Base URL 形式是：`http://<xinference-host>:9997/v1/rerank`，但一般是在配置「Rerank Provider」时单独指定；具体看你当前 RAGFlow 版本支持的界面项。

### 6.3 设置系统默认模型（System Model Settings）

1. 仍然在 Model providers 页面中。
2. 找到 **System Model Settings（系统模型设置）** 或类似入口，点击进入。

#### 6.3.1 选择默认 Chat 模型（LLM）

- 在 **Chat model / 对话模型** 下拉列表中选择：**`qwen3-14b-chat-local`**

> 如果列表太长，可先在搜索框中输入 `qwen3` 进行过滤。

设置完成后，RAGFlow 中默认的聊天场景（如「对话」页面）会优先使用此模型。

#### 6.3.2 选择默认 Embedding 模型

- 在 **Embedding model / 嵌入模型** 下拉列表中选择：**`qwen3-embedding-4b-local`**

设置完成后，知识库构建、文档向量化等流程会默认使用该模型生成向量。

#### 6.3.3 选择默认 Rerank 模型（若界面支持）

- 在 **Rerank model / 重排模型** 下拉列表中选择：**`qwen3-reranker-4b-local`**

> **说明**：
> - 某些版本的 RAGFlow 可能暂时 **不支持通过 Xinference Provider 调用 Rerank 模型**，如果你在下拉框里看不到相应条目，这属于版本能力限制，而不是配置错误。
> - 即便如此，LLM 与 Embedding 仍然可以正常工作，等后续版本支持后，只需回到此处补选 `qwen3-reranker-4b-local` 即可。

#### 6.3.4 保存配置

检查三类模型名称无误后，点击保存按钮。如有「测试连接」按钮，可点一次验证。

---

## 七、在具体功能中验证与使用

### 7.1 对话功能验证（Chat）

1. 打开 RAGFlow 的「对话」/「聊天」页面。
2. 新建会话，在右侧模型选择中，确认已选中或可选：`qwen3-14b-chat-local`。
3. 输入中文问题，比如：「解释一下向量数据库在 RAG 中的作用？」
4. 若能正常得到合理回答，说明 Chat LLM 配置成功。

### 7.2 知识库 / 检索验证（Embedding）

1. 新建一个小型知识库，上传 1~3 篇短文档。
2. 等待索引完成（会使用 `qwen3-embedding-4b-local` 生成向量）。
3. 在知识库问答中提几个与文档内容相关的问题。
4. 如能正确检索并回答，说明 Embedding 模型链路正常。

### 7.3 重排验证（Rerank，若版本支持）

1. 在索引/检索配置中，若出现「重排模型 / Rerank model」选项，选择 `qwen3-reranker-4b-local`。
2. 使用一个内容较多的知识库，进行检索问答。
3. 对比「开启重排」和「关闭重排」时，返回结果是否更加相关和稳定。

---

## 八、常见问题与排查思路

### 8.1 Xinference 端口不通

首先在终端确认 Xinference 服务是否正常：

```bash
curl http://127.0.0.1:9997/v1/models
```

若 RAGFlow 在 Docker 容器中运行，需要在容器内测试：

```bash
# 进入 RAGFlow 容器后
curl http://host.docker.internal:9997/v1/models
```

确保 RAGFlow 的 Xinference Base URL 与实际访问地址对应（本机则用 `localhost`，容器内则用 `host.docker.internal`）。

### 8.2 某个模型启动失败

重点看 `xinference launch` 的报错，一般是：

- **模型路径写错**（目录 / 文件名不对）
- **显存不足**（特别是 Qwen3-14B）
- **模型格式与 `model-engine` 不匹配**（比如 transformers 模型却用 llama.cpp）

**解决思路**：

- 确认 `/mnt/cfs/zhangjiyuan/models/xxx` 下文件是否完整
- 对 GGUF 模型一定要把 `--model-path` 指到具体 `.gguf` 文件
- LLM/Embedding 一般用 `transformers` 或 `vllm` 引擎，rerank GGUF 用 `llama.cpp`

### 8.3 显存不够 / 性能不足

优先降级量化版本或换更小模型：

- **LLM**：可以考虑改用更小的 `Qwen/Qwen3-7B` 或量化版本
- **Embedding**：如果有更轻量的 Qwen3 Embedding 或 BGE 系列，可替换
- **Rerank**：若机器资源有限，可暂时关闭重排，仅使用 Embedding 检索

### 8.4 ModelScope 下载失败

如果 `python download_models.py` 报错：

- 检查网络是否能访问 `modelscope.cn`
- 尝试手动在浏览器打开 ModelScope 页面，确认模型 ID 是否正确
- 如果下载中断，可以重新运行脚本（ModelScope 会断点续传）

### 8.5 `xinference launch` 找不到命令

确保已激活虚拟环境：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
which xinference
```

如果 `which xinference` 找不到，重新安装：

```bash
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
pip install "xinference[all]" -i https://mirrors.aliyun.com/pypi/simple/
```

---

## 九、模型选择说明（为何选这三个）

- **LLM：`Qwen/Qwen3-14B`**
  - Qwen3 系列 14B 参数模型，中英文能力均衡，适合 RAG 场景的对话生成。

- **Embedding：`Qwen/Qwen3-Embedding-4B`**
  - Qwen3 Embedding 4B 在 MTEB 多任务、多语言评测上表现优秀，4B 体量在单机环境下可运行，召回质量好。

- **Rerank：`dengcao/Qwen3-Reranker-4B-GGUF`**
  - Qwen3-Reranker-4B 的 GGUF 量化版本，适合在检索后做文本重排，提升最终答案相关性。

---

## 十、完整命令速查表

### 10.1 环境准备

```bash
# 创建目录
mkdir -p /mnt/cfs/zhangjiyuan/{xinference,modelscope_cache,models,logs}

# 创建 Python 虚拟环境
python3 -m venv /mnt/cfs/zhangjiyuan/.venv_xinference

# 激活虚拟环境
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate

# 安装依赖
pip install "xinference[all]" "modelscope" -i https://mirrors.aliyun.com/pypi/simple/

# 设置环境变量
export MODELSCOPE_CACHE=/mnt/cfs/zhangjiyuan/modelscope_cache
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference
```

### 10.2 下载模型

```bash
cd /mnt/cfs/zhangjiyuan
# 创建 download_models.py（见上文 3.2 节）
python download_models.py
```

### 10.3 启动服务

```bash
# 终端 1：启动 Xinference
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference
xinference-local --host 0.0.0.0 --port 9997

# 终端 2：启动三个模型
source /mnt/cfs/zhangjiyuan/.venv_xinference/bin/activate
export XINFERENCE_HOME=/mnt/cfs/zhangjiyuan/xinference

# LLM
xinference launch --endpoint http://127.0.0.1:9997 \
  --model-name qwen3-14b-chat-local --model-type LLM \
  --model-engine vllm \
  --model-path /mnt/cfs/zhangjiyuan/models/Qwen3-14B \
  --size-in-billions 14

# Embedding
xinference launch --endpoint http://127.0.0.1:9997 \
  --model-name qwen3-embedding-4b-local --model-type embedding \
  --model-engine transformers \
  --model-path /mnt/cfs/zhangjiyuan/models/Qwen3-Embedding-4B \
  --size-in-billions 4

# Rerank（注意：--model-path 要指向具体的 .gguf 文件）
xinference launch --endpoint http://127.0.0.1:9997 \
  --model-name qwen3-reranker-4b-local --model-type rerank \
  --model-engine llama.cpp \
  --model-path /mnt/cfs/zhangjiyuan/models/Qwen3-Reranker-4B-GGUF/qwen3-reranker-4b-q5_k_m.gguf \
  --size-in-billions 4
```

### 10.4 验证

```bash
# 查看模型列表
curl http://127.0.0.1:9997/v1/models
```

---

文档完成。按此流程执行即可完成 Xinference + ModelScope 的本地模型部署，并接入 RAGFlow。
