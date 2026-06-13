// 手动触发完整更新 (赔率 → 预测 → 建议)
// 用途: 在获取 API Key 后首次运行，或手动刷新数据
import { initDb, createTables, getDb } from '../src/db/schema';
import { loadTrainedParams } from '../src/models/poisson';
import { runFullUpdate } from '../src/data/scheduler';

async function main() {
  await initDb();
  createTables();
  loadTrainedParams(getDb);

  console.log('手动触发完整更新...\n');
  const result = await runFullUpdate();

  console.log('\n========== 更新结果 ==========');
  console.log(`赔率更新: ${result.oddsUpdated} 条`);
  console.log(`预测生成: ${result.predictionsGenerated} 场`);
  console.log(`价值投注: ${result.adviceCount} 场`);
  if (result.error) console.log(`错误: ${result.error}`);
  console.log('==============================\n');
}

main().catch(console.error);
