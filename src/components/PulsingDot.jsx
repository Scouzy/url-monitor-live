export default function PulsingDot({ color, checking }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
      {checking && (
        <span style={{
          position: "absolute", inset: -3, borderRadius: "50%", backgroundColor: color, opacity: 0.4,
          animation: "ping 1s cubic-bezier(0,0,0.2,1) infinite",
        }} />
      )}
      <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color, display: "block" }} />
    </span>
  );
}
