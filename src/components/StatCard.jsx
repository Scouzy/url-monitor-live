export default function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center",
      gap: 14, flex: 1, minWidth: 180,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center",
        justifyContent: "center", background: `${accent}18`, color: accent,
      }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{
          fontSize: 11, color: "#9CA3AF", letterSpacing: "0.05em",
          textTransform: "uppercase", marginBottom: 2,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 22, fontWeight: 700, color: "#F3F4F6",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}
