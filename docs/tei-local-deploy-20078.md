# TEI 本地部署使用说明（端口 20078）

基于 Hugging Face [Text Embeddings Inference (TEI)](https://github.com/huggingface/text-embeddings-inference) 在本地用 Docker 部署嵌入服务，端口 **20078**。

**前置条件**：已安装 Docker，使用 GPU 时已安装 NVIDIA 驱动与 NVIDIA Container Toolkit。

---

## 1. 拉取并启动模型

### 1.1 准备目录与变量

```bash
# 进入你希望缓存模型权重的目录（避免每次启动重复下载）
mkdir -p tei_data
cd tei_data

# 模型与端口
export MODEL="Qwen/Qwen3-Embedding-0.6B"
export VOLUME="$PWD"
export PORT=20078
```

> **关于端口**：`-p ${PORT}:80` 表示把**宿主机**的 `20078` 映射到**容器内部**的 `80`。TEI 镜像在容器里监听 80，对外只需访问宿主机 **20078**，宿主机无需开放 80 端口。

### 1.2 GPU 运行

```bash
docker run --gpus all \
  -p ${PORT}:80 \
  -v "${VOLUME}:/data" \
  --name tei-embed \
  -d ghcr.io/huggingface/text-embeddings-inference:cuda-1.9 \
  --model-id "${MODEL}"
```

### 1.3 仅 CPU 运行

```bash
docker run \
  -p ${PORT}:80 \
  -v "${VOLUME}:/data" \
  --name tei-embed-cpu \
  -d ghcr.io/huggingface/text-embeddings-inference:1.9 \
  --model-id "${MODEL}"
```

首次启动会从 Hugging Face 拉取模型，耗时视网络而定。查看日志：

```bash
docker logs -f tei-embed
```

看到服务就绪后再做下面的验证与调用。

---

## 2. 验证服务

### 2.1 健康检查

```bash
curl http://127.0.0.1:20078/health
```

返回正常即表示服务已就绪。

### 2.2 测试嵌入接口

```bash
curl http://127.0.0.1:20078/embed \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"inputs": ["什么是深度学习？"]}'
```

返回 JSON 中的数组即为该句子的向量。

---

## 3. 调用方式

服务根地址（Base URL）：**`http://<主机>:20078`**，不要加 `/embed` 或 `/v1`。

### 3.1 cURL

```bash
# 单条
curl http://127.0.0.1:20078/embed \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"inputs": ["什么是深度学习？"]}'

# 批量
curl http://127.0.0.1:20078/embed \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"inputs": ["今天是美好的一天", "我喜欢你"]}'
```

### 3.2 Python（huggingface_hub）

```bash
pip install --upgrade huggingface_hub
```

```python
from huggingface_hub import InferenceClient

client = InferenceClient(base_url="http://127.0.0.1:20078")
embeddings = client.feature_extraction(inputs="什么是深度学习？")
print(len(embeddings[0]), embeddings[0][:5])
```

### 3.3 Python（OpenAI 兼容接口）

```bash
pip install --upgrade openai
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:20078/v1", api_key="dummy")
resp = client.embeddings.create(
    model="text-embeddings-inference",
    input="什么是深度学习？",
)
print(len(resp.data[0].embedding), resp.data[0].embedding[:5])
```

---

## 4. 在 RAGFlow 中配置

将 TEI 作为默认嵌入模型时，在 **设置 → 模型** 或 `conf/service_conf.yaml` 中填写：

| 项       | 值 |
|----------|-----|
| 提供商   | **HuggingFace** |
| 模型名称 | **Qwen/Qwen3-Embedding-0.6B**（与上面 `MODEL` 一致） |
| Base URL | **http://127.0.0.1:20078**（或实际主机 IP） |
| API Key  | 任意，如 **dummy** |

`service_conf.yaml` 示例：

```yaml
user_default_llm:
  default_models:
    embedding_model:
      name: 'Qwen/Qwen3-Embedding-0.6B'
      factory: 'HuggingFace'
      base_url: 'http://127.0.0.1:20078'
      api_key: 'dummy'
```

---

## 5. 常用运维命令

| 操作       | 命令 |
|------------|------|
| 查看日志   | `docker logs -f tei-embed` |
| 停止       | `docker stop tei-embed` |
| 启动       | `docker start tei-embed` |
| 删除容器   | `docker rm -f tei-embed`（镜像与 `/data` 内模型仍保留） |

---

## 6. 更换模型或端口

- **换模型**：先 `docker rm -f tei-embed`，再修改 `MODEL` 后重新执行 1.2 或 1.3。
- **换端口**：将上面所有 `20078` 改为新端口（如 `20079`），并相应修改 RAGFlow 的 `base_url`。

文档中端口已固定为 **20078**，按本文执行即可完成拉模型、Docker 运行、验证与调用全流程。
