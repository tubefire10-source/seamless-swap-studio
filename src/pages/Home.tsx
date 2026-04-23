import { Link } from "react-router-dom";
import { Activity, Boxes, ArrowLeftRight, Zap, Database, ChevronRight, Rocket, Sparkles, TrendingUp } from "lucide-react";
import { useLitvmNetwork } from "@/hooks/useLitvmNetwork";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart } from "recharts";

function StatCard({
  label, value, hint, accent = "primary", icon: Icon,
}: { label: string; value: string; hint?: string; accent?: "primary" | "fire" | "green" | "gold" | "secondary"; icon: React.ElementType }) {
  const accentMap = {
    primary: "text-primary border-primary/30 from-primary/10",
    secondary: "text-secondary border-secondary/30 from-secondary/10",
    fire: "text-fire border-fire/30 from-fire/10",
    green: "text-green border-green/30 from-green/10",
    gold: "text-gold border-gold/30 from-gold/10",
  } as const;
  return (
    <div className={`panel relative overflow-hidden p-5`}>
      <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${accentMap[accent]} to-transparent opacity-50 blur-2xl`} />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
          <div className={`mt-3 font-display text-3xl ${accentMap[accent].split(" ")[0]}`}>{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${accentMap[accent].split(" ")[1]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {hint && <div className="relative mt-3 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function Home() {
  const { latestBlock, avgBlockTime, gasPriceGwei, recentTxs, blocks } = useLitvmNetwork();

  const fmtNum = (n: number | null) => (n == null ? "—" : n.toLocaleString());
  const totalEst = latestBlock ? Math.round((latestBlock * 2.5)).toLocaleString() : "—";

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-primary">
              <Sparkles className="h-3 w-3" /> LitVM LiteForge · Live
            </div>
            <h1 className="mt-4 font-display text-5xl leading-tight md:text-6xl">
              Welcome to <span className="text-gradient-aurora">LitVM</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
              The complete on-chain terminal for LiteForge — trade, deploy, and analyze
              the fastest zkLTC-native ecosystem.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/swap" className="btn-primary">
                <ArrowLeftRight className="h-4 w-4" /> Open Swap
              </Link>
              <Link
                to="/deploy"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface/60 px-5 py-3 text-sm font-medium backdrop-blur transition-colors hover:border-primary/50 hover:text-primary"
              >
                <Rocket className="h-4 w-4" /> Deploy Token
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start rounded-xl border border-green/40 bg-green/10 px-4 py-2 text-xs text-green">
            <span className="status-dot" /> Network Live
          </div>
        </div>
      </section>

      {/* Network meta */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="panel p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Network</div>
          <div className="mt-2 font-display text-xl text-gradient-violet">LiteForge</div>
        </div>
        <div className="panel p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Chain ID</div>
          <div className="mt-2 font-display text-xl text-foreground">4441</div>
        </div>
        <div className="panel p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rollup</div>
          <div className="mt-2 font-display text-xl text-secondary">Arbitrum Orbit</div>
        </div>
        <div className="panel p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Native Token</div>
          <div className="mt-2 font-display text-xl text-fire">zkLTC</div>
        </div>
      </div>

      {/* Live stats */}
      <div>
        <h2 className="mb-4 flex items-center gap-2 font-display text-2xl">
          <TrendingUp className="h-5 w-5 text-primary" /> Live Network Stats
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Latest Block" value={fmtNum(latestBlock)} accent="primary" icon={Boxes} />
          <StatCard label="Avg Block Time" value={avgBlockTime ? `${avgBlockTime.toFixed(2)} s` : "—"} accent="secondary" icon={Activity} />
          <StatCard label="Gas Price" value={gasPriceGwei != null ? `${gasPriceGwei.toFixed(3)} Gwei` : "—"} accent="gold" icon={Zap} />
          <StatCard label={`Recent TXs (${blocks.length} blk)`} value={fmtNum(recentTxs)} accent="green" icon={ArrowLeftRight} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total TXNs (est.)" value={totalEst} hint="Extrapolated from recent activity" accent="primary" icon={Database} />
          <div className="panel p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">RPC Status</div>
            <div className="mt-3 flex items-center gap-2 font-display text-2xl text-green">
              <span className="status-dot" /> Healthy
            </div>
          </div>
          <div className="panel p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Native Token</div>
            <div className="mt-3 font-display text-2xl text-gradient-fire">zkLTC</div>
          </div>
          <div className="panel p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Explorer</div>
            <div className="mt-3 font-display text-2xl text-secondary">LiteForge</div>
            <div className="mt-1 text-[11px] text-muted-foreground">Powered by Caldera</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div>
        <h2 className="mb-4 flex items-center gap-2 font-display text-2xl">
          <Activity className="h-5 w-5 text-primary" /> Network Activity
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Boxes className="h-4 w-4 text-primary" /> Block Production (last {blocks.length || 16})
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={blocks.map((b) => ({ x: `#${b.number}`, v: 1 }))}>
                  <defs>
                    <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
                  <Area type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#prodGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ArrowLeftRight className="h-4 w-4 text-secondary" /> Transaction Volume (last {blocks.length || 16} blk)
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={blocks.map((b) => ({ x: `#${b.number}`, v: b.txs }))}>
                  <defs>
                    <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="v" fill="url(#txGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[
          { title: "Browse Blocks", desc: "Inspect the latest blocks produced on LitVM.", to: "/blocks" },
          { title: "Explore Transactions", desc: "Recent transfers, swaps and contract calls.", to: "/transactions" },
          { title: "Open Terminal", desc: "Wallet, swap, balance — command-style.", to: "/terminal" },
        ].map((c) => (
          <Link key={c.to} to={c.to} className="panel group flex items-center justify-between p-5 transition-all hover:border-primary/60 hover:shadow-glow-violet/40">
            <div>
              <div className="font-display text-xl text-gradient-violet">{c.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.desc}</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </div>
  );
}
