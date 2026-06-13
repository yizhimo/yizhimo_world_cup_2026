// Poisson 模型参数训练脚本
// 基于 49,000+ 场国际比赛数据，使用 Dixon-Coles 时间加权 MLE
// 估算：球队进攻/防守参数、主场优势、联赛平均进球、Dixon-Coles ρ

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { initDb, getDb, createTables } from '../src/db/schema';
import { WC2026_TEAMS } from '../src/utils/football';

// ============================================================
// 配置参数
// ============================================================
const DATA_PATH = path.join(__dirname, '..', 'data', 'historical', 'results.csv');
const REFERENCE_DATE = new Date('2026-06-01'); // 预测参考日期
const MIN_MATCH_DATE = new Date('2014-01-01'); // 只用 2014 年后的数据
const MIN_TEAM_MATCHES = 5;    // 球队至少 5 场比赛才优化，否则固定默认值
const XI_DECAY = 0.003;        // 时间衰减参数 (per day)
const MAX_ITER = 500;          // MLE 最大迭代次数
const CONVERGENCE_TOL = 0.01;  // 收敛阈值（对数似然改进 < 0.01）

// ============================================================
// CSV 中的队名 → WC2026_TEAMS name_en 映射
// ============================================================
const TEAM_NAME_ALIASES: Record<string, string> = {
  'United States': 'USA',
  'South Korea': 'South Korea',
  'Czechoslovakia': 'Czechia',        // 历史名称映射
  'Czech Republic': 'Czechia',
  'Ivory Coast': "Côte d'Ivoire",
  'Cape Verde': 'Cabo Verde',
  'Cape Verde Islands': 'Cabo Verde',
  'Bosnia and Herzegovina': 'Bosnia & Herzegovina',
  'Bosnia-Herzegovina': 'Bosnia & Herzegovina',
  'Turkey': 'Türkiye',
  'Zaire': 'DR Congo',               // 刚果(金)旧称
  'Congo Kinshasa': 'DR Congo',
  'Congo': 'DR Congo',               // 注意：刚果(布)是 Congo Brazzaville
  'Congo Brazzaville': 'DR Congo',   // 近似处理
  'Saudi Arabia': 'Saudi Arabia',
  'New Zealand': 'New Zealand',
  'South Africa': 'South Africa',
  'North Korea': 'South Korea',       // 近似
};

// ============================================================
// 类型定义
// ============================================================
interface ParsedMatch {
  date: Date;
  homeTeam: string;    // 标准化后的英文名
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  neutral: boolean;
  weight: number;      // 时间衰减权重
}

interface TeamStats {
  name: string;          // 英文名
  nameCn: string;        // 中文名 (WC2026 球队有)
  isWC2026: boolean;
  attack: number;
  defense: number;
  matchCount: number;
  totalGoalsScored: number;
  totalGoalsConceded: number;
}

interface TrainingResult {
  leagueAvgGoals: number;
  homeAdvantage: number;
  rho: number;
  teams: Map<string, TeamStats>;
  iterations: number;
  finalLogLik: number;
  matchesUsed: number;
  teamCount: number;
}

// ============================================================
// 工具函数
// ============================================================
function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonLogPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 0 : -Infinity;
  return -lambda + k * Math.log(lambda) - Math.log(factorial(k));
}

function dixonColesTau(x: number, y: number, lx: number, ly: number, rho: number): number {
  if (rho === 0) return 1;
  if (x === 0 && y === 0) return 1 - lx * ly * rho;
  if (x === 0 && y === 1) return 1 + lx * rho;
  if (x === 1 && y === 0) return 1 + ly * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

// ============================================================
// Step 1: 解析 CSV 并过滤
// ============================================================
function normalizeTeamName(csvName: string): string {
  // 先检查已知别名
  if (TEAM_NAME_ALIASES[csvName]) return TEAM_NAME_ALIASES[csvName];

  // 检查是否直接匹配 WC2026 name_en
  const wcTeam = WC2026_TEAMS.find(t => t.name_en === csvName);
  if (wcTeam) return csvName;

  return csvName;
}

function isWC2026Team(nameEn: string): boolean {
  return WC2026_TEAMS.some(t => t.name_en === nameEn);
}

function getWC2026NameCn(nameEn: string): string {
  const t = WC2026_TEAMS.find(t => t.name_en === nameEn);
  return t?.name ?? '';
}

function getWC2026Elo(nameEn: string): number {
  const t = WC2026_TEAMS.find(t => t.name_en === nameEn);
  return t?.elo ?? 1500;
}

function parseAndFilterMatches(): ParsedMatch[] {
  console.log('[Step 1] 解析历史比赛数据...');

  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  const records = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const matches: ParsedMatch[] = [];
  let skippedOld = 0;
  let skippedMissing = 0;

  for (const row of records) {
    const date = new Date(row.date);
    if (isNaN(date.getTime())) continue;
    if (date < MIN_MATCH_DATE) { skippedOld++; continue; }

    const homeGoals = parseInt(row.home_score, 10);
    const awayGoals = parseInt(row.away_score, 10);
    if (isNaN(homeGoals) || isNaN(awayGoals)) { skippedMissing++; continue; }

    const homeTeam = normalizeTeamName(row.home_team);
    const awayTeam = normalizeTeamName(row.away_team);
    const neutral = row.neutral === 'TRUE';

    // 时间衰减权重
    const daysDiff = Math.max(0, (REFERENCE_DATE.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    const weight = Math.exp(-XI_DECAY * daysDiff);

    matches.push({
      date,
      homeTeam,
      awayTeam,
      homeGoals,
      awayGoals,
      neutral,
      weight,
    });
  }

  console.log(`  总比赛: ${records.length}, 过滤(时间<2014): ${skippedOld}, 过滤(缺数据): ${skippedMissing}`);
  console.log(`  使用: ${matches.length} 场比赛 (2014–2024)`);

  return matches;
}

// ============================================================
// Step 2: 计算经验参数（联赛平均进球 & 主场优势）
// ============================================================
function calcEmpiricalParams(matches: ParsedMatch[]): { leagueAvgGoals: number; homeAdvantage: number } {
  console.log('[Step 2] 计算经验参数...');

  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  let nonNeutralMatches = 0;

  for (const m of matches) {
    if (!m.neutral) {
      totalHomeGoals += m.homeGoals;
      totalAwayGoals += m.awayGoals;
      nonNeutralMatches++;
    }
  }

  // 每队每场平均进球 (league average)
  const leagueAvgGoals = (totalHomeGoals + totalAwayGoals) / (nonNeutralMatches * 2);

  // 主场优势 = 主场进球 / 客场进球
  const homeAvg = totalHomeGoals / nonNeutralMatches;
  const awayAvg = totalAwayGoals / nonNeutralMatches;
  const homeAdvantage = homeAvg / awayAvg;

  console.log(`  联赛平均进球/队/场: ${leagueAvgGoals.toFixed(4)}`);
  console.log(`  主场优势倍数: ${homeAdvantage.toFixed(4)} (主 ${homeAvg.toFixed(3)} vs 客 ${awayAvg.toFixed(3)})`);

  return { leagueAvgGoals, homeAdvantage };
}

// ============================================================
// Step 3: 构建球队列表
// ============================================================
function buildTeamList(matches: ParsedMatch[]): Map<string, TeamStats> {
  console.log('[Step 3] 构建球队列表...');

  const teams = new Map<string, TeamStats>();

  for (const m of matches) {
    for (const teamName of [m.homeTeam, m.awayTeam]) {
      if (!teams.has(teamName)) {
        const isWC = isWC2026Team(teamName);
        // 所有球队从 1.0 初始化，让数据说话
        teams.set(teamName, {
          name: teamName,
          nameCn: isWC ? getWC2026NameCn(teamName) : '',
          isWC2026: isWC,
          attack: 1.0,
          defense: 1.0,
          matchCount: 0,
          totalGoalsScored: 0,
          totalGoalsConceded: 0,
        });
      }
    }
  }

  // 统计每队的比赛数
  for (const m of matches) {
    const ht = teams.get(m.homeTeam)!;
    const at = teams.get(m.awayTeam)!;
    ht.matchCount++;
    at.matchCount++;
    ht.totalGoalsScored += m.homeGoals;
    ht.totalGoalsConceded += m.awayGoals;
    at.totalGoalsScored += m.awayGoals;
    at.totalGoalsConceded += m.homeGoals;
  }

  const wcCount = Array.from(teams.values()).filter(t => t.isWC2026).length;
  console.log(`  总球队: ${teams.size}, WC2026 球队: ${wcCount}/${WC2026_TEAMS.length}`);

  // 列出未匹配的 WC2026 球队
  const matchedWC = new Set(Array.from(teams.values()).filter(t => t.isWC2026).map(t => t.name));
  const missing = WC2026_TEAMS.filter(t => !matchedWC.has(t.name_en));
  if (missing.length > 0) {
    console.log(`  未匹配的 WC2026 球队 (${missing.length}): ${missing.map(t => t.name_en).join(', ')}`);
  }

  return teams;
}

// ============================================================
// Step 4: 迭代 MLE 优化攻击/防守参数 (带阻尼的梯度上升)
// ============================================================
function trainParameters(
  matches: ParsedMatch[],
  teams: Map<string, TeamStats>,
  leagueAvgGoals: number,
  homeAdvantage: number,
): { iterations: number; finalLogLik: number } {
  console.log('[Step 4] 迭代 MLE 训练攻击/防守参数...');

  // 只优化比赛数 >= MIN_TEAM_MATCHES 的球队
  const optimizableTeams = new Set<string>();
  for (const [name, stats] of teams) {
    if (stats.matchCount >= MIN_TEAM_MATCHES) {
      optimizableTeams.add(name);
    }
  }
  console.log(`  可优化球队: ${optimizableTeams.size}/${teams.size} (>=${MIN_TEAM_MATCHES}场)`);

  // 预计算每队涉及的比赛索引，避免每轮全量遍历
  const teamMatches = new Map<string, number[]>(); // team -> matchIndices
  for (const name of optimizableTeams) {
    teamMatches.set(name, []);
  }
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (optimizableTeams.has(m.homeTeam)) teamMatches.get(m.homeTeam)!.push(i);
    if (optimizableTeams.has(m.awayTeam)) teamMatches.get(m.awayTeam)!.push(i);
  }

  const LR = 0.5;            // 学习率
  const LR_DECAY = 0.995;    // 每轮学习率衰减
  let lr = LR;
  let prevLogLik = -Infinity;
  let convergedAt = MAX_ITER;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // 累积梯度 (在 log 空间)
    const attackGrad = new Map<string, number>();
    const defenseGrad = new Map<string, number>();

    for (const name of optimizableTeams) {
      attackGrad.set(name, 0);
      defenseGrad.set(name, 0);
    }

    // 遍历所有比赛，计算梯度
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const ht = teams.get(m.homeTeam)!;
      const at = teams.get(m.awayTeam)!;
      const ha = m.neutral ? 1.0 : homeAdvantage;

      const lambdaH = leagueAvgGoals * ht.attack * at.defense * ha;
      const lambdaA = leagueAvgGoals * at.attack * ht.defense;
      const w = m.weight;

      // 梯度: ∂LL/∂log(α) = w * (goals - λ)
      // 因为 ∂λ/∂α * α/λ = 1 → ∂LL/∂log(α) = w * (goals - λ)
      if (optimizableTeams.has(m.homeTeam)) {
        attackGrad.set(m.homeTeam, attackGrad.get(m.homeTeam)! + w * (m.homeGoals - lambdaH));
        defenseGrad.set(m.homeTeam, defenseGrad.get(m.homeTeam)! + w * (m.awayGoals - lambdaA));
      }
      if (optimizableTeams.has(m.awayTeam)) {
        attackGrad.set(m.awayTeam, attackGrad.get(m.awayTeam)! + w * (m.awayGoals - lambdaA));
        defenseGrad.set(m.awayTeam, defenseGrad.get(m.awayTeam)! + w * (m.homeGoals - lambdaH));
      }
    }

    // 在 log 空间更新参数
    for (const [name, stats] of teams) {
      if (!optimizableTeams.has(name)) continue;

      const aGrad = attackGrad.get(name) ?? 0;
      const dGrad = defenseGrad.get(name) ?? 0;

      // log(α_new) = log(α_old) + lr * grad / total_weight
      // 其中 grad 是 ∂LL/∂log(α)，除以 total_weight 来归一化
      const totalW = teamMatches.get(name)!.reduce((s, i) => s + matches[i].weight, 0);
      const normAGrad = aGrad / Math.max(totalW, 0.1);
      const normDGrad = dGrad / Math.max(totalW, 0.1);

      const logAttack = Math.log(Math.max(stats.attack, 1e-6));
      const logDefense = Math.log(Math.max(stats.defense, 1e-6));

      const newLogAttack = logAttack + lr * normAGrad;
      const newLogDefense = logDefense + lr * normDGrad;

      // 限制范围防发散
      stats.attack = Math.exp(Math.max(-2.0, Math.min(2.0, newLogAttack)));
      stats.defense = Math.exp(Math.max(-2.0, Math.min(2.0, newLogDefense)));
    }

    // 归一化：geometric_mean(attack) = 1
    let logProd = 0;
    let count = 0;
    for (const [name, stats] of teams) {
      if (optimizableTeams.has(name)) {
        logProd += Math.log(stats.attack);
        count++;
      }
    }
    const logGeoMean = logProd / count;
    for (const [name, stats] of teams) {
      if (optimizableTeams.has(name)) {
        stats.attack *= Math.exp(-logGeoMean);
        stats.defense *= Math.exp(logGeoMean);
      }
    }

    // 学习率衰减
    lr *= LR_DECAY;

    // 每 25 轮检查对数似然
    if (iter % 25 === 0 || iter === 0) {
      const logLik = computeLogLikelihood(matches, teams, leagueAvgGoals, homeAdvantage, 0);
      const improvement = logLik - prevLogLik;
      console.log(`  Iter ${iter}: logLik=${logLik.toFixed(2)}, Δ=${improvement.toFixed(4)}, lr=${lr.toFixed(4)}`);

      // 收敛判断
      if (Math.abs(improvement) < CONVERGENCE_TOL && iter > 25) {
        console.log(`  收敛于 iter ${iter}, logLik=${logLik.toFixed(2)}`);
        convergedAt = iter;
        break;
      }
      prevLogLik = logLik;
    }
  }

  const finalLogLik = computeLogLikelihood(matches, teams, leagueAvgGoals, homeAdvantage, 0);

  return { iterations: convergedAt, finalLogLik };
}

// 计算时间加权对数似然 (不含 τ 修正)
function computeLogLikelihood(
  matches: ParsedMatch[],
  teams: Map<string, TeamStats>,
  leagueAvgGoals: number,
  homeAdvantage: number,
  rho: number,
): number {
  let totalLogLik = 0;

  for (const m of matches) {
    const ht = teams.get(m.homeTeam)!;
    const at = teams.get(m.awayTeam)!;
    const ha = m.neutral ? 1.0 : homeAdvantage;

    const lambdaH = leagueAvgGoals * ht.attack * at.defense * ha;
    const lambdaA = leagueAvgGoals * at.attack * ht.defense;

    const llH = poissonLogPmf(m.homeGoals, lambdaH);
    const llA = poissonLogPmf(m.awayGoals, lambdaA);
    const tau = dixonColesTau(m.homeGoals, m.awayGoals, lambdaH, lambdaA, rho);
    const logTau = Math.log(Math.max(tau, 1e-10));

    totalLogLik += m.weight * (llH + llA + logTau);
  }

  return totalLogLik;
}

// ============================================================
// Step 5: 校准 — 使预测总进球匹配实际总进球
// ============================================================
function calibrateScale(
  matches: ParsedMatch[],
  teams: Map<string, TeamStats>,
  leagueAvgGoals: number,
  homeAdvantage: number,
): void {
  console.log('[Step 4b] 校准预测进球比例...');

  let totalPredicted = 0;
  let totalActual = 0;
  let totalWeight = 0;

  for (const m of matches) {
    const ht = teams.get(m.homeTeam)!;
    const at = teams.get(m.awayTeam)!;
    const ha = m.neutral ? 1.0 : homeAdvantage;

    const lambdaH = leagueAvgGoals * ht.attack * at.defense * ha;
    const lambdaA = leagueAvgGoals * at.attack * ht.defense;

    totalPredicted += m.weight * (lambdaH + lambdaA);
    totalActual += m.weight * (m.homeGoals + m.awayGoals);
    totalWeight += m.weight;
  }

  const ratio = totalActual / totalPredicted;
  console.log(`  预测进球: ${(totalPredicted / totalWeight).toFixed(4)}/场, 实际: ${(totalActual / totalWeight).toFixed(4)}/场`);
  console.log(`  校准因子: ${ratio.toFixed(4)} (调整攻击参数)`);

  // 调整所有攻击参数使总预测匹配总实际
  const scale = Math.sqrt(ratio);
  for (const [name, stats] of teams) {
    stats.attack *= scale;
    stats.defense /= scale;
  }

  // 验证校准
  let calibratedPred = 0;
  for (const m of matches) {
    const ht = teams.get(m.homeTeam)!;
    const at = teams.get(m.awayTeam)!;
    const ha = m.neutral ? 1.0 : homeAdvantage;
    const lambdaH = leagueAvgGoals * ht.attack * at.defense * ha;
    const lambdaA = leagueAvgGoals * at.attack * ht.defense;
    calibratedPred += m.weight * (lambdaH + lambdaA);
  }
  console.log(`  校准后预测: ${(calibratedPred / totalWeight).toFixed(4)}/场`);
}
function estimateRho(
  matches: ParsedMatch[],
  teams: Map<string, TeamStats>,
  leagueAvgGoals: number,
  homeAdvantage: number,
): number {
  console.log('[Step 5] 网格搜索最优 Dixon-Coles ρ...');

  const rhoValues = [-0.20, -0.15, -0.13, -0.10, -0.08, -0.06, -0.05, -0.04, -0.03, -0.02, -0.01, 0];
  let bestRho = -0.04;
  let bestLogLik = -Infinity;

  for (const rho of rhoValues) {
    const logLik = computeLogLikelihood(matches, teams, leagueAvgGoals, homeAdvantage, rho);
    console.log(`  ρ=${rho.toFixed(2)}: logLik=${logLik.toFixed(2)}`);
    if (logLik > bestLogLik) {
      bestLogLik = logLik;
      bestRho = rho;
    }
  }

  // 对比 ρ=0
  const logLik0 = computeLogLikelihood(matches, teams, leagueAvgGoals, homeAdvantage, 0);
  const improvement = bestLogLik - logLik0;
  console.log(`  最优 ρ=${bestRho.toFixed(3)}, 相对 ρ=0 改善: ${improvement.toFixed(2)}`);

  return bestRho;
}

// ============================================================
// Step 6: 输出结果并存入数据库
// ============================================================
function printAndSaveResults(result: TrainingResult): void {
  console.log('\n[Step 6] 训练结果汇总');
  console.log('='.repeat(60));
  console.log(`  使用比赛: ${result.matchesUsed}`);
  console.log(`  球队数量: ${result.teamCount}`);
  console.log(`  MLE 迭代: ${result.iterations}`);
  console.log(`  联赛平均进球: ${result.leagueAvgGoals.toFixed(4)}`);
  console.log(`  主场优势倍数: ${result.homeAdvantage.toFixed(4)}`);
  console.log(`  Dixon-Coles ρ: ${result.rho.toFixed(4)}`);
  console.log(`  最终对数似然: ${result.finalLogLik.toFixed(2)}`);

  // WC2026 球队参数
  console.log('\n  WC2026 球队攻击/防守参数 (Top 10 攻击):');
  const wcTeams = Array.from(result.teams.values())
    .filter(t => t.isWC2026)
    .sort((a, b) => b.attack - a.attack);

  console.log('  ' + '-'.repeat(65));
  console.log(`  ${'球队'.padEnd(12)} ${'Elo'.padEnd(6)} ${'进攻'.padEnd(8)} ${'防守'.padEnd(8)} ${'比赛数'.padEnd(6)} ${'场均进球'}`);
  console.log('  ' + '-'.repeat(65));

  for (const t of wcTeams.slice(0, 48)) {
    const elo = getWC2026Elo(t.name);
    const avgGoals = t.matchCount > 0 ? (t.totalGoalsScored / t.matchCount).toFixed(2) : '-';
    console.log(`  ${t.nameCn.padEnd(12)} ${String(elo).padEnd(6)} ${t.attack.toFixed(4).padEnd(8)} ${t.defense.toFixed(4).padEnd(8)} ${String(t.matchCount).padEnd(6)} ${avgGoals}`);
  }

  // 保存到数据库
  saveToDatabase(result);
}

function saveToDatabase(result: TrainingResult): void {
  console.log('\n[Step 6b] 保存训练参数到数据库...');

  const db = getDb();

  // 更新球队参数
  for (const [name, stats] of result.teams) {
    if (!stats.isWC2026) continue;
    const cnName = stats.nameCn;
    db.run(
      `UPDATE teams SET attack_strength = ?, defense_strength = ?, updated_at = datetime('now') WHERE name = ?`,
      Math.round(stats.attack * 10000) / 10000,
      Math.round(stats.defense * 10000) / 10000,
      cnName,
    );
  }

  // 保存训练元数据到 strategy_config
  db.run(
    "INSERT OR REPLACE INTO strategy_config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    'trained_league_avg_goals', String(Math.round(result.leagueAvgGoals * 10000) / 10000),
  );
  db.run(
    "INSERT OR REPLACE INTO strategy_config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    'trained_home_advantage', String(Math.round(result.homeAdvantage * 10000) / 10000),
  );
  db.run(
    "INSERT OR REPLACE INTO strategy_config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    'trained_rho', String(Math.round(result.rho * 10000) / 10000),
  );
  db.run(
    "INSERT OR REPLACE INTO strategy_config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    'trained_matches_count', String(result.matchesUsed),
  );
  db.run(
    "INSERT OR REPLACE INTO strategy_config (key, value, updated_at) VALUES (?, ?, datetime('now'))",
    'trained_date', REFERENCE_DATE.toISOString().split('T')[0],
  );

  console.log('  训练参数已保存到 teams 表 & strategy_config');
  console.log('  完成!');
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  console.log('========================================');
  console.log('Poisson 模型参数训练 (Dixon-Coles MLE)');
  console.log('========================================\n');

  // 初始化数据库
  await initDb();
  createTables();

  // 1. 解析数据
  const matches = parseAndFilterMatches();

  // 2. 计算经验参数
  const { leagueAvgGoals, homeAdvantage } = calcEmpiricalParams(matches);

  // 3. 构建球队列表
  const teams = buildTeamList(matches);

  // 4. MLE 训练
  const { iterations, finalLogLik } = trainParameters(matches, teams, leagueAvgGoals, homeAdvantage);

  // 4b. 校准预测进球比例
  calibrateScale(matches, teams, leagueAvgGoals, homeAdvantage);

  // 5. 估计 ρ
  const rho = estimateRho(matches, teams, leagueAvgGoals, homeAdvantage);

  // 6. 最终对数似然（含 τ）
  const finalLogLikWithTau = computeLogLikelihood(matches, teams, leagueAvgGoals, homeAdvantage, rho);

  const result: TrainingResult = {
    leagueAvgGoals,
    homeAdvantage,
    rho,
    teams,
    iterations,
    finalLogLik: finalLogLikWithTau,
    matchesUsed: matches.length,
    teamCount: teams.size,
  };

  printAndSaveResults(result);
}

main().catch(console.error);
