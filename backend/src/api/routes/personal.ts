// 个人投注助手 API — ¥2000 预算管理
import { Router } from 'express';
import { getDb } from '../../db/schema';
import { predictMatch as poissonPredict } from '../../models/poisson';
import { predictMatch as eloPredict } from '../../models/elo';
import { generatePrediction } from '../../models/predictor';

export const personalRouter = Router();

const PERSONAL_BANKROLL_KEY = 'personal_bankroll';
const INITIAL_BANKROLL_KEY = 'initial_bankroll';
const DEFAULT_BANKROLL = 2000;

function getBankroll(): number {
  const db = getDb();
  const row = db.get<{ value: string }>(
    "SELECT value FROM strategy_config WHERE key = ?", PERSONAL_BANKROLL_KEY
  );
  if (!row) {
    db.run("INSERT OR REPLACE INTO strategy_config (key, value) VALUES (?, ?)",
      PERSONAL_BANKROLL_KEY, String(DEFAULT_BANKROLL));
    return DEFAULT_BANKROLL;
  }
  return parseFloat(row.value);
}

function setBankroll(amount: number): void {
  const db = getDb();
  db.run(
    "INSERT OR REPLACE INTO strategy_config (key, value) VALUES (?, ?)",
    PERSONAL_BANKROLL_KEY, String(Math.round(amount * 100) / 100)
  );
}

// 获取资金概况
personalRouter.get('/summary', (_req, res) => {
  const db = getDb();
  const bankroll = getBankroll();

  const bets = db.all(
    "SELECT * FROM personal_bets ORDER BY created_at DESC"
  ) as Array<Record<string, unknown>>;

  const settled = bets.filter(b => b.result !== 'pending');
  const pending = bets.filter(b => b.result === 'pending');
  const wins = settled.filter(b => b.result === 'win');
  const losses = settled.filter(b => b.result === 'loss');

  const totalStaked = bets.reduce((s, b) => s + (b.stake as number), 0);
  const totalReturned = settled.reduce((s, b) => s + ((b.payout as number) || 0), 0);
  const totalPnl = totalReturned - totalStaked;
  const pendingStake = pending.reduce((s, b) => s + (b.stake as number), 0);
  // bankroll 已在下注时扣减了待结算金额，无需重复扣除
  const available = bankroll;

  const initial = db.get<{ value: string }>(
    "SELECT value FROM strategy_config WHERE key = ?", INITIAL_BANKROLL_KEY
  );

  res.json({
    data: {
      bankroll,
      available,
      totalStaked,
      totalReturned,
      totalPnl,
      pendingStake,
      totalBets: bets.length,
      settled: settled.length,
      wins: wins.length,
      losses: losses.length,
      winRate: settled.length > 0 ? wins.length / settled.length : 0,
      goal: initial ? parseFloat(initial.value) : DEFAULT_BANKROLL,
      progress: bankroll - (initial ? parseFloat(initial.value) : DEFAULT_BANKROLL),
    },
  });
});

// 初始化: 重置资金、清空投注、回到第一轮
personalRouter.post('/init', (req, res) => {
  const db = getDb();
  const { amount } = req.body;
  const initAmount = parseFloat(amount) || DEFAULT_BANKROLL;

  db.run("DELETE FROM personal_bets");
  db.run("DELETE FROM strategy_config WHERE key IN ('personal_bankroll', 'active_round', 'initial_bankroll')");
  setBankroll(initAmount);
  db.run("INSERT OR REPLACE INTO strategy_config (key, value) VALUES (?, ?)",
    INITIAL_BANKROLL_KEY, String(initAmount));

  res.json({
    data: { bankroll: initAmount },
    message: `已初始化，起始资金 ¥${initAmount.toFixed(0)}`,
  });
});

// 获取投注历史
personalRouter.get('/', (_req, res) => {
  const db = getDb();
  const bets = db.all(
    "SELECT * FROM personal_bets ORDER BY created_at DESC LIMIT 50"
  );
  res.json({ data: bets });
});

// 获取投注建议 (基于当前资金)
// 百分比下注: 胜平负 2-4%, 比分 1-2%, 最低 ¥20/¥10
function calcStake(prob: number, odds: number, bankroll: number, lossStreak: number, isScore = false): number {
  // 估算赔率 (无真实赔率时用模型概率)
  const effOdds = odds > 1 ? odds : Math.max(1 / Math.max(prob, 0.01), 1.05);
  const implied = 1 / effOdds;
  const edge = prob - implied;

  let pct: number;
  if (isScore) {
    pct = prob > 0.08 ? 0.02 : prob > 0.04 ? 0.015 : 0.01;
  } else {
    if (edge > 0.10) pct = 0.04;
    else if (edge > 0.05) pct = 0.03;
    else if (edge > 0.02) pct = 0.025;
    else if (edge > 0) pct = 0.02;
    else pct = 0.015; // 无 edge 也给出最低建议
  }

  let stake = Math.round(bankroll * pct);
  if (lossStreak >= 3 && stake > 0) stake = Math.round(stake * 0.6);
  return Math.max(0, Math.min(stake, bankroll));
}

personalRouter.get('/advice', (req, res) => {
  const db = getDb();
  const bankroll = getBankroll();
  const targetDate = req.query.date as string | undefined;

  // 待结算的投注
  const pending = db.all(
    "SELECT match_id FROM personal_bets WHERE result = 'pending'"
  ) as Array<{ match_id: string }>;
  const pendingMatchIds = new Set(pending.map(p => p.match_id));

  // 连亏检测
  const recentBets = db.all(
    "SELECT result FROM personal_bets WHERE result != 'pending' ORDER BY created_at DESC LIMIT 10"
  ) as Array<{ result: string }>;
  let lossStreak = 0;
  for (const b of recentBets) {
    if (b.result === 'loss') lossStreak++;
    else break;
  }

  // 风险警告
  const riskWarnings: string[] = [];
  if (lossStreak >= 3) riskWarnings.push(`连续亏损 ${lossStreak} 场，建议减少投注金额`);

  // 获取全部 upcoming 比赛 (排除 TBD 淘汰赛)
  const allMatches = db.all(
    "SELECT match_id, team_a, team_b, kickoff_time FROM matches WHERE status = 'upcoming' AND team_a != 'TBD' AND team_b != 'TBD' ORDER BY kickoff_time ASC"
  ) as Array<{ match_id: string; team_a: string; team_b: string; kickoff_time: string }>;

  // 按日期分组所有比赛，获取日期列表
  const allDates = [...new Set(allMatches.map(m => m.kickoff_time.split('T')[0]))].sort();

  // 确定要展示的轮次日期
  // 1. 有 ?date= 参数 → 使用指定日期，并存入 active_round
  // 2. 有待结算投注 → 显示待结算投注所在的比赛日
  // 3. 有已存储的 active_round → 使用该日期
  // 4. 否则 → 显示最早未开始的比赛日
  let filterDate = targetDate || '';

  if (targetDate) {
    // 用户主动切换轮次，记住选择
    db.run("INSERT OR REPLACE INTO strategy_config (key, value) VALUES ('active_round', ?)", targetDate);
  }

  if (!filterDate && pending.length > 0) {
    const pendingDates = db.all(
      `SELECT DISTINCT date(m.kickoff_time) as d
       FROM matches m JOIN personal_bets b ON m.match_id = b.match_id
       WHERE b.result = 'pending'
       ORDER BY d ASC`
    ) as Array<{ d: string }>;
    filterDate = pendingDates[0]?.d || '';
  }

  if (!filterDate) {
    // 检查是否有存储的轮次
    const stored = db.get<{ value: string }>(
      "SELECT value FROM strategy_config WHERE key = 'active_round'"
    );
    if (stored?.value && allDates.includes(stored.value)) {
      filterDate = stored.value;
    }
  }

  if (!filterDate) {
    const firstMatch = db.get<{ d: string }>(
      "SELECT date(kickoff_time) as d FROM matches WHERE status = 'upcoming' ORDER BY kickoff_time ASC LIMIT 1"
    );
    filterDate = firstMatch?.d || '';
  }

  // 筛选当前轮次的比赛 + 计算下一轮日期
  const matches = allMatches.filter(m => m.kickoff_time.split('T')[0] === filterDate);
  const todayIdx = allDates.indexOf(filterDate);
  const nextDate = todayIdx >= 0 && todayIdx < allDates.length - 1 ? allDates[todayIdx + 1] : null;

  // 构建比赛数据
  const matchList = [];
  for (const m of matches) {
    const pred = generatePrediction(m.match_id, m.team_a, m.team_b);
    const poisson = poissonPredict(m.team_a, m.team_b, true);

    const oddsRow = db.get<{ home_odds: number; draw_odds: number; away_odds: number }>(
      "SELECT home_odds, draw_odds, away_odds FROM odds WHERE match_id = ? ORDER BY fetched_at DESC LIMIT 1",
      m.match_id
    );

    const calc = (key: 'home' | 'draw' | 'away') => {
      const prob = pred.final[key];
      const realOdds = oddsRow ? oddsRow[key + '_odds' as keyof typeof oddsRow] as number : 0;
      const effOdds = realOdds > 1 ? realOdds : Math.round((1 / Math.max(prob, 0.01)) * 100) / 100;
      const edge = realOdds > 1 ? prob - 1 / realOdds : 0;
      const stake = calcStake(prob, realOdds, bankroll, lossStreak);
      return {
        prob: Math.round(prob * 10000) / 10000,
        odds: effOdds,
        edge: Math.round(edge * 10000) / 10000,
        stake,
      };
    };

    const topScores = poisson.topScores.slice(0, 3).map(s => {
      const scoreProb = s.prob;
      const scoreOdds = 1 / scoreProb; // 估算赔率 (无真实比分赔率数据)
      const scoreStake = calcStake(scoreProb, scoreOdds, bankroll, lossStreak, true);
      return {
        score: s.score,
        prob: Math.round(scoreProb * 10000) / 100,
        odds: Math.round(scoreOdds * 100) / 100,
        stake: scoreStake,
      };
    });

    matchList.push({
      matchId: m.match_id,
      teamA: m.team_a,
      teamB: m.team_b,
      kickoffTime: m.kickoff_time,
      topScores,
      outcomes: {
        home: calc('home'),
        draw: calc('draw'),
        away: calc('away'),
      },
      canBet: !pendingMatchIds.has(m.match_id) && bankroll >= 2,
      alreadyBet: pendingMatchIds.has(m.match_id),
    });
  }

  const d = new Date(filterDate + 'T00:00:00');
  const label = d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' });

  res.json({
    data: {
      bankroll,
      riskWarnings,
      lossStreak,
      pendingCount: pending.length,
      currentRound: filterDate,
      roundLabel: label,
      nextRound: nextDate,
      matches: matchList,
    },
  });
});

// 下注
personalRouter.post('/', (req, res) => {
  const db = getDb();
  const { matchId, teamA, teamB, selection, stake, odds } = req.body;

  if (!matchId || !selection || !stake) {
    return res.status(400).json({ error: '缺少必要字段: matchId, selection, stake' });
  }

  const bankroll = getBankroll();
  if (stake > bankroll) {
    return res.status(400).json({ error: `资金不足！当前余额 ¥${bankroll.toFixed(0)}，投注 ¥${stake}` });
  }

  // 检查是否已对该比赛下注
  const existing = db.get(
    "SELECT id FROM personal_bets WHERE match_id = ? AND result = 'pending'",
    matchId
  );
  if (existing) {
    return res.status(400).json({ error: '该场比赛已有待结算投注' });
  }

  // 获取模型预测概率
  const pred = generatePrediction(matchId, teamA, teamB);
  const poisson = poissonPredict(teamA, teamB, true);

  const isScoreBet = selection.startsWith('score:');
  let betOdds = odds || null;

  // 比分投注: 如果没有传入赔率，从概率估算
  if (isScoreBet && !betOdds) {
    const scoreKey = selection.replace('score:', '');
    const scorePred = poisson.topScores.find(s => s.score === scoreKey);
    if (scorePred && scorePred.prob > 0) {
      betOdds = Math.round((1 / scorePred.prob) * 100) / 100;
    }
  }

  // 扣减资金
  const newBankroll = bankroll - stake;
  setBankroll(newBankroll);

  // 记录投注
  db.run(
    `INSERT INTO personal_bets (match_id, team_a, team_b, selection, stake, odds,
      model_home_prob, model_draw_prob, model_away_prob,
      score_prediction, balance_after)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    matchId, teamA, teamB, selection, stake, betOdds,
    pred.final.home, pred.final.draw, pred.final.away,
    JSON.stringify(poisson.topScores.slice(0, 3).map(s => ({ score: s.score, prob: s.prob }))),
    newBankroll
  );

  res.status(201).json({
    data: { matchId, selection, stake, newBankroll },
    message: `投注成功！${teamA} vs ${teamB}，${selection}，¥${stake}，剩余 ¥${newBankroll.toFixed(0)}`,
  });
});

// 结算投注 (用户输入实际中奖金额)
personalRouter.put('/:id/result', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { payout, result, actualScore, notes } = req.body;

  const bet = db.get<{ id: number; stake: number; result: string; match_id: string }>(
    "SELECT * FROM personal_bets WHERE id = ?", id
  );
  if (!bet) return res.status(404).json({ error: '投注记录不存在' });
  if (bet.result !== 'pending') return res.status(400).json({ error: '该投注已结算' });

  const bankroll = getBankroll();

  if (result === 'win') {
    const pnl = payout - bet.stake;
    const newBankroll = bankroll + payout;
    setBankroll(newBankroll);
    db.run(
      "UPDATE personal_bets SET result = 'win', payout = ?, balance_after = ?, actual_score = ?, notes = ?, settled_at = datetime('now') WHERE id = ?",
      payout, newBankroll, actualScore || null, notes || null, id
    );
    const pnlStr = pnl >= 0 ? `+¥${pnl.toFixed(2)}` : `-¥${Math.abs(pnl).toFixed(2)}`;
    res.json({
      data: { id, result: 'win', payout, pnl, newBankroll },
      message: `结算完成！派彩 ¥${payout.toFixed(2)}，净${pnl >= 0 ? '盈利' : '亏损'} ${pnlStr}，当前余额 ¥${newBankroll.toFixed(2)}`,
    });
  } else if (result === 'push') {
    const newBankroll = bankroll + bet.stake;
    setBankroll(newBankroll);
    db.run(
      "UPDATE personal_bets SET result = 'push', payout = ?, balance_after = ?, actual_score = ?, notes = ?, settled_at = datetime('now') WHERE id = ?",
      bet.stake, newBankroll, actualScore || null, notes || null, id
    );
    res.json({
      data: { id, result: 'push', newBankroll },
      message: `走水，退回 ¥${bet.stake.toFixed(2)}，当前余额 ¥${newBankroll.toFixed(2)}`,
    });
  } else {
    db.run(
      "UPDATE personal_bets SET result = 'loss', payout = 0, balance_after = ?, actual_score = ?, notes = ?, settled_at = datetime('now') WHERE id = ?",
      bankroll, actualScore || null, notes || null, id
    );
    res.json({
      data: { id, result: 'loss', newBankroll: bankroll },
      message: `未中奖，当前余额 ¥${bankroll.toFixed(2)}`,
    });
  }
});

// 删除投注 (仅限 pending 状态)
personalRouter.delete('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const bet = db.get<{ id: number; stake: number; result: string }>(
    "SELECT * FROM personal_bets WHERE id = ?", id
  );
  if (!bet) return res.status(404).json({ error: '投注记录不存在' });
  if (bet.result !== 'pending') return res.status(400).json({ error: '已结算的投注不可删除' });

  const bankroll = getBankroll();
  setBankroll(bankroll + bet.stake);
  db.run("DELETE FROM personal_bets WHERE id = ?", id);

  res.json({
    data: { id, newBankroll: bankroll + bet.stake },
    message: `已取消投注，退回 ¥${bet.stake}`,
  });
});

// 编辑投注 (修改派彩/结果)
personalRouter.put('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;
  const { payout, result } = req.body;

  const bet = db.get<{ id: number; stake: number; result: string; payout: number | null; match_id: string }>(
    "SELECT * FROM personal_bets WHERE id = ?", id
  );
  if (!bet) return res.status(404).json({ error: '投注记录不存在' });

  // 更新投注记录
  if (result !== undefined) {
    if (result === 'win' && payout !== undefined) {
      db.run(
        "UPDATE personal_bets SET payout = ?, result = 'win', settled_at = COALESCE(settled_at, datetime('now')) WHERE id = ?",
        payout, id
      );
    } else if (result === 'loss') {
      db.run(
        "UPDATE personal_bets SET payout = 0, result = 'loss', settled_at = COALESCE(settled_at, datetime('now')) WHERE id = ?",
        id
      );
    } else if (result === 'push') {
      db.run(
        "UPDATE personal_bets SET payout = ?, result = 'push', settled_at = COALESCE(settled_at, datetime('now')) WHERE id = ?",
        bet.stake, id
      );
    } else if (result === 'pending') {
      db.run(
        "UPDATE personal_bets SET payout = NULL, result = 'pending', settled_at = NULL, balance_after = NULL WHERE id = ?",
        id
      );
    }
  } else if (payout !== undefined && bet.result === 'win') {
    // 仅更新派彩金额
    db.run("UPDATE personal_bets SET payout = ? WHERE id = ?", payout, id);
  } else if (payout !== undefined) {
    db.run("UPDATE personal_bets SET payout = ? WHERE id = ?", payout, id);
  }

  // 重建所有投注的 balance_after，然后重新计算 bankroll
  const allBets = db.all<{
    id: number; stake: number; payout: number; result: string; created_at: string; settled_at: string;
  }>("SELECT id, stake, COALESCE(payout, 0) as payout, result, created_at, settled_at FROM personal_bets ORDER BY created_at ASC");

  // 获取 initial_bankroll
  const initial = parseFloat(
    (db.get<{ value: string }>("SELECT value FROM strategy_config WHERE key = 'initial_bankroll'")?.value) || '200'
  );

  // 重建时间线: 下注扣款 + 结算回款
  type Event = { betId: number; time: string; type: 'bet' | 'settle'; amount: number };
  const timeline: Event[] = [];
  for (const b of allBets) {
    // pending 状态的投注只扣款，不结算
    if (b.result === 'pending') {
      timeline.push({ betId: b.id, time: b.created_at, type: 'bet', amount: -b.stake });
    } else {
      // 已结算: 下注时扣款 + 结算时回款
      timeline.push({ betId: b.id, time: b.created_at, type: 'bet', amount: -b.stake });
      const settleTime = b.settled_at || b.created_at;
      timeline.push({ betId: b.id, time: settleTime, type: 'settle', amount: b.payout });
    }
  }
  timeline.sort((a, b) => a.time.localeCompare(b.time));

  // 重放时间线，更新每笔投注的 balance_after
  let balance = initial;
  const betBalances = new Map<number, number>();
  for (const evt of timeline) {
    balance += evt.amount;
    betBalances.set(evt.betId, balance);
  }

  // 写入 balance_after
  for (const [betId, bal] of betBalances) {
    db.run("UPDATE personal_bets SET balance_after = ? WHERE id = ?", bal, betId);
  }

  // 更新 personal_bankroll
  setBankroll(balance);

  res.json({
    data: { id: Number(id), newBankroll: balance },
    message: `已更新投注 #${id}，当前余额 ¥${balance.toFixed(2)}`,
  });
});
