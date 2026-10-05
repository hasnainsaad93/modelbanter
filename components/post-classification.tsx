import { ChevronDown } from "lucide-react";
import type { PostData } from "@/lib/analytics/data";

type PostItem = PostData["items"][number];
const names: Record<string, string> = { POSITIVE: "Positive", NEGATIVE: "Negative", NEUTRAL: "Neutral", MIXED: "Mixed", NOT_DISCUSSED: "Not discussed", CANNOT_DETERMINE: "Cannot determine" };
const confidence = (value: number | null) => value === null ? "Not saved" : `${(value * 100).toFixed(1)}%`;
const meanings: Record<string, string> = {
  POSITIVE: "Praise, endorsement, or a favorable opinion about the model in this dimension.",
  NEGATIVE: "Criticism, disappointment, or an unfavorable opinion about the model in this dimension.",
  NEUTRAL: "The model is discussed in this dimension without a clear positive or negative opinion.",
  MIXED: "Both benefits and drawbacks are expressed about the same model in this dimension.",
  NOT_DISCUSSED: "This dimension is not discussed for the model.",
  CANNOT_DETERMINE: "A relevant judgment is present, but its meaning or direction cannot be resolved from the available evidence.",
};

export function PostClassification({ item }: { item: PostItem }) {
  const { classification } = item;
  return <details className="post-classification">
    <summary>Jev classification details <ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="classification-content">
      <div className="classification-heading"><strong>{classification.focus}: {names[item.sentiment]}</strong><span>{confidence(item.confidence)} confidence</span></div>
      <p className="classification-meaning">{meanings[item.sentiment]}</p>
      <p className="classification-note">Confidence is Jev’s estimate, not verified accuracy. These are the saved classification results; Jev does not provide a written explanation for this post.</p>
      <div className="probability-heading">{classification.focus} label probabilities</div>
      {classification.probabilities.length ? <dl className="classification-probabilities">{classification.probabilities.map(entry => <div key={entry.sentiment} className={entry.sentiment === item.sentiment ? "chosen-probability" : ""}>
        <dt>{names[entry.sentiment]}</dt><dd><span className="probability-track" aria-hidden="true"><i className={entry.sentiment.toLowerCase()} style={{ width: `${entry.probability * 100}%` }} /></span><span>{confidence(entry.probability)}</span></dd>
      </div>)}</dl> : <p className="classification-note">Label probabilities were not saved for this result.</p>}
      <table className="classification-table"><caption>Jev’s category decisions</caption><thead><tr><th scope="col">Dimension</th><th scope="col">Sentiment</th><th scope="col">Confidence</th></tr></thead><tbody>{classification.decisions.map(decision => <tr key={decision.category} className={decision.name === classification.focus ? "selected-decision" : ""}><th scope="row">{decision.name}</th><td>{decision.sentiment ? names[decision.sentiment] : "Not saved"}</td><td>{confidence(decision.confidence)}</td></tr>)}</tbody></table>
      <div className="classification-relevance"><span>Refers to {item.model.name}</span><strong>{classification.relevance ? `${classification.relevance.choice === "YES" ? "Yes" : classification.relevance.choice === "NO" ? "No" : "Unclear"} · ${confidence(classification.relevance.confidence)} confidence` : "Not saved"}</strong></div>
      <div className="classification-meta"><span>{item.analysisVersion}</span><span>Classified {new Date(classification.analyzedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · UTC</span></div>
    </div>
  </details>;
}
