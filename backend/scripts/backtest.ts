// 历史回测: 2018 + 2022 世界杯
// 核心发现验证: "最大Edge" vs "最大概率"投注策略
import fs from 'fs';
import path from 'path';

// ---- 模型核心 ----

function eloProb(eloA: number, eloB: number) {
  const HOME_ADV = 100;
  const DRAW_BASE = 0.265;
  const DRAW_SIGMA = 400;
  const diff = (eloA + HOME_ADV) - eloB;
  const p = 1 / (1 + Math.pow(10, -diff / 400));
  const q = 1 / (1 + Math.pow(10, diff / 400));
  const d = DRAW_BASE * Math.exp(-(diff * diff) / (2 * DRAW_SIGMA * DRAW_SIGMA));
  const s = p + d + q;
  return { home: p / s, draw: d / s, away: q / s };
}

function expectedGoals(eloA: number, eloB: number) {
  const HOME_ADV = 1.6319;
  const sA = Math.exp((eloA - 1500) / 800);
  const sB = Math.exp((eloB - 1500) / 800);
  return {
    home: Math.max(0.2, Math.min(5.0, HOME_ADV * sA / Math.sqrt(sB))),
    away: Math.max(0.2, Math.min(5.0, sB / Math.sqrt(sA))),
  };
}

function factorial(n: number): number { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function poiss(lambda: number, k: number) { return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k); }

function scoreProbs(homeXG: number, awayXG: number) {
  let home = 0, draw = 0, away = 0;
  const scores: { score: string; prob: number }[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = 0; j <= 6; j++) {
      const p = poiss(homeXG, i) * poiss(awayXG, j);
      scores.push({ score: `${i}-${j}`, prob: p });
      if (i > j) home += p; else if (i === j) draw += p; else away += p;
    }
  }
  scores.sort((a, b) => b.prob - a.prob);
  return { scores, home, draw, away };
}

function fuse(p: { home: number; draw: number; away: number }, e: { home: number; draw: number; away: number }) {
  const pw = 0.25, ew = 0.45, u = 0.30;
  return {
    home: pw * p.home + ew * e.home + u * e.home,
    draw: pw * p.draw + ew * e.draw + u * e.draw,
    away: pw * p.away + ew * e.away + u * e.away,
  };
}

// ---- 市场赔率：Elo K=16(慢) + 12% margin + 热门偏差 ----
const MARGIN = 0.12;
const FL_BIAS = 0.03;

function marketOdds(eloProb: { home: number; draw: number; away: number }) {
  const maxP = Math.max(eloProb.home, eloProb.draw, eloProb.away);
  const adj = 1 + MARGIN;
  function implied(p: number) {
    const bias = p >= maxP - 0.01 ? FL_BIAS : 0;
    return Math.max(0.01, p / adj - bias);
  }
  const mi_h = implied(eloProb.home), mi_d = implied(eloProb.draw), mi_a = implied(eloProb.away);
  return {
    odds: { home: 1/mi_h, draw: 1/mi_d, away: 1/mi_a },
    implied: { home: mi_h, draw: mi_d, away: mi_a },
  };
}

function updateElo(elo: Map<string, number>, a: string, b: string, actual: string, K: number) {
  const rA = elo.get(a) || 1500, rB = elo.get(b) || 1500;
  const expA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  const sA = actual === 'home' ? 1 : actual === 'draw' ? 0.5 : 0;
  elo.set(a, rA + K * (sA - expA));
  elo.set(b, rB + K * ((1 - sA) - (1 - expA)));
}

// ---- 数据 ----

interface CsvMatch { date: string; home: string; away: string; homeScore: number; awayScore: number; }

function loadWC(year: number): CsvMatch[] {
  const csv = fs.readFileSync(path.join(__dirname, '..', 'data', 'historical', 'results.csv'), 'utf-8');
  const lines = csv.split('\n');
  return lines.slice(1).map(l => l.split(',')).filter(p => p.length >= 7 && p[5] === 'FIFA World Cup' && p[0].startsWith(String(year)))
    .map(p => ({ date: p[0], home: p[1], away: p[2], homeScore: parseInt(p[3]), awayScore: parseInt(p[4]) }));
}

interface Outcome { key: string; prob: number; edge: number; odds: number; label: string; }

// ---- 回测单策略 ----

function runStrategy(elo: Map<string, number>, name: string, pickFn: (outcomes: Outcome[]) => Outcome | null, stakeFn: (pick: Outcome, br: number) => number) {
  let br = 500, bets = 0, wins = 0;
  const details: string[] = [];

  for (const year of [2018, 2022]) {
    for (const m of loadWC(year)) {
      const eA = elo.get(m.home) || 1500, eB = elo.get(m.away) || 1500;
      const fp = fuse(scoreProbs(expectedGoals(eA, eB).home, expectedGoals(eA, eB).away), eloProb(eA, eB));
      const mk = marketOdds(eloProb(eA, eB));
      const actual = m.homeScore > m.awayScore ? 'home' : m.homeScore < m.awayScore ? 'away' : 'draw';

      const outcomes: Outcome[] = [
        { key: 'home', prob: fp.home, edge: fp.home - mk.implied.home, odds: mk.odds.home, label: `${m.home}胜` },
        { key: 'draw', prob: fp.draw, edge: fp.draw - mk.implied.draw, odds: mk.odds.draw, label: '平局' },
        { key: 'away', prob: fp.away, edge: fp.away - mk.implied.away, odds: mk.odds.away, label: `${m.away}胜` },
      ];

      const pick = pickFn(outcomes);
      if (pick) {
        const stake = stakeFn(pick, br);
        if (stake >= 2 && br >= stake) {
          bets++;
          if (pick.key === actual) {
            br += stake * (pick.odds - 1);
            wins++;
            details.push(`✓ ${m.home} vs ${m.away} → ${pick.label} prob${(pick.prob*100).toFixed(0)}% edge${(pick.edge*100).toFixed(1)}% odds${pick.odds.toFixed(2)} ¥${stake}`);
          } else {
            br -= stake;
            details.push(`✗ ${m.home} vs ${m.away} → ${pick.label} prob${(pick.prob*100).toFixed(0)}% edge${(pick.edge*100).toFixed(1)}% odds${pick.odds.toFixed(2)} ¥${stake} | 实际:${actual}`);
          }
        }
      }

      updateElo(elo, m.home, m.away, actual, 64);
    }
  }

  const hitRate = bets > 0 ? (wins / bets * 100) : 0;
  const roi = ((br - 500) / 500 * 100);
  return { name, br, bets, wins, hitRate, roi, details };
}

// ---- 主流程 ----

console.log('══════════════════════════════════════════════');
console.log('  策略核心对比: 最大概率 vs 最大Edge');
console.log('  市场: Elo K=16 + 12% margin + 热门偏差');
console.log('  模型: Elo K=64 + Poisson 融合');
console.log('══════════════════════════════════════════════\n');

const baseElos: Record<string, number> = {
  'Germany': 2050, 'Brazil': 2080, 'France': 1980, 'Spain': 2040, 'Argentina': 2000,
  'England': 1940, 'Belgium': 1920, 'Portugal': 1960, 'Croatia': 1860, 'Uruguay': 1900,
  'Netherlands': 1920, 'Mexico': 1800, 'Colombia': 1880, 'Switzerland': 1820, 'Japan': 1740,
  'Denmark': 1800, 'Sweden': 1780, 'South Korea': 1720, 'Russia': 1680, 'Poland': 1780,
  'Senegal': 1700, 'Iran': 1680, 'Morocco': 1680, 'Serbia': 1740, 'Nigeria': 1680,
  'Australia': 1680, 'Egypt': 1660, 'Costa Rica': 1640, 'Iceland': 1660, 'Peru': 1700,
  'Tunisia': 1640, 'Panama': 1500, 'Saudi Arabia': 1520, 'Qatar': 1480, 'Ecuador': 1740,
  'Ghana': 1660, 'Cameroon': 1640, 'Canada': 1620, 'Wales': 1700, 'United States': 1700,
};

const strategies = [
  {
    name: 'A. 最大概率(prob>50%), 2%',
    pick: (outs: Outcome[]) => { const b = outs.reduce((a,b) => a.prob>b.prob?a:b); return b.prob > 0.50 ? b : null; },
    stake: (_: Outcome, br: number) => Math.round(br * 0.02),
  },
  {
    name: 'B. 最大Edge(edge>2%), 2.5%',
    pick: (outs: Outcome[]) => { const b = outs.reduce((a,b) => a.edge>b.edge?a:b); return b.edge > 0.02 ? b : null; },
    stake: (_: Outcome, br: number) => Math.round(br * 0.025),
  },
  {
    name: 'C. 最大Edge(edge>3%), 3%',
    pick: (outs: Outcome[]) => { const b = outs.reduce((a,b) => a.edge>b.edge?a:b); return b.edge > 0.03 ? b : null; },
    stake: (_: Outcome, br: number) => Math.round(br * 0.03),
  },
  {
    name: 'D. 最佳混合(prob>40% & edge>3%), 2%',
    pick: (outs: Outcome[]) => {
      const valid = outs.filter(o => o.prob > 0.40 && o.edge > 0.03);
      return valid.length > 0 ? valid.reduce((a,b) => a.edge > b.edge ? a : b) : null;
    },
    stake: (_: Outcome, br: number) => Math.round(br * 0.02),
  },
  {
    name: 'E. 平局专攻(edge>5%, prob>25%), 1.5%',
    pick: (outs: Outcome[]) => {
      const d = outs.find(o => o.key === 'draw');
      return d && d.edge > 0.05 && d.prob > 0.25 ? d : null;
    },
    stake: (_: Outcome, br: number) => Math.round(br * 0.015),
  },
  {
    name: 'F. 冷门专攻(edge>8%), 1.5%',
    pick: (outs: Outcome[]) => {
      const best = outs.reduce((a,b) => a.edge > b.edge ? a : b);
      return best.edge > 0.08 ? best : null;
    },
    stake: (_: Outcome, br: number) => Math.round(br * 0.015),
  },
];

const allResults: Array<{ name: string; br: number; bets: number; wins: number; hitRate: number; roi: number; details: string[] }> = [];

for (const s of strategies) {
  const elo = new Map<string, number>();
  for (const [k, v] of Object.entries(baseElos)) elo.set(k, v);
  const r = runStrategy(elo, s.name, s.pick, s.stake);
  allResults.push(r);
  console.log(`${s.name}: ${r.wins}/${r.bets} (${r.hitRate.toFixed(1)}%) | ¥500→¥${r.br.toFixed(0)} (${r.roi>=0?'+':''}${r.roi.toFixed(1)}%)`);
}

// 找出最佳策略，打印详情
const best = allResults.reduce((a, b) => (b.roi > a.roi ? b : a), allResults[0]);
console.log(`\n══════ 最佳策略: ${best.name} ══════`);
console.log(`投注 ${best.bets} 场, 命中 ${best.wins} 场 (${best.hitRate.toFixed(1)}%), 回报 ${best.roi>=0?'+':''}${best.roi.toFixed(1)}%`);
console.log('投注详情:');
for (const d of best.details) console.log('  ' + d);

// 汇总对比
console.log('\n══════════════════════════════════');
console.log('  汇总对比');
console.log('══════════════════════════════════');
console.log('策略                    | 投注  | 命中率 | 余额  | 回报');
console.log('───────────────────────|──────|───────|──────|─────');
for (const r of allResults) {
  const label = r.name.padEnd(30);
  const bets = `${r.wins}/${r.bets}`.padEnd(6);
  const hr = `${r.hitRate.toFixed(1)}%`.padEnd(5);
  const bal = `¥${r.br.toFixed(0)}`.padEnd(5);
  const roi = `${r.roi>=0?'+':''}${r.roi.toFixed(1)}%`;
  console.log(`${label} | ${bets} | ${hr} | ${bal} | ${roi}`);
}
