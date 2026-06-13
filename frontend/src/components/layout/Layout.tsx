import { Outlet, NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { LineChart, Settings, Wallet } from 'lucide-react';

const navItems = [
  { to: '/my-bets', icon: Wallet, label: '我的投注' },
  { to: '/stats', icon: LineChart, label: '统计' },
  { to: '/settings', icon: Settings, label: '设置' },
];

export function Layout() {
  return (
    <div className="min-h-screen flex">
      <aside className="w-48 bg-gray-900 text-white flex flex-col fixed inset-y-0 left-0 z-50">
        <div className="px-4 py-4 border-b border-gray-800">
          <h1 className="text-base font-bold tracking-tight">2026世界杯</h1>
          <p className="text-[10px] text-gray-400 mt-0.5">投注预测系统</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1 ml-48 p-6 min-h-screen bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
