// 统计页面
import { useEffect, useState } from 'react';
import { apiGet, teamDisplay } from '@/lib/utils';

interface StatsOverview {
  currentBankroll: number; initialBankroll: number; profit: number; roi: number;
  totalBets: number; wins: number; losses: number; pushes: number; pending: number;
  winRate: number; avgOdds: number; avgStake: number; totalStaked: number;
}

interface EloTeam { name: string; elo_rating: number; confederation: string; }

export function Stats() {
  const [stats, setStats] = useState<StatsOverview | null>(null);
  const [eloRanking, setEloRanking] = useState<EloTeam[]>([]);

  useEffect(() => {
    apiGet<{ data: StatsOverview }>('/stats/overview').then(r => setStats(r.data));
    apiGet<{ data: EloTeam[] }>('/stats/elo-ranking').then(r => setEloRanking(r.data));
  }, []);

  const confedColors: Record<string, string> = {
    UEFA: 'bg-blue-100 text-blue-700', CONMEBOL: 'bg-green-100 text-green-700',
    CONCACAF: 'bg-orange-100 text-orange-700', CAF: 'bg-yellow-100 text-yellow-700',
    AFC: 'bg-red-100 text-red-700', OFC: 'bg-purple-100 text-purple-700',
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">数据统计</h2>

      {/* 概览 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">命中率</p>
          <p className="text-2xl font-bold mt-1">{stats ? (stats.winRate*100).toFixed(0)+'%' : '—'}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">ROI</p>
          <p className={`text-2xl font-bold mt-1 ${(stats?.roi??0)>=0?'text-success':'text-danger'}`}>
            {stats ? (stats.roi>=0?'+':'')+stats.roi.toFixed(1)+'%' : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">平均赔率</p>
          <p className="text-2xl font-bold mt-1">{stats?.avgOdds?.toFixed(2) ?? '—'}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border text-center">
          <p className="text-xs text-gray-500">总投入</p>
          <p className="text-2xl font-bold mt-1">¥{stats?.totalStaked?.toFixed(0) ?? '0'}</p>
        </div>
      </div>

      {/* Elo 排名 */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <h3 className="font-semibold p-4 border-b">球队 Elo 排名</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500">
              <th className="py-2 px-4 w-12">#</th>
              <th className="py-2 px-4">球队</th>
              <th className="py-2 px-4">大洲</th>
              <th className="py-2 px-4 text-right">Elo</th>
            </tr>
          </thead>
          <tbody>
            {eloRanking.map((t, i) => (
              <tr key={t.name} className="border-t hover:bg-gray-50">
                <td className="py-2 px-4 text-gray-400">{i + 1}</td>
                <td className="py-2 px-4 font-medium">{teamDisplay(t.name)}</td>
                <td className="py-2 px-4">
                  <span className={`px-2 py-0.5 rounded text-xs ${confedColors[t.confederation] ?? 'bg-gray-100'}`}>
                    {t.confederation}
                  </span>
                </td>
                <td className="py-2 px-4 text-right font-mono">{t.elo_rating}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
