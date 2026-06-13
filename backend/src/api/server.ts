// Express 服务器配置
import express from 'express';
import cors from 'cors';
import { initDb, createTables, getDb } from '../db/schema';
import { seedData } from '../db/seed';
import { loadTrainedParams } from '../models/poisson';
import { loadElos } from '../models/elo';
import { startScheduler } from '../data/scheduler';
import { matchesRouter } from './routes/matches';
import { predictionsRouter } from './routes/predictions';
import { betsRouter } from './routes/bets';
import { oddsRouter } from './routes/odds';
import { personalRouter } from './routes/personal';
import { statsRouter } from './routes/stats';

export async function createServer(): Promise<express.Application> {
  const app = express();

  // 中间件
  app.use(cors());
  app.use(express.json());

  // 初始化数据库 (异步: 加载 sql.js WASM)
  await initDb();
  createTables();
  seedData();

  // 加载训练好的 Poisson 模型参数 (攻击/防守)
  loadTrainedParams(getDb);

  // 加载 Elo 评分到内存 (每次启动必须执行)
  loadElos(getDb);

  // 定时任务已禁用，统一使用仪表盘「手动更新」按钮
  // startScheduler();

  // API 路由
  app.use('/api/matches', matchesRouter);
  app.use('/api/predictions', predictionsRouter);
  app.use('/api/bets', betsRouter);
  app.use('/api/odds', oddsRouter);
  app.use('/api/my-bets', personalRouter);
  app.use('/api/stats', statsRouter);

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}
