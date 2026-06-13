// 统计报表 API
import { Router } from 'express';
import { getDb } from '../../db/schema';
import { getStatsOverview, getBankrollHistory, getStatsByType } from '../../tracker/stats';
import { getBankrollState } from '../../betting/bankroll';
import { assessRisk } from '../../betting/risk';
import { getElo } from '../../models/elo';
import { getTeamParams } from '../../models/poisson';

export const statsRouter = Router();

// 投注统计概览
statsRouter.get('/overview', (_req, res) => {
  const stats = getStatsOverview();
  const risk = assessRisk();
  res.json({ data: { ...stats, risk } });
});

// 资金曲线
statsRouter.get('/bankroll-history', (_req, res) => {
  const history = getBankrollHistory();
  res.json({ data: history });
});

// 按玩法统计
statsRouter.get('/by-type', (_req, res) => {
  const stats = getStatsByType();
  res.json({ data: stats });
});

// 当前策略状态
statsRouter.get('/strategy', (_req, res) => {
  const state = getBankrollState();
  const risk = assessRisk();
  res.json({ data: { ...state, ...risk } });
});

// 球队 Elo 排名
statsRouter.get('/elo-ranking', (_req, res) => {
  const db = getDb();
  const teams = db.all('SELECT name, name_en, elo_rating, confederation FROM teams ORDER BY elo_rating DESC');
  res.json({ data: teams });
});

// 球队实力参数
statsRouter.get('/team-params', (_req, res) => {
  const db = getDb();
  const teams = db.all(
    'SELECT name, name_en, elo_rating, attack_strength, defense_strength FROM teams ORDER BY elo_rating DESC'
  );
  res.json({ data: teams });
});

// 策略配置 CRUD
statsRouter.get('/config', (_req, res) => {
  const db = getDb();
  const configs = db.all('SELECT key, value FROM strategy_config');
  const configMap: Record<string, string> = {};
  for (const c of configs as Array<{ key: string; value: string }>) {
    if (c.key === 'odds_api_key' && c.value && c.value !== 'YOUR_API_KEY_HERE' && c.value.length > 8) {
      configMap[c.key] = c.value.slice(0, 4) + '****' + c.value.slice(-4);
    } else {
      configMap[c.key] = c.value;
    }
  }
  res.json({ data: configMap });
});

statsRouter.put('/config', (req, res) => {
  const db = getDb();
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'odds_api_key' && value.includes('****')) continue;
    db.run(
      "UPDATE strategy_config SET value = ?, updated_at = datetime('now') WHERE key = ?",
      value, key
    );
  }
  res.json({ data: updates, message: '配置已更新' });
});
