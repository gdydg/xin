const { chromium } = require('playwright');
const fs = require('fs');

async function runExtraction({ outputDir = process.cwd(), logger = console } = {}) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayStr = formatter.format(new Date());
  logger.log(`[初始化] 获取北京时间今日日期: ${todayStr}`);

  let m3uContent = '#EXTM3U\n';
  const groupName = '新英直播';
  let txtContent = `${groupName},#genre#\n`;

  const m3uPath = `${outputDir}/live.m3u`;
  const txtPath = `${outputDir}/live.txt`;

  try {
    const mainMenuUrl = 'https://ssports.iqiyi.com/json/pc/matchData/match_716402760.json';
    const menuRes = await fetch(mainMenuUrl);
    const menuData = await menuRes.json();

    const todayMatchInfo = menuData.retData.match.find((m) => m.day === todayStr);
    if (!todayMatchInfo || !todayMatchInfo.matchListUrl) {
      logger.log(`[提示] 未在主菜单中找到 ${todayStr} 的赛事列表。`);
      fs.writeFileSync(m3uPath, m3uContent, 'utf-8');
      fs.writeFileSync(txtPath, txtContent, 'utf-8');
      return { updated: true, matches: 0 };
    }

    const listRes = await fetch(todayMatchInfo.matchListUrl);
    const listData = await listRes.json();

    const liveMatchesMap = new Map();
    if (listData.retData && Array.isArray(listData.retData.match)) {
      listData.retData.match.forEach((m) => {
        const matchBaseInfo = m.matchBaseInfo || {};
        const commonBaseInfo = m.commonBaseInfo || {};
        const jumpInfo = m.jumpInfo || {};

        const status = String(matchBaseInfo.status || '').trim();
        const statusV2 = String(matchBaseInfo.statusV2 || '').trim();
        const matchStatus = String(matchBaseInfo.matchStatus || '').trim();
        const statusDesc = String(matchBaseInfo.statusDesc || '').trim();
        const timeDesc = String(matchBaseInfo.timeDesc || '').trim();
        const commonType = String(commonBaseInfo.type || '').trim().toLowerCase();
        const h5Url = String(jumpInfo.ssportsH5 || '').trim();

        const isLive =
          status === '1' ||
          statusV2 === '1' ||
          matchStatus === '1' ||
          statusDesc.includes('直播中') ||
          timeDesc.includes('直播中') ||
          commonType === 'living' ||
          h5Url.includes('/live/');

        if (!isLive) {
          return;
        }

        const matchId = String(matchBaseInfo.matchId || commonBaseInfo.key || '').trim();
        if (!matchId) {
          return;
        }

        liveMatchesMap.set(matchId, {
          id: matchId,
          title: matchBaseInfo.title || `赛事-${matchId}`
        });
      });
    }

    const liveMatches = Array.from(liveMatchesMap.values());

    if (liveMatches.length === 0) {
      logger.log('[提示] 当前没有处于“直播中”状态的比赛。');
      fs.writeFileSync(m3uPath, m3uContent, 'utf-8');
      fs.writeFileSync(txtPath, txtContent, 'utf-8');
      return { updated: true, matches: 0 };
    }

    logger.log(`[分析完毕] 共找到 ${liveMatches.length} 场正在直播的比赛。`);
    logger.log(`[直播 matchId] ${liveMatches.map((m) => m.id).join(', ')}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    for (const match of liveMatches) {
      const targetUrl = `https://shinaisports.com/live.html?matchId=${match.id}`;
      logger.log(`正在访问: ${targetUrl} (${match.title})`);

      const page = await context.newPage();
      const m3u8Urls = [];
      const MAX_URLS = 3;

      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('.m3u8') && m3u8Urls.length < MAX_URLS && !m3u8Urls.includes(url)) {
          m3u8Urls.push(url);
          logger.log(`[拦截到] ${url}`);
        }
      });

      try {
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
      } catch (error) {
        logger.log('[提示] 页面加载完成或超时...');
      }

      if (m3u8Urls.length > 0) {
        m3u8Urls.forEach((url, index) => {
          const channelName = `${match.title}-线路${index + 1}`;
          m3uContent += `#EXTINF:-1 tvg-name="${channelName}" group-title="${groupName}",${channelName}\n${url}\n`;
          txtContent += `${channelName},${url}\n`;
        });
      }

      await page.close();
    }

    await browser.close();

    fs.writeFileSync(m3uPath, m3uContent, 'utf-8');
    fs.writeFileSync(txtPath, txtContent, 'utf-8');
    logger.log('[完成] 成功生成 live.m3u 和 live.txt。');

    return { updated: true, matches: liveMatches.length };
  } catch (error) {
    logger.error('[错误] 异常:', error);
    throw error;
  }
}

if (require.main === module) {
  runExtraction().catch(() => process.exit(1));
}

module.exports = { runExtraction };
