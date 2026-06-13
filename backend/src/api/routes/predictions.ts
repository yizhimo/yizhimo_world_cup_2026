// 预测相关 API
import { Router } from 'express';
import { getDb } from '../../db/schema';
import { generatePrediction, savePrediction } from '../../models/predictor';

export const predictionsRouter = Router();

// 获取所有预测
predictionsRouter.get('/', (_req, res) => {
  const db = getDb();
  const predictions = db.all(`
    SELECT p.*, m.team_a, m.team_b, m.kickoff_time, m.status as match_status
    FROM predictions p
    JOIN matches m ON p.match_id = m.match_id
    ORDER BY m.kickoff_time ASC
  `);
  res.json({ data: predictions });
});

// 获取单场预测
predictionsRouter.get('/:matchId', (req, res) => {
  const db = getDb();
  const pred = db.get(
    'SELECT * FROM predictions WHERE match_id = ?', req.params.matchId
  );
  if (!pred) return res.json({ data: null, message: '尚未生成预测' });
  res.json({ data: pred });
});

// 生成/刷新单场预测
predictionsRouter.post('/generate/:matchId', (req, res) => {
  const db = getDb();
  const match = db.get(
    'SELECT * FROM matches WHERE match_id = ?', req.params.matchId
  ) as { match_id: string; team_a: string; team_b: string } | undefined;

  if (!match) return res.status(404).json({ error: '比赛不存在' });

  const prediction = generatePrediction(match.match_id, match.team_a, match.team_b);
  savePrediction(prediction);

  res.json({ data: prediction });
});

// 批量生成所有预测
predictionsRouter.post('/generate-all', (_req, res) => {
  const db = getDb();
  const matches = db.all(
    "SELECT match_id, team_a, team_b FROM matches WHERE status = 'upcoming'"
  ) as Array<{ match_id: string; team_a: string; team_b: string }>;

  const results = matches.map(m => {
    const pred = generatePrediction(m.match_id, m.team_a, m.team_b);
    savePrediction(pred);
    return pred;
  });

  res.json({ data: results, message: `生成了 ${results.length} 场预测` });
});

// 获取投注建议
predictionsRouter.get('/:matchId/advice', (req, res) => {
  const db = getDb();
  const match = db.get(
    'SELECT * FROM matches WHERE match_id = ?', req.params.matchId
  ) as { match_id: string; team_a: string; team_b: string } | undefined;

  if (!match) return res.status(404).json({ error: '比赛不存在' });

  // 获取赔率
  const oddsRows = db.all(
    'SELECT source, home_odds, draw_odds, away_odds FROM odds WHERE match_id = ? ORDER BY fetched_at DESC',
    req.params.matchId
  );

  const oddsSources = oddsRows.map((r: any) => ({
    source: r.source,
    home: r.home_odds,
    draw: r.draw_odds,
    away: r.away_odds,
  }));

  const { generateAdvice } = require('../../betting/strategy');
  const advice = generateAdvice(
    match.match_id,
    match.team_a,
    match.team_b,
    oddsSources
  );

  res.json({ data: advice });
});
