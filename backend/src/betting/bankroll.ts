// 资金管理策略 — 根据当前余额动态调整
import { getDb } from '../db/schema';

export interface BankrollState {
  initialBankroll: number;
  currentBankroll: number;
  profit: number;
  profitPct: number;
  kellyFraction: number;
  valueThreshold: number;
  maxStakePct: number;
  strategyLevel: string;
}

// 获取当前资金状态
export function getBankrollState(): BankrollState {
  const db = getDb();

  const configs = db.all<{ key: string; value: string }>(
    'SELECT key, value FROM strategy_config'
  );
  const configMap = new Map(configs.map(c => [c.key, c.value]));

  const initial = parseFloat(configMap.get('initial_bankroll') ?? '200');
  const current = parseFloat(configMap.get('current_bankroll') ?? '200');
  const profit = current - initial;
  const profitPct = (profit / initial) * 100;

  // 从投注记录计算连亏
  const recentBets = db.all<{ result: string }>(
    "SELECT result FROM bets WHERE result != 'pending' ORDER BY created_at DESC LIMIT 10"
  );

  let lossStreak = 0;
  for (const r of recentBets) {
    if (r.result === 'loss') lossStreak++;
    else break;
  }

  const { kellyFraction, valueThreshold, maxStakePct, strategyLevel } =
    getDynamicStrategy(current, lossStreak);

  return {
    initialBankroll: initial,
    currentBankroll: current,
    profit,
    profitPct,
    kellyFraction,
    valueThreshold,
    maxStakePct,
    strategyLevel,
  };
}

// 动态策略调整
function getDynamicStrategy(balance: number, lossStreak: number): {
  kellyFraction: number; valueThreshold: number; maxStakePct: number; strategyLevel: string;
} {
  let levelPenalty = 0;
  if (lossStreak >= 5) levelPenalty = 3;
  else if (lossStreak >= 3) levelPenalty = 2;
  else if (lossStreak >= 2) levelPenalty = 1;

  const effectiveLevel = getBalanceLevel(balance) + levelPenalty;

  if (effectiveLevel >= 4) {
    return { kellyFraction: 1/16, valueThreshold: 0.15, maxStakePct: 0.05,
      strategyLevel: '生存模式 — 仅投价值 > 15% 的机会' };
  } else if (effectiveLevel >= 3) {
    return { kellyFraction: 1/12, valueThreshold: 0.10, maxStakePct: 0.10,
      strategyLevel: '极保守 — 1/12 Kelly' };
  } else if (effectiveLevel >= 2) {
    return { kellyFraction: 1/8, valueThreshold: 0.07, maxStakePct: 0.12,
      strategyLevel: '保守 — 1/8 Kelly' };
  } else if (effectiveLevel >= 1) {
    return { kellyFraction: 1/6, valueThreshold: 0.06, maxStakePct: 0.15,
      strategyLevel: '谨慎 — 1/6 Kelly' };
  } else {
    return { kellyFraction: 1/4, valueThreshold: 0.05, maxStakePct: 0.15,
      strategyLevel: '正常 — 1/4 Kelly' };
  }
}

function getBalanceLevel(balance: number): number {
  if (balance >= 200) return 0;
  if (balance >= 150) return 1;
  if (balance >= 100) return 2;
  return 3;
}

// 更新余额
export function updateBalance(amount: number, reason: string, betId?: number): number {
  const db = getDb();
  const state = getBankrollState();
  const newBalance = state.currentBankroll + amount;

  db.run(
    'INSERT INTO bankroll_history (balance, change, reason, bet_id) VALUES (?, ?, ?, ?)',
    newBalance, amount, reason, betId ?? null
  );

  db.run(
    "UPDATE strategy_config SET value = ?, updated_at = datetime('now') WHERE key = 'current_bankroll'",
    String(newBalance)
  );

  return newBalance;
}
