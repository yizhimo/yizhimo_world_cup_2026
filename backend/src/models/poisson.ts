// Poisson 回归模型 — 核心预测引擎
// 基于 Dixon & Coles (1997) 方法: 时间加权 MLE 估计球队进攻/防守参数
// 参考文献: Modelling Association Football Scores (JRSS-C, 1997)
// 参数来源: scripts/train-model.ts 从历史数据训练 (2014-2024, 11,726 场)

const MAX_GOALS = 10;             // 截断比分，10+ 归入第 10 档
const LEAGUE_AVG_GOALS = 1.3576;  // 国际比赛平均每队进球数 (训练结果)
const XI_DECAY = 0.003;           // 时间衰减参数 ξ (per day)
const HOME_ADVANTAGE_DEFAULT = 1.6319; // 主场进球优势倍数 (训练结果)

// 球队参数
interface TeamParams {
  attack: number;     // 进攻力 α (相对于平均)
  defense: number;    // 防守力 β (相对于平均)
}

interface PoissonResult {
  expectedGoalsA: number;
  expectedGoalsB: number;
  // 比分概率矩阵 [homeGoals][awayGoals]
  scoreMatrix: number[][];
  // 聚合概率
  homeProb: number;
  drawProb: number;
  awayProb: number;
  // 最可能比分
  topScores: { score: string; prob: number }[];
}

// 全局球队参数 (启动时从数据库加载)
const teamParams = new Map<string, TeamParams>();

// Poisson PMF
function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

// 从 Elo 推算进攻/防守参数 (作为后备)
// 使用温和的对数映射: exp((elo-1500)/800)，范围约 0.4~2.5
export function estimateFromElo(elo: number): TeamParams {
  const strength = Math.exp((elo - 1500) / 800);
  return {
    attack: strength,
    defense: 1 / strength,
  };
}

export function setTeamParams(team: string, params: TeamParams): void {
  teamParams.set(team, params);
}

export function getTeamParams(team: string): TeamParams {
  return teamParams.get(team) ?? { attack: 1.0, defense: 1.0 };
}

// 从数据库加载球队参数 — 统一使用 Elo 估算 (训练参数可能存在过拟合)
export function loadTrainedParams(getDbFn: () => any): void {
  const db = getDbFn();
  const rows = db.all(
    "SELECT name, attack_strength, defense_strength, elo_rating FROM teams"
  ) as Array<{ name: string; attack_strength: number; defense_strength: number; elo_rating: number }>;

  // 全部基于 Elo 估算，不使用训练出的极端参数
  for (const row of rows) {
    const est = estimateFromElo(row.elo_rating || 1500);
    teamParams.set(row.name, {
      attack: Math.max(0.35, Math.min(2.8, est.attack)),
      defense: Math.max(0.35, Math.min(2.8, est.defense)),
    });
  }

  console.log(`[Poisson] 已加载 ${teamParams.size} 支球队参数 (基于 Elo, range: 0.35~2.80)`);
}

// 时间衰减权重
export function timeWeight(matchDate: Date, currentDate: Date = new Date()): number {
  const daysDiff = (currentDate.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-XI_DECAY * Math.max(0, daysDiff));
}

// 计算预期进球
export function expectedGoals(
  teamA: string,
  teamB: string,
  homeAdvantage = true
): { lambdaA: number; lambdaB: number } {
  const paramsA = getTeamParams(teamA);
  const paramsB = getTeamParams(teamB);

  const ha = homeAdvantage ? HOME_ADVANTAGE_DEFAULT : 1.0;

  const lambdaA = Math.min(5.0, Math.max(0.2, LEAGUE_AVG_GOALS * paramsA.attack * paramsB.defense * ha));
  const lambdaB = Math.min(5.0, Math.max(0.2, LEAGUE_AVG_GOALS * paramsB.attack * paramsA.defense));

  return { lambdaA, lambdaB };
}

// 完整预测
export function predictMatch(
  teamA: string,
  teamB: string,
  homeAdvantage = true,
  rho = -0.08  // Dixon-Coles ρ 参数 (训练结果: -0.08, 低分相关修正)
): PoissonResult {
  const { lambdaA, lambdaB } = expectedGoals(teamA, teamB, homeAdvantage);

  // 生成比分概率矩阵
  const scoreMatrix: number[][] = [];
  let homeProb = 0;
  let drawProb = 0;
  let awayProb = 0;

  for (let i = 0; i <= MAX_GOALS; i++) {
    scoreMatrix[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poissonPmf(i, lambdaA) * poissonPmf(j, lambdaB);
      const tau = dixonColesTau(i, j, lambdaA, lambdaB, rho);
      scoreMatrix[i][j] = p * tau;

      if (i > j) homeProb += scoreMatrix[i][j];
      else if (i === j) drawProb += scoreMatrix[i][j];
      else awayProb += scoreMatrix[i][j];
    }
  }

  // 归一化：截断损失的概率质量按比例分配回去
  const totalProb = homeProb + drawProb + awayProb;
  if (totalProb > 0) {
    homeProb /= totalProb;
    drawProb /= totalProb;
    awayProb /= totalProb;
  }

  // 最可能比分 TOP 5
  const allScores: { score: string; prob: number }[] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      allScores.push({ score: `${i}-${j}`, prob: scoreMatrix[i][j] });
    }
  }
  allScores.sort((a, b) => b.prob - a.prob);

  return {
    expectedGoalsA: Math.round(lambdaA * 100) / 100,
    expectedGoalsB: Math.round(lambdaB * 100) / 100,
    scoreMatrix,
    homeProb: Math.round(homeProb * 10000) / 10000,
    drawProb: Math.round(drawProb * 10000) / 10000,
    awayProb: Math.round(awayProb * 10000) / 10000,
    topScores: allScores.slice(0, 5),
  };
}

// Dixon-Coles 低分依赖修正 τ
function dixonColesTau(
  x: number, y: number,
  lambdaX: number, lambdaY: number,
  rho: number
): number {
  if (rho === 0) return 1;

  if (x === 0 && y === 0) return 1 - lambdaX * lambdaY * rho;
  if (x === 0 && y === 1) return 1 + lambdaX * rho;
  if (x === 1 && y === 0) return 1 + lambdaY * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// 比分概率 → 正确比分概率
export function correctScoreProb(scoreMatrix: number[][], homeGoals: number, awayGoals: number): number {
  if (homeGoals > MAX_GOALS || awayGoals > MAX_GOALS) return 0;
  return scoreMatrix[homeGoals][awayGoals];
}
