// 投注记录管理 (CRUD)
import { getDb } from '../db/schema';
import { updateBalance } from '../betting/bankroll';

export interface CreateBetInput {
  matchId: string;
  teamA: string;
  teamB: string;
  betType: '1X2' | 'correct_score';
  selection: string;
  modelProb: number;
  odds: number;
  oddsSource: string;
  valueEdge: number;
  stake: number;
  kellyFraction: number;
  notes?: string;
}

// 创建投注记录
export function createBet(input: CreateBetInput): number {
  const db = getDb();

  // 扣减余额
  updateBalance(-input.stake, `投注: ${input.teamA} vs ${input.teamB}`);

  const result = db.run(
    `INSERT INTO bets (match_id, team_a, team_b, bet_type, selection, model_prob, odds,
      odds_source, value_edge, stake, kelly_fraction, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.matchId, input.teamA, input.teamB, input.betType, input.selection,
    input.modelProb, input.odds, input.oddsSource, input.valueEdge, input.stake,
    String(input.kellyFraction), input.notes ?? null
  );

  return result.lastInsertRowid;
}

// 结算投注
export function settleBet(betId: number, actualOutcome: string, isWin: boolean, push = false): void {
  const db = getDb();

  const bet = db.get<{ stake: number; odds: number; team_a: string; team_b: string }>(
    'SELECT * FROM bets WHERE id = ?', betId
  );
  if (!bet) throw new Error(`投注 ${betId} 不存在`);

  let result: string;
  let payout: number;

  if (push) {
    result = 'push';
    payout = bet.stake;
  } else if (isWin) {
    result = 'win';
    payout = bet.stake * bet.odds;
  } else {
    result = 'loss';
    payout = 0;
  }

  // 更新投注
  db.run(
    "UPDATE bets SET actual_outcome = ?, result = ?, payout = ?, settled_at = datetime('now') WHERE id = ?",
    actualOutcome, result, payout, betId
  );

  // 更新余额
  const newBalance = updateBalance(payout, `结算: ${bet.team_a} vs ${bet.team_b} (${result})`, betId);

  // 写入结算余额
  db.run('UPDATE bets SET balance_after = ? WHERE id = ?', newBalance, betId);
}

// 获取所有投注
export function getAllBets(filters?: { status?: string; betType?: string; limit?: number; offset?: number }) {
  const db = getDb();

  let sql = 'SELECT * FROM bets WHERE 1=1';
  const params: unknown[] = [];

  if (filters?.status && filters.status !== 'all') {
    sql += ' AND result = ?';
    params.push(filters.status);
  }
  if (filters?.betType) {
    sql += ' AND bet_type = ?';
    params.push(filters.betType);
  }
  sql += ' ORDER BY created_at DESC';
  if (filters?.limit) {
    sql += ' LIMIT ?';
    params.push(filters.limit);
    if (filters?.offset) {
      sql += ' OFFSET ?';
      params.push(filters.offset);
    }
  }

  return db.all(sql, ...params);
}

// 获取单笔投注
export function getBet(betId: number) {
  return getDb().get('SELECT * FROM bets WHERE id = ?', betId);
}

// 删除投注
export function deleteBet(betId: number): boolean {
  const db = getDb();
  const bet = getBet(betId) as { result: string; stake: number } | undefined;
  if (!bet || bet.result !== 'pending') return false;

  updateBalance(bet.stake, `取消投注 #${betId}`);
  db.run('DELETE FROM bets WHERE id = ?', betId);
  return true;
}
