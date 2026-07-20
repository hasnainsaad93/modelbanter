export default function Loading() { return <div className="page"><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-grid">{Array.from({ length: 8 }).map((_, i) => <div className="skeleton-card" key={i} />)}</div></div>; }

