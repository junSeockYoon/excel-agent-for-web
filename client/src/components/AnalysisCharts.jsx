import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client.js';

const COLORS = ['#0fbf8a', '#13233a', '#ff6b3d', '#3d7dff', '#7c5cbf', '#e0a100', '#2a9d8f', '#6b7c93'];

function ChartCard({ chart }) {
  const data = chart.items || [];
  const usePie = chart.chartType === 'pie' && data.length <= 5;

  return (
    <div className="analysis-chart">
      <div className="analysis-chart-head">
        <h3>{chart.header}</h3>
        <span>상위 {data.length} · 고유 {chart.totalDistinct}</span>
      </div>
      <div className="analysis-chart-body">
        <ResponsiveContainer width="100%" height={160}>
          {usePie ? (
            <PieChart>
              <Pie
                data={data}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={58}
                innerRadius={28}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => [`${value}건`, name]}
                contentStyle={{ borderRadius: 10, border: '1px solid rgba(19,35,58,0.12)' }}
              />
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(19,35,58,0.08)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#6b7c93' }}
                interval={0}
                angle={data.length > 4 ? -20 : 0}
                textAnchor={data.length > 4 ? 'end' : 'middle'}
                height={data.length > 4 ? 48 : 28}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7c93' }} width={28} />
              <Tooltip
                formatter={(value) => [`${value}건`, '건수']}
                labelFormatter={(label) => String(label)}
                contentStyle={{ borderRadius: 10, border: '1px solid rgba(19,35,58,0.12)' }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AnalysisCharts({ sheetId, sessionId }) {
  const [charts, setCharts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!sheetId || !sessionId) {
        setCharts([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await api.getDistributions(sheetId);
        if (!cancelled) setCharts(data.charts || []);
      } catch (err) {
        if (!cancelled) {
          setCharts([]);
          setError(err.message || '분포를 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetId, sessionId]);

  const title = useMemo(() => {
    if (!charts.length) return '분석 차트';
    return `분포 미리보기 · ${charts.map((c) => c.header).join(' · ')}`;
  }, [charts]);

  if (!sheetId) return null;
  if (!loading && !error && charts.length === 0) return null;

  return (
    <section className="analysis-strip" aria-label="시트 분포 분석">
      <div className="analysis-strip-head">
        <p className="analysis-kicker">Analysis</p>
        <h2>{title}</h2>
        {loading ? <span className="loading-dot">차트 준비 중</span> : null}
      </div>
      {error ? <div className="error-banner banner-inline">{error}</div> : null}
      {charts.length ? (
        <div className="analysis-grid">
          {charts.map((chart) => (
            <ChartCard key={chart.key} chart={chart} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
