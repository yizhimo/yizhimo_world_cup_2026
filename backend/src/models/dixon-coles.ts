// Dixon-Coles 低分依赖修正模块
// 扩展 Poisson 模型，修正 0-0, 1-0, 0-1, 1-1 的概率偏差
import { predictMatch as poissonPredict, expectedGoals } from './poisson';

// 修正参数 ρ 的估计 (基于历史数据)
// ρ < 0 → 低分结果出现频率低于独立 Poisson 预测
// 典型值: -0.04 (现代足球) 到 -0.13 (1990年代足球)
let rho = -0.08;  // 训练结果 (网格搜索最优, 2014-2024 数据)

export function setRho(value: number): void {
  rho = value;
}

export function getRho(): number {
  return rho;
}

// τ 修正因子
export function tauCorrection(
  x: number, y: number,
  lambdaX: number, lambdaY: number
): number {
  if (x === 0 && y === 0) return 1 - lambdaX * lambdaY * rho;
  if (x === 0 && y === 1) return 1 + lambdaX * rho;
  if (x === 1 && y === 0) return 1 + lambdaY * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// Dixon-Coles 完整预测 (在 Poisson 基础上加 τ 修正)
export function predictWithDC(
  teamA: string,
  teamB: string,
  homeAdvantage = true
): ReturnType<typeof poissonPredict> {
  // 复用 Poisson 预测（内部已包含 τ 修正，当 rho !== 0）
  return poissonPredict(teamA, teamB, homeAdvantage, rho);
}

// 从历史数据估计最优 ρ 值 (回测用)
export function estimateRho(
  historicalMatches: Array<{
    homeGoals: number; awayGoals: number;
    lambdaX: number; lambdaY: number;
  }>
): { optimalRho: number; improvement: number } {
  // 网格搜索最优 ρ
  const rhoValues = [-0.20, -0.15, -0.13, -0.10, -0.08, -0.06, -0.04, -0.02, 0];
  let bestRho = 0;
  let bestLogLik = -Infinity;

  for (const r of rhoValues) {
    let logLik = 0;
    for (const m of historicalMatches) {
      const tau = tauCorrection(m.homeGoals, m.awayGoals, m.lambdaX, m.lambdaY);
      // 简化的对数似然 (只比较 τ 部分)
      logLik += Math.log(Math.max(tau, 0.001));
    }
    if (logLik > bestLogLik) {
      bestLogLik = logLik;
      bestRho = r;
    }
  }

  // 与 rho=0 对比
  let logLikRho0 = 0;
  for (const m of historicalMatches) {
    logLikRho0 += Math.log(Math.max(tauCorrection(m.homeGoals, m.awayGoals, m.lambdaX, m.lambdaY), 0.001));
  }
  // 用 rho=0 重算
  const oldRho = rho;
  rho = 0;
  logLikRho0 = 0;
  for (const m of historicalMatches) {
    const tau = tauCorrection(m.homeGoals, m.awayGoals, m.lambdaX, m.lambdaY);
    logLikRho0 += Math.log(Math.max(tau, 0.001));
  }
  rho = oldRho;

  const improvement = bestLogLik - logLikRho0;

  return { optimalRho: bestRho, improvement };
}
