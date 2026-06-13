// 定时任务调度 — 24 小时自动更新赔率 + 生成预测 + 投注建议
// 受 auto_update_enabled 配置项控制开关
import cron from 'node-cron';
import { runScraping } from './scraper';
import { generateAllPredictions, savePrediction } from '../models/predictor';
import { getDb } from '../db/schema';
import { generateAdvice, OddsSource } from '../betting/strategy';

let mainTask: cron.ScheduledTask | null = null;

function isAutoUpdateEnabled(): boolean {
  try {
    const db = getDb();
    const row = db.get<{ value: string }>(
      "SELECT value FROM strategy_config WHERE key = 'auto_update_enabled'"
    );
    return row?.value === 'true';
  } catch {
    return false;
  }
}

// 单次完整更新流程
export async function runFullUpdate(): Promise<{
  oddsUpdated: number;
  predictionsGenerated: number;
  adviceCount: number;
  error?: string;
}> {
  console.log('\n========================================');
  console.log(`[调度] 开始完整更新 (${new Date().toISOString()})`);
  console.log('========================================');

  let oddsUpdated = 0;
  let predictionsGenerated = 0;
  let adviceCount = 0;

  try {
    // 1. 获取最新赔率
    console.log('[调度] Step 1/3: 获取赔率...');
    oddsUpdated = await runScraping();

    // 2. 重新生成所有预测
    console.log('[调度] Step 2/3: 生成预测...');
    const predictions = generateAllPredictions();
    for (const p of predictions) {
      savePrediction(p);
    }
    predictionsGenerated = predictions.length;
    console.log(`[调度] 已生成 ${predictionsGenerated} 场预测`);

    // 3. 生成投注建议 (有赔率的比赛)
    console.log('[调度] Step 3/3: 生成投注建议...');
    const db = getDb();
    const matches = db.all<{ match_id: string; team_a: string; team_b: string }>(
      "SELECT match_id, team_a, team_b FROM matches WHERE status = 'upcoming' ORDER BY kickoff_time ASC LIMIT 20"
    );

    for (const m of matches) {
      const oddsRows = db.all<{ source: string; home_odds: number; draw_odds: number; away_odds: number }>(
        'SELECT source, home_odds, draw_odds, away_odds FROM odds WHERE match_id = ? ORDER BY fetched_at DESC',
        m.match_id
      );

      if (oddsRows.length === 0) continue;

      const oddsSources: OddsSource[] = [];
      const sourceMap = new Map<string, OddsSource>();
      for (const row of oddsRows) {
        if (!sourceMap.has(row.source)) {
          sourceMap.set(row.source, {
            source: row.source,
            home: row.home_odds,
            draw: row.draw_odds,
            away: row.away_odds,
          });
        }
      }
      for (const s of sourceMap.values()) oddsSources.push(s);

      const advice = generateAdvice(m.match_id, m.team_a, m.team_b, oddsSources);
      if (advice.recommendation.action === 'bet') adviceCount++;
    }

    console.log(`[调度] 找到 ${adviceCount} 场价值投注机会`);
    console.log('[调度] 完整更新完成\n');

    return { oddsUpdated, predictionsGenerated, adviceCount };
  } catch (err) {
    const errorMsg = (err as Error).message;
    console.error('[调度] 更新失败:', errorMsg);
    return { oddsUpdated, predictionsGenerated, adviceCount, error: errorMsg };
  }
}

// 启动 24 小时定时任务 (每天上午 9:00)
export function startScheduler(): void {
  if (mainTask) return;

  mainTask = cron.schedule('0 9 * * *', async () => {
    if (!isAutoUpdateEnabled()) {
      console.log('[调度] 自动更新已关闭，跳过本次执行');
      return;
    }
    await runFullUpdate();
  });

  const status = isAutoUpdateEnabled() ? '已启用' : '已关闭';
  console.log(`[调度] 定时任务已启动 (每日 09:00) — 自动更新: ${status}`);
}

// 停止定时任务
export function stopScheduler(): void {
  if (mainTask) {
    mainTask.stop();
    mainTask = null;
    console.log('[调度] 定时任务已停止');
  }
}

// 查询调度器状态
export function getSchedulerStatus(): { running: boolean; autoUpdate: boolean } {
  return {
    running: mainTask !== null,
    autoUpdate: isAutoUpdateEnabled(),
  };
}

// 兼容旧接口
export const startScrapingSchedule = startScheduler;
export const startPredictionSchedule = () => {};
export const stopAllSchedules = stopScheduler;
