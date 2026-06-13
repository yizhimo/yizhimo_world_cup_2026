// 手动赔率输入处理
import { getDb } from '../db/schema';
import { removeMargin } from '../betting/value';

export interface ManualOddsInput {
  matchId: string;
  source: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  scoreOdds?: Record<string, number>;
}

export function saveManualOdds(input: ManualOddsInput): void {
  const db = getDb();

  const implied = removeMargin({ home: input.homeOdds, draw: input.drawOdds, away: input.awayOdds });

  db.run(
    `INSERT INTO odds (match_id, source, home_odds, draw_odds, away_odds,
      score_odds, home_implied_prob, draw_implied_prob, away_implied_prob, margin)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.matchId, input.source, input.homeOdds, input.drawOdds, input.awayOdds,
    input.scoreOdds ? JSON.stringify(input.scoreOdds) : null,
    implied.home, implied.draw, implied.away, implied.margin
  );
}

export function getOddsForMatch(matchId: string) {
  return getDb().all(
    `SELECT source, home_odds, draw_odds, away_odds, score_odds,
            home_implied_prob, draw_implied_prob, away_implied_prob, margin, fetched_at
     FROM odds WHERE match_id = ? ORDER BY fetched_at DESC`,
    matchId
  );
}

export function batchSaveOdds(inputs: ManualOddsInput[]): { success: number; errors: string[] } {
  const errors: string[] = [];
  let success = 0;
  for (const input of inputs) {
    try { saveManualOdds(input); success++; }
    catch (err) { errors.push(`${input.matchId}: ${(err as Error).message}`); }
  }
  return { success, errors };
}
