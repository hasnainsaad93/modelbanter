import Link from "next/link";
export default function NotFound() { return <div className="error-state"><h1>Model not found.</h1><p>This model isn’t in the catalog.</p><Link href="/">Back to all models</Link></div>; }
