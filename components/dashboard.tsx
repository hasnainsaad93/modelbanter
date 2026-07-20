"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Clock3, Flame, Heart, MessageCircle, Repeat2, Sparkles, Zap } from "lucide-react";
import { motion } from "motion/react";
import { MentionChart, ModelScoreChart, SentimentDonut, TrendChart } from "./charts";
import { Delta, DemoBadge, Eyebrow, NumberValue } from "./ui";
import { models, posts, summary, topicRows } from "@/lib/demo-data";

const ranges = ["24H", "7D", "30D", "ALL"];
const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };

export function Dashboard() {
  const [range, setRange] = useState("7D");
  return <div className="page dashboard-page">
    <div className="topbar"><div><DemoBadge /><span className="updated"><Clock3 />Updated 4 minutes ago</span></div><div className="range-control" aria-label="Time range">{ranges.map((item) => <button key={item} onClick={() => setRange(item)} className={range === item ? "active" : ""}>{item}</button>)}</div></div>
    <motion.header {...fade} className="page-header hero-header"><div><Eyebrow>Market intelligence / {range}</Eyebrow><h1>Read the room.<br /><span>Before it shifts.</span></h1></div><p>Real-time perception signals across the frontier model landscape, distilled from conversations on X.</p></motion.header>

    <section className="metric-grid" aria-label="Market summary">
      <motion.article {...fade} transition={{ delay: .05 }} className="metric-card metric-primary"><div><span>Posts analyzed</span><Sparkles /></div><NumberValue>{summary.total.toLocaleString()}</NumberValue><small><Delta value={12.8} /> vs previous 7 days</small></motion.article>
      <motion.article {...fade} transition={{ delay: .1 }} className="metric-card"><div><span>Last 24 hours</span><Zap /></div><NumberValue>{summary.today.toLocaleString()}</NumberValue><small>Across {models.length} tracked models</small></motion.article>
      <motion.article {...fade} transition={{ delay: .15 }} className="metric-card"><div><span>Market sentiment</span><Heart /></div><NumberValue>+{summary.marketScore.toFixed(2)}</NumberValue><small><span className="positive-text">60.4% positive</span> · unweighted</small></motion.article>
      <motion.article {...fade} transition={{ delay: .2 }} className="metric-card"><div><span>Most discussed</span><Flame /></div><strong className="metric-model">GPT-5.6 Sol</strong><small>3,824 mentions · <Delta value={18.2} /></small></motion.article>
    </section>

    <section className="signal-strip">
      <div className="signal-kicker"><span className="live-pulse" />Live signals</div>
      <div><span>Positive leader</span><strong>Kimi K3</strong><small>63.2% positive</small></div>
      <div><span>Fastest rising</span><strong>Kimi K3</strong><small><Delta value={32.4} /></small></div>
      <div><span>Most negative volume</span><strong>Claude Opus</strong><small>723 critical posts</small></div>
      <div><span>Highest engagement</span><strong>GPT-5.6 Sol</strong><small>38.4 avg. score</small></div>
    </section>

    <section className="dashboard-grid">
      <ChartCard title="Mention velocity" subtitle="Conversation volume over the selected period" wide><TrendChart /></ChartCard>
      <ChartCard title="Sentiment mix" subtitle="Unweighted classification"><SentimentDonut /></ChartCard>
      <ChartCard title="Mentions by model" subtitle="Share of tracked conversation"><MentionChart /></ChartCard>
      <ChartCard title="Sentiment score" subtitle="-1 negative · +1 positive"><ModelScoreChart /></ChartCard>
      <ChartCard title="Polarity over time" subtitle="Positive and negative post volume" wide><TrendChart lines /></ChartCard>
    </section>

    <section className="section-block">
      <div className="section-heading"><div><Eyebrow>Model leaderboard</Eyebrow><h2>Momentum, at a glance</h2></div><Link href="/compare" className="text-link">Compare models <ArrowRight /></Link></div>
      <div className="leaderboard panel"><div className="table-head"><span>Model</span><span>Mentions</span><span>Sentiment</span><span>Engagement</span><span>7D change</span><span /></div>{models.map((model, index) => <div className="leader-row" key={model.slug}><div className="model-cell"><span className="rank">0{index + 1}</span><i style={{ background: model.color }}>{model.monogram}</i><span><strong>{model.name}</strong><small>{model.vendor}</small></span></div><strong>{model.mentions.toLocaleString()}</strong><span className="score-cell"><b className={model.score > .5 ? "great" : "good"}>+{model.score}</b><em><i style={{ width: `${(model.score + 1) * 50}%` }} /></em></span><span>{model.engagement}</span><Delta value={model.growth} /><Link href={`/models/${model.slug}`} aria-label={`View ${model.name}`}><ArrowRight /></Link></div>)}</div>
    </section>

    <section className="two-column section-block">
      <div><div className="section-heading compact"><div><Eyebrow>Topic pulse</Eyebrow><h2>What people care about</h2></div></div><div className="topic-list panel">{topicRows.map((topic) => <div key={topic.topic}><span><strong>{topic.topic}</strong><small>{topic.volume.toLocaleString()} posts</small></span><span className="topic-positive">{topic.positive}% positive</span><Delta value={topic.change} /></div>)}</div></div>
      <div><div className="section-heading compact"><div><Eyebrow>Representative posts</Eyebrow><h2>Inside the conversation</h2></div><Link className="text-link" href="/posts">View all <ArrowRight /></Link></div><div className="mini-posts">{posts.slice(0, 3).map((post) => <Link href={`/posts?model=${post.modelSlug}`} key={post.id} className="mini-post panel"><div><span className={`sentiment-dot ${post.sentiment}`} /><strong>{post.author}</strong><small>@{post.username}</small><span>{post.model}</span></div><p>“{post.text}”</p><footer><span><Heart />{post.likes}</span><span><MessageCircle />{post.replies}</span><span><Repeat2 />{post.reposts}</span></footer></Link>)}</div></div>
    </section>
  </div>;
}

function ChartCard({ title, subtitle, children, wide = false }: { title: string; subtitle: string; children: React.ReactNode; wide?: boolean }) { return <article className={`chart-card panel ${wide ? "wide" : ""}`}><header><div><h3>{title}</h3><p>{subtitle}</p></div><button aria-label={`More options for ${title}`}>•••</button></header>{children}</article>; }
