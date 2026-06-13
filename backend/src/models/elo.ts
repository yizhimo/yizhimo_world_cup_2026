// Elo 评分计算引擎
// 基于 eloratings.net 的方法论
// 平局概率采用连续函数: draw = base * exp(-eloDiff² / 2σ²)

const K_FACTOR = 32;           // K 值，决定单场变动幅度
const HOME_ADVANTAGE = 100;    // 主场优势 Elo 加分
const DRAW_BASE = 0.265;       // 国际比赛基础平局率 (~26.5%)
const DRAW_SIGMA = 400;        // Elo 差衰减参数

// 球队 Elo 数据缓存
const teamElos = new Map<string, number>();

// 从数据库加载所有球队 Elo (每次启动调用)
export function loadElos(getDbFn: () => any): void {
  const db = getDbFn();
  const rows = db.all("SELECT name, elo_rating FROM teams") as Array<{ name: string; elo_rating: number }>;
  for (const row of rows) {
    teamElos.set(row.name, row.elo_rating || 1500);
  }
  console.log(`[Elo] 已加载 ${teamElos.size} 支球队评分`);
}

// 初始化/更新球队 Elo
export function setElo(team: string, elo: number): void {
  teamElos.set(team, elo);
}

export function getElo(team: string): number {
  return teamElos.get(team) ?? 1500;
}

export function getAllElos(): Map<string, number> {
  return new Map(teamElos);
}

// Elo → 胜率 (无平局，We=1/(1+10^(-Δ/400)))
function expectedWinRate(eloA: number, eloB: number, homeAdvantage: boolean): number {
  const adjustedA = homeAdvantage ? eloA + HOME_ADVANTAGE : eloA;
  return 1 / (1 + Math.pow(10, -(adjustedA - eloB) / 400));
}

// Elo → 胜/平/负三值概率 (连续函数版)
export function predictMatch(
  teamA: string,
  teamB: string,
  homeAdvantage = true
): { homeProb: number; drawProb: number; awayProb: number } {
  const eloA = getElo(teamA);
  const eloB = getElo(teamB);

  // 基于 Elo 差值的连续平局概率
  // 实力接近 → 平局率高，实力悬殊 → 平局率低
  const eloDiff = Math.abs(eloA - eloB);
  const drawProb = DRAW_BASE * Math.exp(-(eloDiff * eloDiff) / (2 * DRAW_SIGMA * DRAW_SIGMA));

  const homeWin = expectedWinRate(eloA, eloB, homeAdvantage);
  const awayWin = 1 - homeWin;

  // 按胜率比例分配剩余概率
  const remaining = 1 - drawProb;
  const scale = remaining / (homeWin + awayWin);
  const scaledHome = homeWin * scale;
  const scaledAway = awayWin * scale;

  return {
    homeProb: Math.round(scaledHome * 10000) / 10000,
    drawProb: Math.round(drawProb * 10000) / 10000,
    awayProb: Math.round(scaledAway * 10000) / 10000,
  };
}

// 比赛结算后更新 Elo
export function updateElo(
  teamA: string,
  teamB: string,
  result: 'home' | 'draw' | 'away',
  homeAdvantage = true
): { newEloA: number; newEloB: number } {
  const eloA = getElo(teamA);
  const eloB = getElo(teamB);

  const expectedA = expectedWinRate(eloA, eloB, homeAdvantage);
  const expectedB = 1 - expectedA;

  // 实际得分
  let actualA: number;
  let actualB: number;

  switch (result) {
    case 'home': actualA = 1; actualB = 0; break;
    case 'draw': actualA = 0.5; actualB = 0.5; break;
    case 'away': actualA = 0; actualB = 1; break;
  }

  // K 值根据比赛阶段调整
  let k = K_FACTOR;
  // 淘汰赛高权重 (在调用处通过多次更新或更高 K 实现)

  const newEloA = eloA + k * (actualA - expectedA);
  const newEloB = eloB + k * (actualB - expectedB);

  setElo(teamA, newEloA);
  setElo(teamB, newEloB);

  return { newEloA, newEloB };
}
