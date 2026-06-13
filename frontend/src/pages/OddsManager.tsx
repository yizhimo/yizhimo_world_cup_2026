// 赔率管理页
import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/utils';

interface Match {
  match_id: string; team_a: string; team_b: string; kickoff_time: string; stage: string;
}

interface OddsEntry {
  matchId: string; source: string;
  homeOdds: number; drawOdds: number; awayOdds: number;
}

export function OddsManager() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [oddsInputs, setOddsInputs] = useState<OddsEntry[]>([]);
  const [source, setSource] = useState('china_lottery');
  const [message, setMessage] = useState('');

  useEffect(() => {
    apiGet<{ data: Match[] }>('/matches?status=upcoming&stage=group').then(r => {
      setMatches(r.data.slice(0, 20));
    });
  }, []);

  const addOddsRow = (matchId: string, teamA: string, teamB: string) => {
    if (oddsInputs.find(o => o.matchId === matchId)) return;
    setOddsInputs([...oddsInputs, {
      matchId, source,
      homeOdds: 1.50, drawOdds: 3.50, awayOdds: 5.00,
    }]);
  };

  const updateOdds = (matchId: string, field: 'homeOdds' | 'drawOdds' | 'awayOdds', value: number) => {
    setOddsInputs(oddsInputs.map(o => o.matchId === matchId ? { ...o, [field]: value } : o));
  };

  const removeOddsRow = (matchId: string) => {
    setOddsInputs(oddsInputs.filter(o => o.matchId !== matchId));
  };

  const submitOdds = async () => {
    const inputs = oddsInputs.map(o => ({
      matchId: o.matchId,
      source: source || 'manual',
      homeOdds: Number(o.homeOdds),
      drawOdds: Number(o.drawOdds),
      awayOdds: Number(o.awayOdds),
    }));

    try {
      const r = await apiPost<{ data: any }>('/odds/batch', { inputs });
      setMessage(`保存成功: ${r.data.success} 条, 失败: ${r.data.errors.length}`);
      if (r.data.success > 0) setOddsInputs([]);
    } catch {
      setMessage('保存失败');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">赔率管理</h2>

      {message && (
        <div className="mb-4 px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm">{message}</div>
      )}

      {/* 赔率源选择 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border mb-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">赔率来源:</span>
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="china_lottery">中国体育彩票</option>
            <option value="pinnacle">Pinnacle</option>
            <option value="bet365">Bet365</option>
            <option value="manual">手动输入</option>
          </select>
          <button
            onClick={submitOdds}
            disabled={oddsInputs.length === 0}
            className="px-4 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
          >
            批量保存 ({oddsInputs.length})
          </button>
          <span className="text-xs text-gray-400">
            输入赔率后点击保存，系统自动计算隐含概率、抽水和价值
          </span>
        </div>
      </div>

      {/* 比赛列表 + 赔率输入 */}
      <div className="space-y-2">
        {matches.map(m => {
          const input = oddsInputs.find(o => o.matchId === m.match_id);
          return (
            <div key={m.match_id} className="bg-white rounded-lg p-4 shadow-sm border">
              <div className="flex items-center gap-4">
                <div className="w-20 text-xs text-gray-500">
                  <span>{m.match_id}</span>
                  <div>{new Date(m.kickoff_time).toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' })}</div>
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <span className="font-medium w-24 text-right">{m.team_a}</span>
                  <span className="text-gray-400">vs</span>
                  <span className="font-medium w-24">{m.team_b}</span>
                </div>

                {input ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number" step="0.01" min="1.01"
                      value={input.homeOdds}
                      onChange={e => updateOdds(m.match_id, 'homeOdds', parseFloat(e.target.value))}
                      className="w-20 border rounded px-2 py-1 text-sm text-center"
                      placeholder="主胜"
                    />
                    <input
                      type="number" step="0.01" min="1.01"
                      value={input.drawOdds}
                      onChange={e => updateOdds(m.match_id, 'drawOdds', parseFloat(e.target.value))}
                      className="w-20 border rounded px-2 py-1 text-sm text-center"
                      placeholder="平"
                    />
                    <input
                      type="number" step="0.01" min="1.01"
                      value={input.awayOdds}
                      onChange={e => updateOdds(m.match_id, 'awayOdds', parseFloat(e.target.value))}
                      className="w-20 border rounded px-2 py-1 text-sm text-center"
                      placeholder="客胜"
                    />
                    <button onClick={() => removeOddsRow(m.match_id)} className="text-xs text-red-500">×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => addOddsRow(m.match_id, m.team_a, m.team_b)}
                    className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50"
                  >
                    + 输入赔率
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
