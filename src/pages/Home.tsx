import { Link } from "react-router-dom";
import { Activity, Boxes, ArrowLeftRight, Zap, ChevronRight, Rocket, Sparkles, TrendingUp, Droplets, ArrowUpRight } from "lucide-react";
import { useLitvmNetwork } from "@/hooks/useLitvmNetwork";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart, CartesianGrid } from "recharts";

function MetricRow({ label, value, accent }: { label: string; value: string; accent?: "primary" | "muted" }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-3 last:border-0">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`num text-sm font-semibold ${accent === "primary" ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function StatPill({ label, value, accent = "primary", icon: Icon }: { label: string; value: string; accent?: "primary" | "muted"; icon: React.ElementType }) {
  return (
    <div className="panel flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface ${accent === "primary" ? "text-primary" : "text-muted-foreground"}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className={`num mt-0.5 truncate text-lg font-semibold ${accent === "primary" ? "text-primary" : "text-foreground"}`}>{value}</div>
      </div>
    </div>
  );
}

export default function Home() {
  const { latestBlock, avgBlockTime, gasPriceGwei, recentTxs, blocks } = useLitvmNetwork();

  const fmtNum = (n: number | null) => (n == null ? "—" : n.toLocaleString());
  const totalEst = latestBlock ? Math.round(latestBlock * 2.5).toLocaleString() : "—";

  const tooltipStyle = {
    background: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 12,
    color: "hsl(var(--foreground))",
    fontSize: 12,
    fontFamily: "JetBrains Mono, monospace",
  };

  return (
    <div className="space-y-6">
      {/* Hero (compact) */}
      <section className="panel-elevated relative overflow-hidden p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3 w-3" /> LitVM LiteForge · Live
            </div>
            <h1 className="mt-3 font-display text-3xl leading-tight md:text-4xl">
              Welcome to <span className="text-gradient-aurora">LitVM</span>
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              The complete on-chain terminal for LiteForge — trade, pool, and deploy on the fastest zkLTC-native ecosystem.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/swap" className="btn-primary px-4 py-2 text-sm">
                <ArrowLeftRight className="h-4 w-4" /> Swap
              </Link>
              <Link to="/pool" className="btn-secondary px-4 py-2 text-sm">
                <Droplets className="h-4 w-4" /> Pool
              </Link>
              <Link to="/deploy" className="btn-secondary px-4 py-2 text-sm">
                <Rocket className="h-4 w-4" /> Deploy
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary">
            <span className="status-dot" /> Network Live
          </div>
        </div>
      </section>

      {/* Main 3-column dashboard grid: charts (2/3) + side rail (1/3) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* MIDDLE: Charts + Activity (2/3) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Quick stats row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatPill label="Latest Block" value={fmtNum(latestBlock)} icon={Boxes} />
            <StatPill label="Avg Block" value={avgBlockTime ? `${avgBlockTime.toFixed(2)}s` : "—"} icon={Activity} />
            <StatPill label="Gas (Gwei)" value={gasPriceGwei != null ? gasPriceGwei.toFixed(3) : "—"} icon={Zap} />
            <StatPill label="Recent TXs" value={fmtNum(recentTxs)} icon={ArrowLeftRight} />
          </div>

          {/* Block production chart */}
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Block Production</div>
                <div className="num mt-1 text-2xl font-semibold text-foreground">
                  {blocks.length || 16} <span className="text-sm text-muted-foreground">blocks</span>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Realtime
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={blocks.map((b) => ({ x: `#${b.number}`, v: 1 }))} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid horizontal={false} strokeDasharray="0" stroke="hsl(var(--border))" />
                  <XAxis dataKey="x" tick={false} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#prodGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* TX volume chart */}
          <div className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Transaction Volume</div>
                <div className="num mt-1 text-2xl font-semibold text-foreground">{fmtNum(recentTxs)}</div>
              </div>
              <div className="rounded-lg border border-border bg-surface px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Last {blocks.length || 16}
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={blocks.map((b) => ({ x: `#${b.number}`, v: b.txs }))} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid horizontal={false} strokeDasharray="0" stroke="hsl(var(--border))" />
                  <XAxis dataKey="x" tick={false} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "JetBrains Mono" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="v" fill="url(#txGrad)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT: Live stats + swap shortcut (1/3) */}
        <aside className="space-y-6">
          {/* Network meta card */}
          <div className="panel p-5">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <TrendingUp className="h-3 w-3 text-primary" /> Network
            </div>
            <MetricRow label="Network" value="LiteForge" accent="primary" />
            <MetricRow label="Chain ID" value="4441" />
            <MetricRow label="Native" value="zkLTC" />
            <MetricRow label="Rollup" value="Arbitrum Orbit" />
            <MetricRow label="Total TXNs (est)" value={totalEst} />
          </div>

          {/* Swap shortcut card */}
          <div className="panel-elevated p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary">
                <ArrowLeftRight className="h-3 w-3" /> Quick Swap
              </div>
              <Link to="/swap" className="text-[11px] text-muted-foreground hover:text-primary">
                Open <ArrowUpRight className="inline h-3 w-3" />
              </Link>
            </div>
            <div className="space-y-2">
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">From</div>
                <div className="num mt-1 text-lg font-semibold text-foreground">zkLTC</div>
              </div>
              <div className="rounded-lg border border-border bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">To</div>
                <div className="num mt-1 text-lg font-semibold text-foreground">Any LitVM token</div>
              </div>
              <Link to="/swap" className="btn-primary mt-2 h-11 w-full text-sm">
                Open Swap
              </Link>
              <Link to="/pool" className="btn-secondary h-11 w-full text-sm">
                <Droplets className="h-4 w-4" /> Provide Liquidity
              </Link>
            </div>
          </div>

          {/* RPC status */}
          <div className="panel p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">RPC Status</div>
            <div className="mt-2 flex items-center gap-2 text-base font-semibold text-primary">
              <span className="status-dot" /> Healthy
            </div>
            <div className="num mt-3 truncate text-[11px] text-muted-foreground">
              liteforge.rpc.caldera.xyz
            </div>
          </div>
        </aside>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { title: "Browse Blocks", desc: "Inspect the latest blocks produced on LitVM.", to: "/blocks" },
          { title: "Explore Transactions", desc: "Recent transfers, swaps and contract calls.", to: "/transactions" },
          { title: "Open Terminal", desc: "Wallet, swap, balance — command-style.", to: "/terminal" },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="panel group flex items-center justify-between p-5 transition-colors hover:border-primary/60">
            <div>
              <div className="font-display text-base font-semibold text-foreground group-hover:text-primary">{c.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.desc}</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
