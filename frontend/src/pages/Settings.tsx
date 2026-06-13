// 设置页面
import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/utils';

export function Settings() {
  const [config, setConfig] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [apiUsage, setApiUsage] = useState<{
    requestsRemaining: number; requestsUsed: number; monthlyLimit: number; lastUpdated: number | null;
  } | null>(null);

  useEffect(() => {
    apiGet<{ data: Record<string, string> }>('/stats/config').then(r => setConfig(r.data));
    apiGet<{ data: { requestsRemaining: number; requestsUsed: number; monthlyLimit: number; lastUpdated: number | null } }>('/odds/api-usage')
      .then(r => setApiUsage(r.data))
      .catch(() => {});
  }, []);

  const update = (key: string, value: string) => {
    setConfig({ ...config, [key]: value });
    setSaved(false);
  };

  const save = async () => {
    await apiPut('/stats/config', config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fields = [
    { key: 'odds_api_key', label: 'Odds API Key', type: 'text', description: 'the-odds-api.com 免费 Key (500次/月)' },
    { key: 'initial_bankroll', label: '初始资金', type: 'number', description: '系统初始本金 (元)' },
    { key: 'kelly_fraction', label: 'Kelly 系数', type: 'number', step: '0.05', description: '风险系数 (0.25 = 1/4 Kelly)' },
    { key: 'value_threshold', label: '价值阈值', type: 'number', step: '0.01', description: '价值优势最低要求 (0.05 = 5%)' },
    { key: 'max_stake_pct', label: '单场上限', type: 'number', step: '0.01', description: '单场最大投注比例 (0.15 = 15%余额)' },
    { key: 'streak_loss_limit', label: '连亏警告', type: 'number', description: '连续亏损多少次触发降级' },
    { key: 'streak_critical_limit', label: '紧急暂停', type: 'number', description: '连续亏损多少次触发暂停' },
    { key: 'poisson_weight', label: 'Poisson 权重', type: 'number', step: '0.05', description: 'Poisson 模型在融合中的权重' },
    { key: 'elo_weight', label: 'Elo 权重', type: 'number', step: '0.05', description: 'Elo 模型在融合中的权重' },
    { key: 'market_weight', label: '市场权重', type: 'number', step: '0.05', description: '市场共识在融合中的权重' },
  ];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">策略设置</h2>
        <button
          onClick={save}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700"
        >
          {saved ? '已保存 ✓' : '保存设置'}
        </button>
      </div>

      {/* API 使用额度 */}
      {apiUsage && apiUsage.requestsUsed > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-4">
          <p className="font-medium mb-2">The-Odds-API 免费额度</p>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-primary-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (apiUsage.requestsUsed / apiUsage.monthlyLimit) * 100)}%` }}
              />
            </div>
            <span className="text-gray-500 whitespace-nowrap">
              已用 {apiUsage.requestsUsed} / {apiUsage.monthlyLimit} 次 · 剩余 {apiUsage.requestsRemaining}
            </span>
          </div>
          {apiUsage.lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              上次更新: {new Date(apiUsage.lastUpdated).toLocaleString('zh-CN')}
            </p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border divide-y">
        {fields.map(f => (
          <div key={f.key} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{f.label}</p>
              <p className="text-xs text-gray-400">{f.description}</p>
            </div>
            <input
              type={f.type ?? 'number'}
              step={f.type === 'number' ? (f.step ?? '1') : undefined}
              value={config[f.key] ?? ''}
              onChange={e => update(f.key, e.target.value)}
              className={f.type === 'text' ? 'w-48 border rounded-lg px-3 py-2 text-sm' : 'w-24 border rounded-lg px-3 py-2 text-sm text-right'}
            />
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800 font-medium">注意事项</p>
        <ul className="mt-2 text-xs text-yellow-700 space-y-1">
          <li>• 赔率更新请通过仪表盘的「手动更新」按钮触发</li>
          <li>• The-Odds-API 免费层每月 500 次请求，请合理使用</li>
          <li>• 修改权重后需要重新手动更新</li>
          <li>• Kelly 系数越小越保守，0.25 是常用值</li>
          <li>• 价值阈值越高越谨慎，但投注机会减少</li>
          <li>• 三个模型权重之和应接近 1.0</li>
        </ul>
      </div>
    </div>
  );
}
