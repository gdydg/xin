const { chromium } = require('playwright');
const fs = require('fs');


async function fetchJsonWithRetry(url, { retries = 3, timeoutMs = 10000, logger = console } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      logger.log(`[重试] 请求失败，${attempt}/${retries}，url=${url}，原因=${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
}

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
    const menuData = await fetchJsonWithRetry(mainMenuUrl, { retries: 3, timeoutMs: 10000, logger });

    const todayMatchInfo = menuData.retData.match.find((m) => m.day === todayStr);
    if (!todayMatchInfo || !todayMatchInfo.matchListUrl) {
      logger.log(`[提示] 未在主菜单中找到 ${todayStr} 的赛事列表。`);
      fs.writeFileSync(m3uPath, m3uContent, 'utf-8');
      fs.writeFileSync(txtPath, txtContent, 'utf-8');
      return { updated: true, matches: 0 };
    }

    const listData = await fetchJsonWithRetry(todayMatchInfo.matchListUrl, { retries: 4, timeoutMs: 12000, logger });

    const nowSec = Math.floor(Date.now() / 1000);
    const lookbackSec = 6 * 60 * 60;
    const windowStartSec = nowSec - lookbackSec;

    const recentMatchesMap = new Map();
    if (listData.retData && Array.isArray(listData.retData.match)) {
      listData.retData.match.forEach((m) => {
        const matchBaseInfo = m.matchBaseInfo || {};
        const commonBaseInfo = m.commonBaseInfo || {};

        const startTimeStampRaw =
          matchBaseInfo.matchRoomStartTimeStamp || matchBaseInfo.startTimeStamp || 0;
        const startTimeStamp = Number(startTimeStampRaw);
        if (!Number.isFinite(startTimeStamp) || startTimeStamp <= 0) {
          return;
        }

        const inWindow = startTimeStamp >= windowStartSec && startTimeStamp <= nowSec;
        if (!inWindow) {
          return;
        }

        const matchId = String(matchBaseInfo.matchId || commonBaseInfo.key || '').trim();
        if (!matchId) {
          return;
        }

        recentMatchesMap.set(matchId, {
          id: matchId,
          title: matchBaseInfo.title || `赛事-${matchId}`,
          startTimeStamp
        });
      });
    }

    const recentMatches = Array.from(recentMatchesMap.values()).sort((a, b) => b.startTimeStamp - a.startTimeStamp);

    if (recentMatches.length === 0) {
      logger.log('[提示] 当前没有“当前时间前 6 小时内开赛”的比赛。');
      fs.writeFileSync(m3uPath, m3uContent, 'utf-8');
      fs.writeFileSync(txtPath, txtContent, 'utf-8');
      return { updated: true, matches: 0 };
    }

    logger.log(`[分析完毕] 共找到 ${recentMatches.length} 场“当前时间前 6 小时内开赛”的比赛。`);
    logger.log(`[抓取窗口] ${windowStartSec} ~ ${nowSec} (unix seconds)`);
    logger.log(`[matchId] ${recentMatches.map((m) => m.id).join(', ')}`);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    for (const match of recentMatches) {
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

    return { updated: true, matches: recentMatches.length };
  } catch (error) {
    logger.error('[错误] 异常:', error);
    throw error;
  }
}

if (require.main === module) {
  runExtraction().catch(() => process.exit(1));
}

module.exports = { runExtraction };
