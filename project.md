# 2026 世界杯投注预测系统

## 项目概述

一个基于统计学模型的 2026 世界杯投注预测系统。初始本金 **¥2,000**，目标是通过价值投注 + 资金管理实现正期望收益。系统提供 **Web 网页界面**，本地运行，支持**多赔率来源**（API 爬取 + 手动输入）。

**诚实声明**：体育博彩不存在稳赚策略。本系统的目标是：
1. 用统计学方法识别被低估的赔率（正期望值投注）
2. 用严格资金管理防止重大亏损
3. 全流程可追溯、可复盘
4. 追求的是**长期正期望值**，而非保证盈利

---

## 技术栈

| 层 | 选型 | 原因 |
|---|---|---|
| 后端语言 | TypeScript (Node.js) | 前后端统一语言，类型安全 |
| 后端框架 | Express.js | 轻量，生态成熟 |
| 前端框架 | React 18 + Vite 4 | 快速开发，HMR 热更新 |
| 路由 | React Router v6 | SPA 客户端路由 |
| UI | Tailwind CSS + Radix UI + Lucide Icons | 现代风格，无头组件 |
| 图表 | Recharts | React 原生图表库 |
| 数据库 | SQLite (sql.js，纯 JS/WASM) | 零编译依赖，嵌入式，足够个人使用 |
| 定时任务 | node-cron | 定时拉取赔率更新 |
| 爬虫 | cheerio + axios + iconv-lite | HTML 解析 + HTTP 请求 + GB2312 解码 |
| 运行时 | tsx | TypeScript 直接执行，无需编译 |

> **注意**：项目计划阶段确定使用 better-sqlite3，实际实现改用 sql.js（纯 JavaScript/WASM），避免原生模块编译问题，适合跨平台开发。

---

## 项目结构

```
wc-predictor/
├── backend/
│   ├── src/
│   │   ├── models/                  # 预测模型
│   │   │   ├── elo.ts              # Elo 评分计算（48 队完整评分）
│   │   │   ├── poisson.ts          # Poisson 回归模型（核心）
│   │   │   ├── dixon-coles.ts      # Dixon-Coles 低分修正
│   │   │   └── predictor.ts        # 综合预测引擎（三模型融合）
│   │   ├── data/                   # 数据层
│   │   │   ├── loader.ts           # 历史数据加载 → SQLite
│   │   │   ├── scraper.ts          # 赔率获取（The-Odds-API）
│   │   │   ├── odds-input.ts       # 手动赔率输入处理
│   │   │   └── scheduler.ts        # 定时任务调度
│   │   ├── betting/                # 投注策略
│   │   │   ├── value.ts            # 价值投注检测 + margin 去除
│   │   │   ├── kelly.ts            # Kelly 公式
│   │   │   ├── bankroll.ts         # 动态资金管理策略
│   │   │   ├── strategy.ts         # 多赔率源综合分析
│   │   │   └── risk.ts             # 风险控制
│   │   ├── tracker/                # 投注追踪
│   │   │   ├── bet-tracker.ts      # 投注记录 CRUD
│   │   │   └── stats.ts            # 投注统计与报表
│   │   ├── api/                    # API 路由
│   │   │   ├── server.ts           # Express 应用入口
│   │   │   └── routes/
│   │   │       ├── matches.ts      # 比赛相关 API
│   │   │       ├── predictions.ts  # 预测相关 API
│   │   │       ├── bets.ts         # 投注相关 API
│   │   │       ├── odds.ts         # 赔率管理 API
│   │   │       ├── personal.ts     # 个人投注助手 API（¥2,000 预算）
│   │   │       └── stats.ts        # 统计报表 API
│   │   ├── db/                     # 数据库层
│   │   │   ├── schema.ts           # 表结构 + sql.js 包装器
│   │   │   └── seed.ts             # 初始数据填充（48 队 + 104 场赛程）
│   │   └── utils/                  # 工具函数
│   │       ├── football.ts         # 球队名称映射、48 队列表
│   │       └── format.ts           # 格式化工具
│   ├── data/
│   │   ├── historical/results.csv  # 49,000+ 场国际比赛数据
│   │   └── wc-predictor.db         # SQLite 数据库文件
│   ├── scripts/
│   │   ├── download-data.ts        # 下载历史数据
│   │   ├── generate-schedule.ts    # 生成 104 场赛程
│   │   ├── train-model.ts          # Poisson 模型参数训练（MLE）
│   │   ├── seed-elos.ts            # Elo 评分数据初始化
│   │   ├── scrape-500.ts           # 爬取 500.com 竞彩赔率
│   │   ├── update-all.ts           # 手动触发完整更新
│   │   ├── backtest.ts             # 回测脚本（2018+2022 世界杯）
│   │   ├── _check_matches.ts       # 调试：检查比赛数据
│   │   ├── _check_odds.ts          # 调试：检查赔率数据
│   │   └── _cleanup_db.ts          # 调试：清理数据库
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── layout/Layout.tsx   # 全局布局（侧边栏 + 顶部导航）
│   │   ├── pages/
│   │   │   ├── MyBets.tsx          # ★ 主页：按轮次投注（¥2,000 预算）
│   │   │   ├── Dashboard.tsx       # 仪表盘（待接入路由）
│   │   │   ├── Matches.tsx         # 比赛列表 + 预测（待接入路由）
│   │   │   ├── MatchDetail.tsx     # 单场深度分析（待接入路由）
│   │   │   ├── BetHistory.tsx      # 投注历史（待接入路由）
│   │   │   ├── OddsManager.tsx     # 赔率管理（待接入路由）
│   │   │   ├── Stats.tsx           # 统计报表
│   │   │   └── Settings.tsx        # 策略参数设置
│   │   ├── lib/
│   │   │   └── utils.ts            # API 客户端 + 工具函数
│   │   ├── App.tsx                 # 路由配置
│   │   ├── main.tsx                # 入口
│   │   └── index.css               # 全局样式 + Tailwind
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── tsconfig.json
│   └── package.json
├── README.md
└── project.md
```

---

## 数据来源

### 1. 历史比赛数据
- **来源**：[martj42/international_results](https://github.com/martj42/international_results)
- **规模**：49,000+ 场国际比赛（1872–2024）
- **字段**：日期、主队、客队、主队进球、客队进球、赛事、城市、国家、中立场地
- **获取方式**：运行 `npm run download-data`

### 2. Elo 评分
- **来源**：[eloratings.net](https://eloratings.net)
- **说明**：第三方 Elo 评分系统，公认比 FIFA 排名更准确
- **获取方式**：运行 `npx tsx scripts/seed-elos.ts`

### 3. 2026 世界杯赛程
- **来源**：FIFA 官网
- **说明**：48 队、104 场比赛（2026/6/11 – 7/19），16 组 × 3 队新赛制
- **获取方式**：运行 `npx tsx scripts/generate-schedule.ts`

### 4. 赔率数据（多源）

| 来源 | 方式 | 说明 |
|------|------|------|
| The-Odds-API | API 拉取 | 免费 500 req/month，包含 Pinnacle 等多家博彩公司赔率 |
| 500.com | 爬虫抓取 | 中国竞彩足球赔率（SPF 胜平负 + 比分），GB2312 编码 |
| 手动输入 | Web 界面 | 支持自定义赔率源，适合无法爬取的来源 |

**赔率分析流程**：
1. 爬虫/API 定时抓取（每日 09:00），存入数据库
2. 手动输入界面支持多个赔率源并行管理
3. 去除博彩 margin（overround），得到"真实"隐含概率
4. 综合多个赔率源找出最佳赔率（best odds）
5. 对比模型概率找出价值投注机会

---

## 预测模型

### 模型融合架构

```
最终概率 = Poisson × 0.25 + Elo × 0.45 + 市场隐含概率 × 0.30
```

| 模型 | 权重 | 定位 |
|------|------|------|
| Poisson (Dixon-Coles) | 25% | 基于历史数据 + 球队攻防参数 |
| Elo | 45% | 球队近期状态，积分制 |
| 市场隐含概率 | 30% | 锚定市场共识，防止模型极端偏差 |

> 权重可通过 Settings 页面调整。默认权重偏向 Elo + 市场，因 Poisson 模型在 48 队新赛制下（弱队数据稀疏）单独可靠性下降。

### Poisson 回归模型（核心）

每支球队有两个潜在参数：
- **进攻力 (α)**：球队进球能力
- **防守力 (β)**：球队防守漏洞

主队 i vs 客队 j 的预期进球：
```
λ_home = league_avg × α_i × β_j × home_advantage
λ_away = league_avg × α_j × β_i
```

比分概率：
```
P(X=x, Y=y) = Poisson(x; λ_home) × Poisson(y; λ_away)
```

胜/平/负概率聚合：
```
P(主胜) = Σ_{x>y} P(x,y)
P(平)   = Σ_{x=y} P(x,y)
P(客胜) = Σ_{x<y} P(x,y)
```

**参数估计**：时间加权最大似然估计 (MLE)，时间衰减 ξ = 0.003/day。

### 训练参数

| 参数 | 训练值 | 说明 |
|------|--------|------|
| 联赛平均进球 (μ) | 1.3576 | 每队每场平均进球 |
| 主场优势 (γ) | 1.6319 | 主场进球倍数 |
| Dixon-Coles ρ | -0.08 | 低分依赖修正 |
| 训练数据 | 11,726 场 | 2014–2024，298 队 |
| 时间衰减 (ξ) | 0.003/day | 近期比赛权重更高 |
| MLE 最大迭代 | 500 | 收敛阈值 0.01 |

### Dixon-Coles 低分修正

Poisson 模型假设两队进球独立，但实际 0-0、1-1 出现更多。引入修正参数 ρ：

```
τ(x,y) = 1 − λμρ      当 x=0, y=0  (0-0 提升)
         1 + λρ        当 x=0, y=1  (0-1 降低)
         1 + μρ        当 x=1, y=0  (1-0 降低)
         1 − ρ         当 x=1, y=1  (1-1 提升)
         1             其他比分
```

修正后概率：`P_adj(x,y) = τ(x,y) × Poisson(x;λ) × Poisson(y;μ)`

### Elo 评分系统

- 从 eloratings.net 获取 48 队初始 Elo
- K=32，主场优势 +100 Elo 分
- Elo 差值 → 概率：`P(win) = 1 / (1 + 10^(-Δ/400))`
- 赛果录入后自动更新 Elo
- 定位：作为核心特征融入模型融合，弥补 Poisson 对近期状态不敏感

---

## 投注策略

### 价值投注检测

```
价值 = 模型概率 − 赔率隐含概率
当 价值 > 5%（阈值可调）→ 标记为价值投注
只有存在正向价值时才建议投注
```

### Kelly 公式

```
f = (bp − q) / b
b = 赔率 − 1
p = 模型概率
q = 1 − p
```

- 实际使用 **1/4 Kelly**（保守防止重大亏损）
- 单场投注上限：不超过当前余额的 **15%**

### 动态资金管理

| 余额区间 | 策略 | Kelly 系数 | 最低价值阈值 |
|----------|------|------------|--------------|
| > ¥2,000（盈利） | 正常 | 1/4 Kelly | 5% |
| ¥1,500–2,000 | 保守 | 1/8 Kelly | 7% |
| ¥1,000–1,500 | 极保守 | 1/16 Kelly | 10% |
| < ¥1,000 | 生存模式 | 极小注 | 15% |

### 连亏保护

- 连续 3 次亏损：自动降一级策略
- 恢复盈利 1 次：自动恢复原策略
- 连续 5 次亏损：暂停投注，提示用户重新评估模型

---

## Web 前端

### 当前路由（已接入）

| 路由 | 页面 | 功能 |
|------|------|------|
| `/` | MyBets | ★ 主页：按轮次推进投注，¥2,000 预算管理，风险提示 |
| `/stats` | Stats | ROI、命中率、盈亏曲线、资金曲线 |
| `/settings` | Settings | 策略参数调整（Kelly 系数、价值阈值、模型权重等） |

### 已实现页面（待接入路由）

| 页面 | 功能 |
|------|------|
| Dashboard | 余额卡片、资金曲线、今日推荐、最近投注、风险状态 |
| Matches | 所有比赛列表（按日期分组）、预测概率、赔率对比、价值标记 |
| MatchDetail | 单场深度：比分概率矩阵、各模型概率、赔率对比、投注建议 |
| BetHistory | 投注历史表格、筛选（已结算/待结算/赢/输）、分页 |
| OddsManager | 赔率源管理、手动输入赔率、爬虫状态查看 |

---

## 数据库表结构

### bets 表

```sql
CREATE TABLE bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  team_a TEXT NOT NULL,
  team_b TEXT NOT NULL,
  bet_type TEXT NOT NULL,         -- '1X2' | 'correct_score'
  selection TEXT NOT NULL,         -- 'home'|'draw'|'away' 或 '2-1'
  model_prob REAL NOT NULL,        -- 模型给出的概率
  odds REAL NOT NULL,              -- 投注时赔率
  odds_source TEXT,                -- 赔率来源
  value_edge REAL,                 -- 价值优势 (%)
  stake REAL NOT NULL,             -- 投注金额
  kelly_fraction TEXT,             -- 使用的 Kelly 系数
  actual_outcome TEXT,             -- 实际结果（结算后填写）
  result TEXT,                     -- 'win'|'loss'|'push'|'pending'
  payout REAL,                     -- 派彩金额（结算后计算）
  balance_after REAL,              -- 结算后余额
  notes TEXT,                      -- 备注
  created_at TEXT DEFAULT (datetime('now')),
  settled_at TEXT
);
```

### 其他核心表

| 表名 | 说明 |
|------|------|
| `teams` | 48 支参赛队伍信息 |
| `matches` | 104 场比赛赛程 |
| `odds` | 赔率记录（多源 + 时间戳） |
| `predictions` | 每场预测结果缓存 |
| `elos` | Elo 评分历史 |
| `strategy_config` | 策略参数 + 资金状态 |

---

## 回测验证

### 回测范围
- 2018 世界杯淘汰赛 + 2022 世界杯淘汰赛，共 30 场
- 用赛前数据训练模型，预测每场比赛

### 回测结果

| 指标 | 结果 | 评估 |
|------|------|------|
| 胜平负准确率 | 56.7% | 高于盲猜 33%，较好 |
| 整体盈利 | 小额正收益 | 达到正期望目标 |

### 回测结论
- Elo 模型在淘汰赛阶段表现优于 Poisson（强队数据充分）
- 模型融合策略有效，单一模型准确率均低于融合后
- 淘汰赛平局概率被模型系统性低估（实际淘汰赛平局率更高）

---

## 后续迭代方向

- [ ] 完善前端：接入 Dashboard、Matches、MatchDetail 等页面路由
- [ ] 前端图表：资金曲线、比分概率热力图
- [ ] 加入球员层面数据（伤病、身价、阵容变化）
- [ ] 引入 xG（预期进球）数据
- [ ] 支持更多投注玩法（让球盘、大小球）
- [ ] 移动端适配（PWA）
- [ ] 实时推送（新赔率提醒、价值投注提醒）
- [ ] 真实比赛结果自动抓取（赛后结算自动化）

---

## 风险提示

1. **预测模型不能保证盈利**：体育比赛充满不确定性，任何模型都有误差
2. **48 队新赛制**：16 组 × 3 队，每队小组赛仅 2 场，数据量小可能放大模型偏差
3. **弱队数据稀疏**：部分小国历史数据少，Poisson 模型预测精度下降
4. **赔率数据时延**：API 和爬虫获取的赔率可能有时延，实际投注以彩票点为准
5. **回测局限**：回测仅覆盖淘汰赛 30 场，样本量有限
6. **初期建议小额试水**：前几轮先用小额资金验证模型表现，再逐步增加