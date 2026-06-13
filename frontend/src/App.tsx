import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Stats } from './pages/Stats';
import { Settings } from './pages/Settings';
import { MyBets } from './pages/MyBets';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<MyBets />} />
        <Route path="/my-bets" element={<MyBets />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
