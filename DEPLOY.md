## 部署指南（服务器）

> 假设服务器已安装 `git`、`docker`、`docker-compose`、`node>=18.20`、`npm`。以下以 **Linux** 环境为例。端口默认：Web 20080，API 9380/9381，MinIO 9000/9001，Redis 6379，MySQL 5455。

### 1. 拉取代码
```bash
git clone https://your.git.repo/ragflow.git
cd ragflow
```

### 2. 环境变量
- 复制或编辑 `docker/.env`，根据需要修改：
  - `SVR_WEB_HTTP_PORT`（默认 20080）
  - `EXPOSE_MYSQL_PORT`（默认 5455）
  - 存储/密码类变量（MySQL/Redis/MinIO 等）
- 如需自定义前端 base 路径，确保 `ragflow_web/.env.production` 的 `VITE_BASE_URL` 与 Nginx `/custom/` 或 `/` 路径一致（当前为 `/custom/`）。

### 3. 前端构建
```bash
cd ragflow_web
npm install
npm run build
cd ..
```
构建产物会输出到 `ragflow_web/dist`，已在 docker-compose 中挂载到 `/custom/`。

### 4. 运行依赖与服务（Docker）
```bash
cd docker
docker compose down
docker compose up -d
```
如仅需 CPU 版，可在 `.env` 内设定镜像/端口，不必使用 profile。

### 5. 访问入口
- 主站（镜像自带前端）：`http://<服务器IP>:20080/`
- 自定义前端（挂载产物）：`http://<服务器IP>:20080/custom/`
- API：`http://<服务器IP>:9380`（管理员 9381）

### 6. 常用运维操作
- 查看状态：
```bash
cd docker
docker compose ps
docker compose logs -f ragflow-cpu   # 或 ragflow-gpu
```
- 重启服务：
```bash
docker compose restart
```
- 清理无用资源（慎用）：
```bash
docker system prune -af   # 会删除未使用的镜像/容器/网络
```

### 7. 磁盘与 ES 水位
Elasticsearch 若磁盘占满会将索引设为只读。监控并腾挪空间，必要时解除只读：
```bash
curl -u elastic:$ELASTIC_PASSWORD -H 'Content-Type: application/json' \
  -XPUT "http://127.0.0.1:1200/_all/_settings" \
  -d '{"index.blocks.read_only_allow_delete": null}'
```

### 8. 备份/持久化
数据卷在 `docker` 目录下（`esdata01`、`mysql_data`、`minio_data`、`redis_data` 等），请按需挂载到持久盘或做快照备份。

### 9. 防火墙与反向代理
- 开放需要的端口（如 20080/9380/9000 等），或在外部用 Nginx/Traefik 做反向代理与 HTTPS 终止。
- 如更换外层域名/路径，确保前端 `VITE_BASE_URL` 与 Nginx 路由保持一致。

### 10. 常见问题
- **前端 404/500**：确认访问了正确端口（默认 20080），`VITE_BASE_URL` 与 Nginx 路由匹配，`dist` 已挂载。
- **上传失败/ES 报 Flood-stage**：磁盘不足导致只读，参见第 7 步处理。
- **GPU 版**：使用 `ragflow-gpu` 服务，需要主机支持 Nvidia 驱动与 `nvidia-container-toolkit`。***
