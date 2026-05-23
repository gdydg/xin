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


## 5) 输出分组

- `live.m3u` 中所有频道统一使用 `group-title="新英直播"`。
- `live.txt` 首行写入 `新英直播,#genre#`，其后为 `频道名,链接`。

## 6) 直播场次判定逻辑

为避免漏抓“正在直播”的场次，抓取逻辑会综合以下字段判断是否 live：

- `matchBaseInfo.status === "1"`
- `matchBaseInfo.statusV2 === "1"`
- `matchBaseInfo.matchStatus === "1"`
- `matchBaseInfo.statusDesc` 或 `timeDesc` 包含 `直播中`
- `commonBaseInfo.type === "living"`
- `jumpInfo.ssportsH5` 包含 `/live/`

并按 `matchId` 去重，日志会输出本次识别到的全部直播 `matchId`。
