// 投注统计与报表
import { getDb } from '../db/schema';

export interface StatsOverview {
  initialBankroll: number;
  currentBankroll: number;
  profit: number;
  roi: number;
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  winRate: number;
  avgOdds: number;
  avgStake: number;
  totalStaked: number;
  bestWin: { matchId: string; profit: number };
  worstLoss: { matchId: string; loss: number };
}

export function getStatsOverview(): StatsOverview {
  const db = getDb();

  const configs = db.all<{ key: string; value: string }>('SELECT key, value FROM strategy_config');
  const configMap = new Map(configs.map(c => [c.key, c.value]));

  // 优先使用 personal_bankroll (用户实际使用的系统)，初始资金取 initial_bankroll
  const personalBankroll = parseFloat(configMap.get('personal_bankroll') ?? '0');
  const systemBankroll = parseFloat(configMap.get('current_bankroll') ?? '200');
  const current = personalBankroll > 0 ? personalBankroll : systemBankroll;
  const initial = parseFloat(configMap.get('initial_bankroll') ?? '200');

  // 合并 bets + personal_bets 数据
  const bets = db.all<{
    result: string; stake: number; odds: number; payout: number; match_id: string;
  }>('SELECT result, stake, odds, payout, match_id FROM bets');
  const personalBets = db.all<{
    result: string; stake: number; odds: number; payout: number; match_id: string;
  }>('SELECT result, stake, COALESCE(odds, 0) as odds, COALESCE(payout, 0) as payout, match_id FROM personal_bets');

  const allBets = [...bets, ...personalBets];

  const totalBets = allBets.length;
  const pending = allBets.filter(b => b.result === 'pending').length;
  const settled = allBets.filter(b => b.result !== 'pending');
  const wins = settled.filter(b => b.result === 'win').length;
  const losses = settled.filter(b => b.result === 'loss').length;
  const pushes = settled.filter(b => b.result === 'push').length;
  const winRate = settled.length > 0 ? wins / settled.length : 0;

  const totalStaked = allBets.reduce((s, b) => s + b.stake, 0);
  const avgStake = totalBets > 0 ? totalStaked / totalBets : 0;
  const avgOdds = totalBets > 0 ? allBets.filter(b => b.odds > 0).reduce((s, b) => s + b.odds, 0) / allBets.filter(b => b.odds > 0).length : 0;

  const profit = current - initial;
  const roi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;

  let bestWin = { matchId: '', profit: 0 };
  let worstLoss = { matchId: '', loss: 0 };

  for (const b of settled) {
    const pnl = (b.payout ?? 0) - b.stake;
    if (pnl > bestWin.profit) bestWin = { matchId: b.match_id, profit: pnl };
    if (pnl < worstLoss.loss) worstLoss = { matchId: b.match_id, loss: pnl };
  }

  return {
    initialBankroll: initial,
    currentBankroll: current,
    profit: Math.round(profit * 100) / 100,
    roi: Math.round(roi * 100) / 100,
    totalBets, wins, losses, pushes, pending,
    winRate: Math.round(winRate * 10000) / 10000,
    avgOdds: Math.round(avgOdds * 100) / 100,
    avgStake: Math.round(avgStake * 100) / 100,
    totalStaked: Math.round(totalStaked * 100) / 100,
    bestWin, worstLoss,
  };
}

export function getBankrollHistory(): { date: string; balance: number }[] {
  return getDb().all('SELECT created_at as date, balance FROM bankroll_history ORDER BY created_at ASC');
}

export function getStatsByType(): { betType: string; total: number; wins: number; roi: number }[] {
  return getDb().all(`
    SELECT bet_type as betType, COUNT(*) as total,
      SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as wins,
      ROUND((SUM(COALESCE(payout, 0)) - SUM(stake)) / SUM(stake) * 100, 2) as roi
    FROM bets WHERE result != 'pending'
    GROUP BY bet_type
  `);
}
