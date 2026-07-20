import { ArrowDownRight, ArrowUpRight, CircleMinus } from "lucide-react";
import type { Sentiment } from "@/lib/types";
import { clsx } from "clsx";

export function DemoBadge() { return <span className="demo-badge"><span />Demo data</span>; }
export function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div>; }
export function Delta({ value, suffix = "%" }: { value: number; suffix?: string }) { return <span className={clsx("delta", value > 0 ? "up" : value < 0 ? "down" : "flat")}>{value > 0 ? <ArrowUpRight /> : value < 0 ? <ArrowDownRight /> : <CircleMinus />}{Math.abs(value)}{suffix}</span>; }
export function SentimentPill({ sentiment }: { sentiment: Sentiment }) { return <span className={`sentiment-pill ${sentiment}`}><span />{sentiment}</span>; }
export function Avatar({ name }: { name: string }) { return <span className="avatar">{name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>; }
export function NumberValue({ children }: { children: React.ReactNode }) { return <span className="number-value">{children}</span>; }

