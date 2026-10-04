"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="error-state"><h1>Something went wrong.</h1><p>Please try loading the data again.</p><button onClick={reset}>Try again</button></div>; }
