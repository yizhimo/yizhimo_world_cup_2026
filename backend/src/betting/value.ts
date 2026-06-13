// 价值投注检测
// 价值 = 模型概率 − 赔率隐含概率
// 当价值 > 阈值时标记为"价值投注"

export interface ValueResult {
  modelProb: number;          // 模型概率
  impliedProb: number;        // 赔率隐含概率（去 margin 后）
  valueEdge: number;          // 价值优势
  isValue: boolean;           // 是否价值投注
  threshold: number;          // 使用的阈值
}

// 去除博彩 margin (overround)，用乘法归一化
export function removeMargin(odds: { home: number; draw: number; away: number }): {
  home: number; draw: number; away: number; margin: number;
} {
  const overround = 1 / odds.home + 1 / odds.draw + 1 / odds.away;
  const margin = overround - 1;

  return {
    home: (1 / odds.home) / overround,
    draw: (1 / odds.draw) / overround,
    away: (1 / odds.away) / overround,
    margin: Math.round(margin * 10000) / 100,
  };
}

// 单一结果的价值检测
export function detectValue(
  modelProb: number,
  impliedProb: number,
  threshold = 0.05
): ValueResult {
  const valueEdge = modelProb - impliedProb;

  return {
    modelProb: Math.round(modelProb * 10000) / 10000,
    impliedProb: Math.round(impliedProb * 10000) / 10000,
    valueEdge: Math.round(valueEdge * 10000) / 10000,
    isValue: valueEdge > threshold,
    threshold,
  };
}

// 全面价值分析 (胜平负三项)
export function analyzeMatchValue(
  modelProbs: { home: number; draw: number; away: number },
  odds: { home: number; draw: number; away: number },
  threshold = 0.05
): {
  home: ValueResult;
  draw: ValueResult;
  away: ValueResult;
  margin: number;
  recommended: 'home' | 'draw' | 'away' | 'skip';
} {
  const implied = removeMargin(odds);

  const home = detectValue(modelProbs.home, implied.home, threshold);
  const draw = detectValue(modelProbs.draw, implied.draw, threshold);
  const away = detectValue(modelProbs.away, implied.away, threshold);

  // 推荐价值最高的结果
  const results = [
    { outcome: 'home' as const, value: home },
    { outcome: 'draw' as const, value: draw },
    { outcome: 'away' as const, value: away },
  ];

  const best = results.reduce((a, b) =>
    a.value.valueEdge > b.value.valueEdge ? a : b
  );

  return {
    home,
    draw,
    away,
    margin: implied.margin,
    recommended: best.value.isValue ? best.outcome : 'skip',
  };
}
