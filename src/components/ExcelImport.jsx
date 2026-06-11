import { useRef, useState } from "react";
import { FileSpreadsheet, Upload, X, CheckCircle } from "lucide-react";
import * as XLSX from "xlsx";

export default function ExcelImport({ onImport }) {
  const inputRef = useRef(null);
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const urls = rows
        .flat()
        .map(c => (typeof c === "string" ? c.trim() : ""))
        .filter(c => /^https?:\/\//i.test(c));
      if (urls.length > 0) {
        onImport(urls);
        setResult({ count: urls.length, name: file.name });
        setTimeout(() => setResult(null), 4000);
      } else {
        setResult({ error: "Aucune URL trouvée dans le fichier." });
        setTimeout(() => setResult(null), 4000);
      }
    } catch {
      setResult({ error: "Erreur lors de la lecture du fichier." });
      setTimeout(() => setResult(null), 4000);
    }
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
      <button
        onClick={() => inputRef.current?.click()}
        style={{
          display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9,
          background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)",
          color: "#34D399", fontSize: 12, fontWeight: 600, cursor: "pointer",
          transition: "background 0.2s, border-color 0.2s",
          whiteSpace: "nowrap",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(52,211,153,0.15)"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.4)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(52,211,153,0.08)"; e.currentTarget.style.borderColor = "rgba(52,211,153,0.2)"; }}
        title="Importer depuis Excel (.xlsx, .xls, .csv)"
      >
        <FileSpreadsheet size={15} /> Importer Excel
      </button>

      {result && !result.error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 8,
          background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)",
          color: "#34D399", fontSize: 12, animation: "fadeIn 0.2s ease",
        }}>
          <CheckCircle size={13} />
          {result.count} URL{result.count > 1 ? "s" : ""} importée{result.count > 1 ? "s" : ""}
        </div>
      )}

      {result?.error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 12px", borderRadius: 8,
          background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)",
          color: "#F87171", fontSize: 12,
        }}>
          <X size={13} /> {result.error}
        </div>
      )}
    </div>
  );
}
