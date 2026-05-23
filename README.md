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

## 6) matchId 抓取逻辑（已调整）

为满足“减少漏抓”的需求，当前不再仅依赖直播状态字段，而是改为：

- 读取赛事列表中每条比赛的 `matchRoomStartTimeStamp`（缺失时回退 `startTimeStamp`）
- 仅保留 **当前时间往前 6 小时内** 的比赛：`now - 6h <= startTimeStamp <= now`
- 按 `matchId` 去重后逐个发起页面请求并监听 m3u8

这样即使接口中某些比赛状态字段短时不一致，也能在时间窗口内被抓到。

- 拉取主菜单和当日比赛列表接口时增加重试与超时机制（避免你说的“第二个接口没加载完全”导致漏抓）。

## 7) 输出分组说明

- `live.m3u` 中频道分组仍固定为 `group-title="新英直播"`。
- `live.txt` 首行仍固定为 `新英直播,#genre#`。
