// 综合预测引擎
import { getDb } from '../db/schema';
import { predictMatch as poissonPredict } from './poisson';
import { predictMatch as eloPredict } from './elo';
import { removeMargin } from '../betting/value';

interface MatchPrediction {
  matchId: string;
  teamA: string;
  teamB: string;
  poisson: { home: number; draw: number; away: number; expectedGoalsA: number; expectedGoalsB: number };
  elo: { home: number; draw: number; away: number };
  final: { home: number; draw: number; away: number };
  topScores: { score: string; prob: number }[];
  recommendedBet: 'home' | 'draw' | 'away' | 'skip';
  valueEdge: number | null;
}

export function generatePrediction(
  matchId: string, teamA: string, teamB: string,
  weights = { poisson: 0.25, elo: 0.45, market: 0.30 },
  homeAdvantage = true
): MatchPrediction {
  const poisson = poissonPredict(teamA, teamB, homeAdvantage);
  const elo = eloPredict(teamA, teamB, homeAdvantage);

  const db = getDb();
  const oddsRow = db.get<{ home_odds: number; draw_odds: number; away_odds: number }>(
    `SELECT home_odds, draw_odds, away_odds FROM odds
     WHERE match_id = ? AND source = 'pinnacle' ORDER BY fetched_at DESC LIMIT 1`,
    matchId
  );

  let marketProbs = { home: 0.33, draw: 0.34, away: 0.33 };
  if (oddsRow) {
    const implied = removeMargin({ home: oddsRow.home_odds, draw: oddsRow.draw_odds, away: oddsRow.away_odds });
    marketProbs = { home: implied.home, draw: implied.draw, away: implied.away };
  }

  const final = {
    home: poisson.homeProb * weights.poisson + elo.homeProb * weights.elo + marketProbs.home * weights.market,
    draw: poisson.drawProb * weights.poisson + elo.drawProb * weights.elo + marketProbs.draw * weights.market,
    away: poisson.awayProb * weights.poisson + elo.awayProb * weights.elo + marketProbs.away * weights.market,
  };

  const outcomes = [
    { key: 'home' as const, prob: final.home },
    { key: 'draw' as const, prob: final.draw },
    { key: 'away' as const, prob: final.away },
  ];
  outcomes.sort((a, b) => b.prob - a.prob);
  const top = outcomes[0];

  let recommendedBet: 'home' | 'draw' | 'away' | 'skip' = top.key;
  let valueEdge: number | null = null;

  if (oddsRow) {
    const implied = removeMargin({ home: oddsRow.home_odds, draw: oddsRow.draw_odds, away: oddsRow.away_odds });
    const modelProb = final[top.key];
    const impliedProb = implied[top.key];
    valueEdge = modelProb - impliedProb;
    if (valueEdge < 0.05) recommendedBet = 'skip';
  }

  return {
    matchId, teamA, teamB,
    poisson: {
      home: poisson.homeProb, draw: poisson.drawProb, away: poisson.awayProb,
      expectedGoalsA: poisson.expectedGoalsA, expectedGoalsB: poisson.expectedGoalsB,
    },
    elo: { home: elo.homeProb, draw: elo.drawProb, away: elo.awayProb },
    final,
    topScores: poisson.topScores,
    recommendedBet,
    valueEdge: valueEdge !== null ? Math.round(valueEdge * 10000) / 10000 : null,
  };
}

export function generateAllPredictions(weights?: { poisson: number; elo: number; market: number }): MatchPrediction[] {
  const db = getDb();
  const matches = db.all<{ match_id: string; team_a: string; team_b: string }>(
    "SELECT match_id, team_a, team_b FROM matches WHERE status = 'upcoming' ORDER BY kickoff_time ASC"
  );
  return matches.map(m => generatePrediction(m.match_id, m.team_a, m.team_b, weights));
}

export function savePrediction(prediction: MatchPrediction): void {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO predictions
     (match_id, poisson_home_prob, poisson_draw_prob, poisson_away_prob,
      poisson_expected_goals_a, poisson_expected_goals_b,
      elo_home_prob, elo_draw_prob, elo_away_prob,
      final_home_prob, final_draw_prob, final_away_prob,
      top_scores, recommended_bet, value_edge)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    prediction.matchId,
    prediction.poisson.home, prediction.poisson.draw, prediction.poisson.away,
    prediction.poisson.expectedGoalsA, prediction.poisson.expectedGoalsB,
    prediction.elo.home, prediction.elo.draw, prediction.elo.away,
    prediction.final.home, prediction.final.draw, prediction.final.away,
    JSON.stringify(prediction.topScores),
    prediction.recommendedBet,
    prediction.valueEdge
  );
}
