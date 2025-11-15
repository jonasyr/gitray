import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';

const COLORS = {
  TypeScript: '#5B9A8B',
  Go: '#FFA69E',
  Python: '#2E073F',
  JSON: '#7DB9A5',
  Other: '#FFB8B1',
};

const data = [
  { name: 'TypeScript', value: 48, color: COLORS.TypeScript },
  { name: 'Go', value: 22, color: COLORS.Go },
  { name: 'Python', value: 18, color: COLORS.Python },
  { name: 'JSON', value: 7, color: COLORS.JSON },
  { name: 'Other', value: 5, color: COLORS.Other },
];

export function FileDistributionChart() {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                    <p className="text-sm">
                      {payload[0].name}:{' '}
                      <span className="font-semibold">{payload[0].value}%</span>
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            formatter={(value, entry: any) => (
              <span className="text-sm text-foreground">
                {value} ({entry.payload.value}%)
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
