// 综合投注建议引擎 — 多赔率源分析
import { predictMatch as poissonPredict } from '../models/poisson';
import { predictMatch as eloPredict } from '../models/elo';
import { analyzeMatchValue, removeMargin } from './value';
import { recommendedStake } from './kelly';
import { getBankrollState } from './bankroll';
import { assessRisk } from './risk';

export interface OddsSource {
  source: string;
  home: number;
  draw: number;
  away: number;
  scoreOdds?: Record<string, number>;  // "2-1": 8.5
}

export interface BettingAdvice {
  matchId: string;
  teamA: string;
  teamB: string;
  // 各模型概率
  poisson: { home: number; draw: number; away: number };
  elo: { home: number; draw: number; away: number };
  final: { home: number; draw: number; away: number };
  // 赔率源分析
  oddsAnalysis: OddsSourceAnalysis[];
  // 综合建议
  recommendation: {
    action: 'bet' | 'skip' | 'wait';
    outcome: string;
    bestOdds: number;
    bestSource: string;
    stake: number;
    reason: string;
  };
  // 风险提示
  riskWarnings: string[];
}

interface OddsSourceAnalysis {
  source: string;
  margin: number;
  implied: { home: number; draw: number; away: number };
  value: {
    home: { valueEdge: number; isValue: boolean };
    draw: { valueEdge: number; isValue: boolean };
    away: { valueEdge: number; isValue: boolean };
  };
  recommendation: 'home' | 'draw' | 'away' | 'skip';
}

// 综合投注建议
export function generateAdvice(
  matchId: string,
  teamA: string,
  teamB: string,
  oddsSources: OddsSource[],
  poissonWeight = 0.50,
  eloWeight = 0.25,
  marketWeight = 0.25
): BettingAdvice {
  // 各模型预测
  const poisson = poissonPredict(teamA, teamB, true);
  const elo = eloPredict(teamA, teamB, true);

  // 用最低 margin 的赔率源作为市场共识
  const bestSource = oddsSources.reduce((best, s) => {
    const { margin: mBest } = removeMargin(best);
    const { margin: mCurr } = removeMargin(s);
    return mCurr < mBest ? s : best;
  });
  const marketImplied = removeMargin(bestSource);

  // 模型融合
  const final = {
    home: poisson.homeProb * poissonWeight + elo.homeProb * eloWeight + marketImplied.home * marketWeight,
    draw: poisson.drawProb * poissonWeight + elo.drawProb * eloWeight + marketImplied.draw * marketWeight,
    away: poisson.awayProb * poissonWeight + elo.awayProb * eloWeight + marketImplied.away * marketWeight,
  };

  // 各赔率源分析
  const bankroll = getBankrollState();
  const oddsAnalysis: OddsSourceAnalysis[] = oddsSources.map(source => {
    const valueResult = analyzeMatchValue(final, source, bankroll.valueThreshold);
    return {
      source: source.source,
      margin: valueResult.margin,
      implied: removeMargin(source),
      value: {
        home: valueResult.home,
        draw: valueResult.draw,
        away: valueResult.away,
      },
      recommendation: valueResult.recommended,
    };
  });

  // 找最佳赔率
  const outcomes = ['home', 'draw', 'away'] as const;
  let bestOutcome: string = 'skip';
  let bestOdds = 0;
  let bestSourceName = '';

  for (const outcome of outcomes) {
    for (const source of oddsSources) {
      const odds = source[outcome];
      if (odds > bestOdds) {
        bestOdds = odds;
        bestSourceName = source.source;
        bestOutcome = outcome;
      }
    }
  }

  // 价值检测
  const outcomeProb = final[bestOutcome as keyof typeof final];
  const stakeResult = recommendedStake(
    outcomeProb,
    bestOdds,
    bankroll.currentBankroll,
    bankroll.kellyFraction,
    bankroll.maxStakePct
  );

  // 风险警告
  const riskWarnings: string[] = [];
  const risk = assessRisk();
  if (risk.status === 'danger' || risk.status === 'stop') {
    riskWarnings.push(`风险状态: ${risk.status}，连亏 ${risk.lossStreak} 次`);
  }
  if (bestOdds < 1.3) {
    riskWarnings.push('赔率过低 (< 1.3)，性价比不高');
  }

  const hasValue = oddsAnalysis.some(a => a.recommendation !== 'skip');

  return {
    matchId,
    teamA,
    teamB,
    poisson: { home: poisson.homeProb, draw: poisson.drawProb, away: poisson.awayProb },
    elo: { home: elo.homeProb, draw: elo.drawProb, away: elo.awayProb },
    final,
    oddsAnalysis,
    recommendation: {
      action: hasValue && stakeResult.stake >= 2 ? 'bet' : 'skip',
      outcome: bestOutcome,
      bestOdds,
      bestSource: bestSourceName,
      stake: stakeResult.stake,
      reason: hasValue ? stakeResult.reason : '无正向价值或赔率不足，建议观望',
    },
    riskWarnings,
  };
}
