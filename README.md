# 2026 世界杯投注预测系统

基于统计学模型（Poisson 回归 + Dixon-Coles + Elo）的 2026 世界杯投注预测系统。初始本金 **¥2,000**，通过价值投注 + Kelly 资金管理追求正期望收益。

## 快速启动

```bash
# 1. 后端（端口 3001）
cd wc-predictor/backend
npm install
npm run dev

# 2. 前端（端口 5173）
cd wc-predictor/frontend
npm install
npm run dev
```

启动后访问：
- 前端界面：`http://localhost:5173`
- 后端 API：`http://localhost:3001/api`

## 技术栈

| 层 | 选型 |
|---|---|
| 语言 | TypeScript (全栈) |
| 后端框架 | Express.js |
| 前端框架 | React 18 + Vite 4 + React Router v6 |
| UI | Tailwind CSS + Radix UI + Lucide Icons |
| 图表 | Recharts |
| 数据库 | SQLite (sql.js，纯 JS/WASM，零编译) |
| 爬虫 | cheerio + axios + iconv-lite (500.com GB2312) |
| 赔率 API | The-Odds-API (免费 500 req/month) |
| 定时任务 | node-cron |

## 项目结构

```
wc-predictor/
├── backend/
│   ├── src/
│   │   ├── models/        # Poisson + Dixon-Coles + Elo + 融合引擎
│   │   ├── betting/       # Kelly 公式 + 价值检测 + 资金管理 + 风控
│   │   ├── data/          # 数据加载 + 赔率爬虫 + 定时调度
│   │   ├── tracker/       # 投注记录 + 统计报表
│   │   ├── api/routes/    # 6 组 API (matches/predictions/bets/odds/personal/stats)
│   │   ├── db/            # sql.js 包装器 + 表结构 + 种子数据
│   │   └── utils/         # 球队映射 + 格式化
│   ├── scripts/           # 数据下载/赛程生成/模型训练/回测/赔率爬取
│   └── data/              # historical/results.csv + wc-predictor.db
├── frontend/
│   └── src/
│       ├── pages/         # 8 个页面（MyBets/Stats/Settings 已接入路由）
│       ├── components/    # 布局组件
│       └── lib/           # API 客户端 + 工具函数
├── project.md             # 详细设计文档
└── README.md
```

## 已完成功能

| 模块 | 状态 | 说明 |
|------|------|------|
| 数据库 | ✅ | sql.js，7 张表，48 队 + 104 场赛程已入库 |
| Poisson 模型 | ✅ | 预期进球 + 比分概率矩阵 (0:0→5:5) + Dixon-Coles τ 修正 |
| Elo 模型 | ✅ | 48 队完整评分，三值概率拆分，赛后自动更新 |
| 模型训练 | ✅ | 11,726 场数据 MLE 训练，攻击/防守参数已优化 |
| 预测引擎 | ✅ | 三模型融合 (Poisson 25% + Elo 45% + 市场 30%) |
| 赔率系统 | ✅ | The-Odds-API + 500.com 爬虫 + 手动输入 |
| 投注策略 | ✅ | Kelly 公式 + 价值检测 + 动态资金管理 |
| 风险控制 | ✅ | 连亏降级 + 最大回撤检测 + 余额分段策略 |
| 回测 | ✅ | 2018+2022 世界杯淘汰赛 30 场，准确率 56.7% |
| 前端界面 | ✅ | 8 个页面，MyBets/Stats/Settings 已接入路由 |
| 个人投注助手 | ✅ | ¥2,000 预算按轮次推进，风险提示，一键结算 |

## 预测模型

```
最终概率 = Poisson × 0.25 + Elo × 0.45 + 市场隐含概率 × 0.30
```

三模型融合：Poisson 回归（历史攻防参数）+ Elo 评分（近期状态）+ 市场赔率（共识锚定）。权重可通过 Settings 页面调整。

### 模型训练参数

| 参数 | 训练值 |
|------|--------|
| 联赛平均进球 (μ) | 1.3576 |
| 主场优势 (γ) | 1.6319 |
| Dixon-Coles ρ | -0.08 |
| 训练数据 | 11,726 场 (2014–2024) |
| 时间衰减 (ξ) | 0.003/day |

## 脚本命令

```bash
# 下载历史比赛数据 (49,000+ 场)
npm run download-data

# 生成 2026 世界杯赛程 (104 场)
npx tsx scripts/generate-schedule.ts

# 初始化 Elo 评分数据
npx tsx scripts/seed-elos.ts

# 训练 Poisson 模型参数
npx tsx scripts/train-model.ts

# 爬取 500.com 竞彩赔率
npx tsx scripts/scrape-500.ts

# 手动触发完整更新 (赔率 → 预测 → 建议)
npm run update-all

# 回测验证 (2018 + 2022 世界杯)
npm run backtest
```

## 投注策略参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| Kelly 系数 | 0.25 (1/4) | 保守防止重大亏损 |
| 价值阈值 | 5% | 模型概率需高于隐含概率 5% |
| 单场上限 | 15% 余额 | 单笔最大投注占比 |
| 连亏保护 | 3 次降级，5 次暂停 | 自动风控 |
| 初始本金 | ¥2,000 | 可通过 Settings 调整 |

## 数据来源

- **历史比赛**：[martj42/international_results](https://github.com/martj42/international_results) — 49,000+ 场 (1872–2024)
- **Elo 评分**：[eloratings.net](https://eloratings.net) — 公认比 FIFA 排名更准确
- **赛程**：FIFA 官网 — 48 队 104 场 (2026/6/11–7/19)
- **赔率**：The-Odds-API + [500.com](https://trade.500.com/jczq/) 爬虫 + 手动输入

## 后续计划

- [ ] 接入 Dashboard、Matches、MatchDetail 等剩余页面路由
- [ ] 前端图表完善（资金曲线、比分概率热力图）
- [ ] 球员数据（伤病、身价等）
- [ ] 更多投注玩法（让球盘、大小球）
- [ ] 真实赛果自动抓取（赛后自动结算）

## 风险提示

体育博彩存在固有风险，任何模型都无法保证盈利。本项目仅供学习研究使用。详细设计见 [project.md](project.md)。
