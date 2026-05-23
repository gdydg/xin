const express = require('express');
const path = require('path');
const { runExtraction } = require('./extract_m3u8');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const TRIGGER_TOKEN = process.env.TRIGGER_TOKEN;
const outputDir = process.cwd();

let running = false;
let lastRunAt = null;
let lastResult = null;

app.get('/healthz', (_, res) => {
  res.json({ ok: true, running, lastRunAt, lastResult });
});

app.post('/trigger', async (req, res) => {
  const token = req.header('x-trigger-token') || req.query.token;
  if (!TRIGGER_TOKEN || token !== TRIGGER_TOKEN) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  if (running) {
    return res.status(409).json({ ok: false, message: 'Extraction already running' });
  }

  running = true;
  try {
    const result = await runExtraction({ outputDir });
    lastRunAt = new Date().toISOString();
    lastResult = result;
    return res.json({ ok: true, ...result, lastRunAt });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message });
  } finally {
    running = false;
  }
});

app.get('/live.m3u', (_, res) => {
  res.sendFile(path.join(outputDir, 'live.m3u'));
});

app.get('/live.txt', (_, res) => {
  res.sendFile(path.join(outputDir, 'live.txt'));
});

app.listen(PORT, () => {
  console.log(`server running on :${PORT}`);
});
