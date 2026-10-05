import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = "ModelBanter — The conversation around AI.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#f8f9f5", color: "#202a24", padding: "58px 72px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #dce3d8", paddingBottom: 28 }}>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>modelbanter<span style={{ color: "#32815b" }}>.</span></div>
        <div style={{ fontSize: 20, color: "#778174" }}>modelbanter.com</div>
      </div>
      <div style={{ display: "flex", marginTop: 70, fontSize: 15, letterSpacing: 3, color: "#778174" }}>PUBLIC PERCEPTION / AI MODELS</div>
      <div style={{ display: "flex", marginTop: 20, maxWidth: 980, fontSize: 68, lineHeight: 1.12, letterSpacing: -3, fontWeight: 700 }}>{site.tagline}</div>
      <div style={{ display: "flex", marginTop: 24, fontSize: 26, color: "#697466" }}>Praise. Criticism. The posts behind it.</div>
      <div style={{ display: "flex", gap: 16, marginTop: "auto" }}>
        {["Reasoning", "Speed", "Cost", "Coding"].map(label => <div key={label} style={{ display: "flex", padding: "12px 22px", background: "#edf2e8", border: "1px solid #dce3d8", borderRadius: 8, fontSize: 19, color: "#32815b" }}>{label}</div>)}
      </div>
    </div>,
    size,
  );
}
