import Link from "next/link";
export function DataError() { return <div className="error-state"><h1>We couldn’t load the data.</h1><p>The database may be temporarily unavailable. Please try again shortly.</p><Link href="/">Try again</Link></div>; }
export function InvalidFilters() { return <div className="error-state"><h1>These filters aren’t valid.</h1><p>Return to the overview to choose a time period and model.</p><Link href="/">Reset filters</Link></div>; }
