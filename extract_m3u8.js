// extract_m3u8.js
const { chromium } = require('playwright');

(async () => {
  // 1. 动态获取当前北京时间的日期，格式为 YYYY-MM-DD
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayStr = formatter.format(new Date());
  console.log(`[初始化] 获取北京时间今日日期: ${todayStr}`);

  try {
    // 2. 访问主目录 JSON 获取当天赛事的 matchListUrl
    const mainMenuUrl = 'https://ssports.iqiyi.com/json/pc/matchData/match_716402760.json';
    const menuRes = await fetch(mainMenuUrl);
    const menuData = await menuRes.json();

    const todayMatchInfo = menuData.retData.match.find(m => m.day === todayStr);
    if (!todayMatchInfo || !todayMatchInfo.matchListUrl) {
      console.log(`[提示] 未在主菜单中找到 ${todayStr} 的赛事列表 URL。`);
      return;
    }

    console.log(`[获取列表] 今日赛事列表 URL: ${todayMatchInfo.matchListUrl}`);

    // 3. 访问 matchListUrl 获取具体的赛事信息
    const listRes = await fetch(todayMatchInfo.matchListUrl);
    const listData = await listRes.json();

    // 4. 筛选 "timeDesc": "直播中" 的比赛并提取 matchId
    const liveMatchIds = [];
    if (listData.retData && listData.retData.match) {
      listData.retData.match.forEach(m => {
        if (m.matchBaseInfo && m.matchBaseInfo.timeDesc === '直播中') {
          liveMatchIds.push(m.matchBaseInfo.matchId);
        }
      });
    }

    if (liveMatchIds.length === 0) {
      console.log('[提示] 当前没有处于“直播中”状态的比赛。');
      return;
    }

    console.log(`[分析完毕] 共找到 ${liveMatchIds.length} 场正在直播的比赛:`, liveMatchIds);

    // 5. 启动无头浏览器批量抓取 m3u8
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    for (const matchId of liveMatchIds) {
      const targetUrl = `https://shinaisports.com/live.html?matchId=${matchId}`;
      console.log(`\n========================================`);
      console.log(`正在访问页面: ${targetUrl}`);
      
      const page = await context.newPage();
      const m3u8Urls = [];
      const MAX_URLS = 3;

      // 拦截网络请求并筛选 m3u8
      page.on('request', request => {
        const url = request.url();
        if (url.includes('.m3u8') && m3u8Urls.length < MAX_URLS) {
          if (!m3u8Urls.includes(url)) { // 简单的去重逻辑
            m3u8Urls.push(url);
            console.log(`[拦截到请求] ${url}`);
          }
        }
      });

      try {
        // 等待网络空闲，确保视频流请求被触发
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
      } catch (error) {
        console.log("[提示] 页面加载超时或由于网络限制报错，但可能已捕获到相关请求...");
      }

      // 结果输出
      console.log(`--- MatchId: ${matchId} 提取完成 ---`);
      if (m3u8Urls.length === 0) {
        console.log("未找到任何 M3U8 链接。");
      } else {
        m3u8Urls.forEach((url, index) => {
          console.log(`URL ${index + 1}: ${url}`);
        });
      }

      // 关闭当前页面释放内存，准备进入下一个循环
      await page.close();
    }

    // 所有任务完成后关闭浏览器实例
    await browser.close();
    console.log(`\n[完成] 所有直播赛事解析结束。`);

  } catch (error) {
    console.error('[错误] 脚本运行中出现异常:', error);
  }
})();
