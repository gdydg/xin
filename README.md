# xin stream extractor

该项目已改造成可发布到 GHCR 并在 Render 部署的容器服务。

## 1) 构建并推送到 GHCR

```bash
docker build -t ghcr.io/<owner>/<repo>:latest .
docker push ghcr.io/<owner>/<repo>:latest
```

## 2) Render 部署

在 Render 新建 **Web Service**，镜像地址填：

`ghcr.io/<owner>/<repo>:latest`

设置环境变量：

- `PORT`：Render 会自动注入（可不填）
- `TRIGGER_TOKEN`：外部触发密钥（必须）

## 3) 外部 Cron 触发抓取

使用任何外部 Cron（如 cron-job.org、GitHub Actions、UptimeRobot）请求：

```bash
# POST 方式
curl -X POST "https://<your-render-domain>/trigger" \
  -H "x-trigger-token: <TRIGGER_TOKEN>"

# GET 方式（便于外部 cron / Cloudflare Worker 直接调用）
curl "https://<your-render-domain>/trigger?token=<TRIGGER_TOKEN>"
```

触发后会重新抓取并覆盖：

- `/live.m3u`
- `/live.txt`

可直接访问：

- `https://<your-render-domain>/live.m3u`
- `https://<your-render-domain>/live.txt`

健康检查：

- `GET /healthz`

## 4) GitHub Action 自动构建 GHCR

已提供 `.github/workflows/build-image.yml`：

- 手动触发（`workflow_dispatch`）
- 推送到 `main` 且关键文件变更时自动触发

镜像会推送到：

- `ghcr.io/<owner>/<repo>:latest`（默认分支）
- `ghcr.io/<owner>/<repo>:<short-sha>`
