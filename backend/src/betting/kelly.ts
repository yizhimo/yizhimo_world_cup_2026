// Kelly 公式计算最优投注比例
// f* = (bp - q) / b
// b = 赔率净收益 (decimal_odds - 1)
// p = 模型预测概率
// q = 1 - p

export interface KellyResult {
  fraction: number;       // 建议投注比例 (0-1)
  isPositive: boolean;    // 是否有正期望值
  expectedValue: number;  // 期望收益率
}

// 完整 Kelly (谨慎模式: 未使用)
export function fullKelly(modelProb: number, odds: number): KellyResult {
  const b = odds - 1;
  const p = modelProb;
  const q = 1 - p;

  const ev = p * b - q; // 期望收益
  const fraction = ev / b;

  return {
    fraction,
    isPositive: fraction > 0,
    expectedValue: ev,
  };
}

// 分数 Kelly (推荐使用)
export function fractionalKelly(
  modelProb: number,
  odds: number,
  fraction = 0.25  // 1/4 Kelly
): KellyResult {
  const full = fullKelly(modelProb, odds);
  return {
    fraction: full.fraction * fraction,
    isPositive: full.isPositive,
    expectedValue: full.expectedValue,
  };
}

// 计算建议投注金额
export function recommendedStake(
  modelProb: number,
  odds: number,
  bankroll: number,
  kellyFraction: number,
  maxStakePct: number
): { stake: number; kellyFraction: number; reason: string } {
  const kelly = fractionalKelly(modelProb, odds, kellyFraction);

  if (!kelly.isPositive) {
    return { stake: 0, kellyFraction: 0, reason: '负期望值，不建议投注' };
  }

  const rawStake = bankroll * kelly.fraction;
  const maxStake = bankroll * maxStakePct;
  const stake = Math.min(rawStake, maxStake);

  // 至少投注 2 元
  const finalStake = Math.max(0, Math.round(stake * 100) / 100);

  if (finalStake < 2) {
    return { stake: 0, kellyFraction: kelly.fraction, reason: '计算金额小于最低投注额 2 元' };
  }

  return {
    stake: finalStake,
    kellyFraction: kelly.fraction,
    reason: `建议投注 ¥${finalStake.toFixed(0)} (${(kelly.fraction * 100).toFixed(1)}% 余额)`,
  };
}
