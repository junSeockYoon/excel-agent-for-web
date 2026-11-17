import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { chartDataFromStructured } from '../utils/chartData.js';

const COLORS = ['#0fbf8a', '#13233a', '#ff6b3d', '#3d7dff', '#7c5cbf', '#e0a100'];

export { chartDataFromStructured };

export default function MiniStructuredChart({ structured }) {
  const data = chartDataFromStructured(structured);
  if (!data?.length) return null;
  if (!data.some((d) => d.value > 0)) return null;

  return (
    <div className="mini-chart" aria-label="답변 차트">
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" hide />
          <YAxis allowDecimals={false} width={24} tick={{ fontSize: 10 }} />
          <Tooltip
            formatter={(v) => [v, '값']}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="value" radius={[5, 5, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
