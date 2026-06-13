// 风险评估模块
import { getDb } from '../db/schema';

export interface RiskReport {
  lossStreak: number;
  totalBets: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  avgStake: number;
  maxDrawdown: number;
  currentDrawdown: number;
  status: 'normal' | 'caution' | 'danger' | 'stop';
  recommendations: string[];
}

export function assessRisk(): RiskReport {
  const db = getDb();

  // 合并 bets + personal_bets
  const bets = db.all<{
    result: string; stake: number; payout: number; balance_after: number;
  }>("SELECT result, stake, payout, balance_after FROM bets WHERE result != 'pending' ORDER BY created_at ASC");
  const personalBets = db.all<{
    result: string; stake: number; payout: number; balance_after: number;
  }>("SELECT result, stake, COALESCE(payout, 0) as payout, COALESCE(balance_after, 0) as balance_after FROM personal_bets WHERE result != 'pending' ORDER BY created_at ASC");

  const allBets = [...bets, ...personalBets].sort((a, b) => {
    // 按 balance_after 排序模拟时间顺序 (bets 表有 created_at 但 personal_bets 通过 balance_after 推断)
    return (a.balance_after || 0) - (b.balance_after || 0);
  });

  const recommendations: string[] = [];

  // 连亏计算 (基于合并后的投注)
  let lossStreak = 0;
  for (let i = allBets.length - 1; i >= 0; i--) {
    if (allBets[i].result === 'loss') lossStreak++;
    else break;
  }

  // 基本统计
  const totalBets = allBets.length;
  const wins = allBets.filter(b => b.result === 'win').length;
  const losses = allBets.filter(b => b.result === 'loss').length;
  const pushes = allBets.filter(b => b.result === 'push').length;
  const winRate = totalBets > 0 ? wins / totalBets : 0;

  const totalStake = allBets.reduce((s, b) => s + b.stake, 0);
  const avgStake = totalBets > 0 ? totalStake / totalBets : 0;

  // 最大回撤 — 从投注/结算事件重建资金曲线
  const initialBankroll = parseFloat(
    (db.get<{ value: string }>("SELECT value FROM strategy_config WHERE key = 'initial_bankroll'")?.value) || '200'
  );

  let peak = initialBankroll;
  let maxDrawdown = 0;
  let currentDrawdown = 0;

  if (personalBets.length > 0) {
    // 重建完整时间线: 下注(扣stake) + 结算(加payout)
    type TimelineEvent = { time: string; amount: number };
    const timeline: TimelineEvent[] = [];
    for (const b of personalBets) {
      // 从 created_at 推算出下注事件 (personal_bets 没有单独记录下注时间, 用 created_at)
      timeline.push({ time: b.stake > 0 ? 'created' : '', amount: -Math.abs(b.stake) });
      // 结算事件
      if (b.payout !== undefined && b.payout > 0) {
        // 需要 settled_at, 但 personalBets 查询中没有 settled_at 字段
        // 用 balance_after 从小到大推断顺序
        timeline.push({ time: 'settled', amount: b.payout });
      }
    }
    // 结算金额应最后加回 (简化: 先处理所有扣款, 再处理所有回款)
    const withdrawals = timeline.filter(e => e.amount < 0).reduce((s, e) => s + Math.abs(e.amount), 0);
    const totalStaked = personalBets.reduce((s, b) => s + Math.abs(b.stake), 0);

    // 简化计算: 最低点 = initial - totalStaked (所有投注金被占用后, 结算前)
    const trough = initialBankroll - totalStaked;
    if (trough < peak) {
      const drawdown = (peak - trough) / peak;
      maxDrawdown = drawdown;
    }

    // 当前回撤: 从历史峰值到当前余额
    // 如果当前在盈利, drawdown = 0
    const currentBalance = personalBets.length > 0 && personalBets[0].balance_after > 0
      ? personalBets[personalBets.length - 1].balance_after || initialBankroll
      : initialBankroll;
    const finalPeak = Math.max(initialBankroll, currentBalance);
    currentDrawdown = (finalPeak - currentBalance) / finalPeak;
  } else {
    // 回退到 bankroll_history
    const history = db.all<{ balance: number }>(
      'SELECT balance FROM bankroll_history ORDER BY created_at ASC'
    );
    for (const h of history) {
      peak = Math.max(peak, h.balance);
      const drawdown = (peak - h.balance) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      currentDrawdown = drawdown;
    }
  }

  // 状态判定
  let status: RiskReport['status'] = 'normal';
  if (lossStreak >= 5 || currentDrawdown > 0.40) {
    status = 'stop';
    recommendations.push('连亏 5 次或回撤超过 40%，建议暂停投注');
  } else if (lossStreak >= 3 || currentDrawdown > 0.25) {
    status = 'danger';
    recommendations.push('已连亏 3 次或回撤超过 25%，已自动降级策略');
  } else if (lossStreak >= 2 || currentDrawdown > 0.15) {
    status = 'caution';
    recommendations.push('注意回撤趋势，建议减小投注额');
  }

  if (winRate < 0.35 && totalBets > 10) {
    recommendations.push('命中率低于 35%，请检查预测模型');
  }

  return {
    lossStreak, totalBets, wins, losses, pushes,
    winRate: Math.round(winRate * 10000) / 10000,
    avgStake: Math.round(avgStake * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 10000,
    currentDrawdown: Math.round(currentDrawdown * 10000) / 10000,
    status, recommendations,
  };
}
