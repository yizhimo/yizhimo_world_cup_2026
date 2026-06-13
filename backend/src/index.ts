// 后端入口
import { createServer } from './api/server';
import { startScrapingSchedule, startPredictionSchedule } from './data/scheduler';

const PORT = process.env.PORT || 3001;

async function main() {
  const app = await createServer();

  app.listen(PORT, () => {
    console.log('========================================');
    console.log('  2026 世界杯投注预测系统 — 后端服务');
    console.log('========================================');
    console.log(`  API 地址: http://localhost:${PORT}/api`);
    console.log(`  健康检查: http://localhost:${PORT}/api/health`);
    console.log('========================================');

    if (process.env.ENABLE_SCHEDULER === 'true') {
      startScrapingSchedule();
      startPredictionSchedule();
    }
  });
}

main().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});
