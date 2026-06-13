// 下载历史比赛数据脚本
// 数据来源: martj42/international_results (GitHub)
// 49,000+ 场国际比赛 (1872–2024)
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', 'data', 'historical');
const REPO_URL = 'https://github.com/martj42/international_results.git';

async function downloadData() {
  console.log('[数据下载] 开始下载国际比赛历史数据...');
  console.log(`[数据下载] 目标目录: ${DATA_DIR}`);

  // 确保目录存在
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 检查是否已下载
  const resultsPath = path.join(DATA_DIR, 'results.csv');
  if (fs.existsSync(resultsPath)) {
    console.log('[数据下载] results.csv 已存在，跳过下载');
    console.log('[数据下载] 如需重新下载，请删除 data/historical/ 目录后重试');
    return;
  }

  try {
    // 使用 sparse checkout 只拉取 CSV 文件
    const tempDir = path.join(DATA_DIR, '_temp');
    console.log('[数据下载] 克隆仓库 (sparse checkout)...');
    execSync(
      `git clone --depth 1 --filter=blob:none --sparse ${REPO_URL} ${tempDir}`,
      { stdio: 'inherit' }
    );

    // 只 checkout CSV 文件
    execSync('git sparse-checkout set "*.csv"', {
      cwd: tempDir,
      stdio: 'inherit',
    });
    execSync('git checkout', { cwd: tempDir, stdio: 'inherit' });

    // 移动 CSV 文件到 historical 目录
    const csvFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.csv'));
    for (const file of csvFiles) {
      fs.renameSync(path.join(tempDir, file), path.join(DATA_DIR, file));
    }

    // 清理临时目录
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`[数据下载] 完成! 下载了 ${csvFiles.length} 个文件: ${csvFiles.join(', ')}`);
  } catch (err) {
    console.error('[数据下载] 下载失败:', err);
    console.log('[数据下载] 备选方案: 手动下载 https://raw.githubusercontent.com/martj42/international_results/master/results.csv');
    console.log(`[数据下载] 放置到: ${resultsPath}`);
  }
}

downloadData();
