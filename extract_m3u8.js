// extract_m3u8.js
const { chromium } = require('playwright');
const fs = require('fs'); // 引入文件系统模块

(async () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayStr = formatter.format(new Date());
  console.log(`[初始化] 获取北京时间今日日期: ${todayStr}`);

  // 用于存储最后要写入文件的内容
  let m3uContent = '#EXTM3U\n';
  let txtContent = '';

  try {
    const mainMenuUrl = 'https://ssports.iqiyi.com/json/pc/matchData/match_716402760.json';
    const menuRes = await fetch(mainMenuUrl);
    const menuData = await menuRes.json();

    const todayMatchInfo = menuData.retData.match.find(m => m.day === todayStr);
    if (!todayMatchInfo || !todayMatchInfo.matchListUrl) {
      console.log(`[提示] 未在主菜单中找到 ${todayStr} 的赛事列表。`);
      return;
    }

    const listRes = await fetch(todayMatchInfo.matchListUrl);
    const listData = await listRes.json();

    // 提取直播中的 matchId 及其标题
    const liveMatches = [];
    if (listData.retData && listData.retData.match) {
      listData.retData.match.forEach(m => {
        if (m.matchBaseInfo && m.matchBaseInfo.timeDesc === '直播中') {
          liveMatches.push({
            id: m.matchBaseInfo.matchId,
            title: m.matchBaseInfo.title || `赛事-${m.matchBaseInfo.matchId}`
          });
        }
      });
    }

    if (liveMatches.length === 0) {
      console.log('[提示] 当前没有处于“直播中”状态的比赛。');
      // 即使没有直播，也生成空文件，覆盖旧内容失效链接
      fs.writeFileSync('live.m3u', m3uContent, 'utf-8');
      fs.writeFileSync('live.txt', txtContent, 'utf-8');
      return;
    }

    console.log(`[分析完毕] 共找到 ${liveMatches.length} 场正在直播的比赛。`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    for (const match of liveMatches) {
      const targetUrl = `https://shinaisports.com/live.html?matchId=${match.id}`;
      console.log(`\n正在访问: ${targetUrl} (${match.title})`);
      
      const page = await context.newPage();
      const m3u8Urls = [];
      const MAX_URLS = 3;

      page.on('request', request => {
        const url = request.url();
        if (url.includes('.m3u8') && m3u8Urls.length < MAX_URLS) {
          if (!m3u8Urls.includes(url)) {
            m3u8Urls.push(url);
            console.log(`[拦截到] ${url}`);
          }
        }
      });

      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
      } catch (error) {
        console.log("[提示] 页面加载完成或超时...");
      }

      // 将抓取到的链接拼接到文件内容中
      if (m3u8Urls.length > 0) {
        m3u8Urls.forEach((url, index) => {
          const channelName = `${match.title}-线路${index + 1}`;
          // M3U 标准格式
          m3uContent += `#EXTINF:-1 tvg-name="${channelName}" group-title="体育直播",${channelName}\n${url}\n`;
          // TXT 格式 (频道名,链接)
          txtContent += `${channelName},${url}\n`;
        });
      }

      await page.close();
    }

    await browser.close();

    // 写入文件到根目录
    fs.writeFileSync('live.m3u', m3uContent, 'utf-8');
    fs.writeFileSync('live.txt', txtContent, 'utf-8');
    console.log(`\n[完成] 成功生成 live.m3u 和 live.txt。`);

  } catch (error) {
    console.error('[错误] 异常:', error);
  }
})();
