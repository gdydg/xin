// extract_m3u8.js
const { chromium } = require('playwright');

(async () => {
  // 启动无头浏览器
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const m3u8Urls = [];
  const MAX_URLS = 3;

  // 拦截网络请求并筛选 m3u8
  page.on('request', request => {
    const url = request.url();
    if (url.includes('.m3u8') && m3u8Urls.length < MAX_URLS) {
      m3u8Urls.push(url);
      console.log(`[拦截到请求] ${url}`);
    }
  });

  // 替换为您的实际目标 URL
  const targetUrl = 'https://shinaisports.com/live.html?matchId=1900002856';

  console.log(`正在访问页面: ${targetUrl}`);
  try {
    // 等待网络空闲，确保 JavaScript 加载并触发了视频流请求
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (error) {
    console.log("页面加载超时或遇到错误，但可能已捕获到所需请求，继续执行后续步骤...");
  }

  // 输出结果
  console.log("\n--- 提取完成，前三个 M3U8 链接 ---");
  if (m3u8Urls.length === 0) {
    console.log("未找到任何 M3U8 链接。");
  } else {
    m3u8Urls.forEach((url, index) => {
      console.log(`URL ${index + 1}: ${url}`);
    });
  }

  // 关闭浏览器实例
  await browser.close();
})();
