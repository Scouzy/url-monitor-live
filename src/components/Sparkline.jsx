import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export default function Sparkline({ data, color }) {
  if (!data || data.length < 2) {
    return (
      <div style={{
        width: "100%", height: 40, display: "flex", alignItems: "center",
        justifyContent: "center", color: "#4B5563", fontSize: 11,
      }}>
        En attente de données...
      </div>
    );
  }
  const chartData = data.map((v, i) => ({ i, v: typeof v === "object" ? (v.rt ?? 0) : v }));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <YAxis domain={["dataMin", "dataMax"]} hide />
        <Line
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
