// 赔率管理 API
import { Router } from 'express';
import { getDb } from '../../db/schema';
import { saveManualOdds, getOddsForMatch, ManualOddsInput, batchSaveOdds } from '../../data/odds-input';
import { runScraping } from '../../data/scraper';
import { runFullUpdate, getSchedulerStatus } from '../../data/scheduler';
import { generateAdvice } from '../../betting/strategy';

export const oddsRouter = Router();

// 获取所有赔率
oddsRouter.get('/', (req, res) => {
  const db = getDb();
  const { matchId, source } = req.query;

  let sql = 'SELECT * FROM odds WHERE 1=1';
  const params: unknown[] = [];

  if (matchId) { sql += ' AND match_id = ?'; params.push(matchId); }
  if (source) { sql += ' AND source = ?'; params.push(source); }

  sql += ' ORDER BY fetched_at DESC LIMIT 200';

  const odds = db.all(sql, ...params);
  res.json({ data: odds });
});

// 手动输入赔率
oddsRouter.post('/', (req, res) => {
  try {
    const input: ManualOddsInput = req.body;
    if (!input.matchId || !input.homeOdds || !input.drawOdds || !input.awayOdds) {
      return res.status(400).json({ error: '缺少必要字段: matchId, homeOdds, drawOdds, awayOdds' });
    }
    saveManualOdds(input);
    res.status(201).json({ data: input, message: '赔率已保存' });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// 批量输入赔率
oddsRouter.post('/batch', (req, res) => {
  try {
    const { inputs } = req.body;
    const result = batchSaveOdds(inputs);
    res.json({ data: result });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// 获取某场比赛所有赔率源
oddsRouter.get('/match/:matchId', (req, res) => {
  const odds = getOddsForMatch(req.params.matchId);
  res.json({ data: odds });
});

// 触发爬虫
oddsRouter.post('/scrape', async (_req, res) => {
  try {
    const count = await runScraping();
    res.json({ message: '爬取完成', count });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// 完整更新流程 (赔率 → 预测 → 建议)
oddsRouter.post('/full-update', async (_req, res) => {
  try {
    const result = await runFullUpdate();
    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// API 使用额度
oddsRouter.get('/api-usage', (_req, res) => {
  try {
    const db = getDb();
    const remaining = db.get<{ value: string }>(
      "SELECT value FROM strategy_config WHERE key = 'api_requests_remaining'"
    );
    const used = db.get<{ value: string }>(
      "SELECT value FROM strategy_config WHERE key = 'api_requests_used'"
    );
    const updated = db.get<{ value: string }>(
      "SELECT value FROM strategy_config WHERE key = 'api_requests_updated'"
    );
    res.json({
      data: {
        requestsRemaining: parseInt(remaining?.value || '0', 10),
        requestsUsed: parseInt(used?.value || '0', 10),
        lastUpdated: updated?.value ? parseInt(updated.value, 10) : null,
        monthlyLimit: 500,
      },
    });
  } catch {
    res.json({ data: { requestsRemaining: 0, requestsUsed: 0, lastUpdated: null, monthlyLimit: 500 } });
  }
});

// 调度器状态 (是否运行、自动更新开关)
oddsRouter.get('/scheduler-status', (_req, res) => {
  const status = getSchedulerStatus();
  res.json({ data: status });
});

// 切换自动更新开关
oddsRouter.post('/toggle-auto-update', (req, res) => {
  const db = getDb();
  const currentRow = db.get<{ value: string }>(
    "SELECT value FROM strategy_config WHERE key = 'auto_update_enabled'"
  );
  const newValue = currentRow?.value === 'true' ? 'false' : 'true';
  db.run(
    "UPDATE strategy_config SET value = ?, updated_at = datetime('now') WHERE key = 'auto_update_enabled'",
    newValue
  );
  const label = newValue === 'true' ? '开启' : '关闭';
  res.json({ data: { autoUpdateEnabled: newValue === 'true' }, message: `自动更新已${label}` });
});

// 获取投注建议
oddsRouter.get('/advice', (req, res) => {
  try {
    const db = getDb();
    const { matchId } = req.query;

    let matches: Array<{ match_id: string; team_a: string; team_b: string }>;
    if (matchId) {
      matches = db.all(
        "SELECT match_id, team_a, team_b FROM matches WHERE match_id = ?",
        matchId as string
      );
    } else {
      matches = db.all(
        "SELECT match_id, team_a, team_b FROM matches WHERE status = 'upcoming' ORDER BY kickoff_time ASC LIMIT 30"
      );
    }

    const adviceList = [];
    for (const m of matches) {
      const oddsRows = db.all<{ source: string; home_odds: number; draw_odds: number; away_odds: number }>(
        'SELECT source, home_odds, draw_odds, away_odds FROM odds WHERE match_id = ? ORDER BY fetched_at DESC',
        m.match_id
      );

      if (oddsRows.length === 0) continue;

      const sourceMap = new Map<string, { source: string; home: number; draw: number; away: number }>();
      for (const row of oddsRows) {
        if (!sourceMap.has(row.source)) {
          sourceMap.set(row.source, {
            source: row.source,
            home: row.home_odds,
            draw: row.draw_odds,
            away: row.away_odds,
          });
        }
      }

      const oddsSources = Array.from(sourceMap.values());
      const advice = generateAdvice(m.match_id, m.team_a, m.team_b, oddsSources);
      adviceList.push(advice);
    }

    // 排序: 有价值投注的排在前面
    adviceList.sort((a, b) => {
      if (a.recommendation.action === 'bet' && b.recommendation.action !== 'bet') return -1;
      if (a.recommendation.action !== 'bet' && b.recommendation.action === 'bet') return 1;
      return b.recommendation.stake - a.recommendation.stake;
    });

    res.json({ data: adviceList });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
