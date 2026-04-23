import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownUp, ChevronDown, ExternalLink, RefreshCw, Search, Settings2, Star, X, Zap } from "lucide-react";
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, formatUnits, parseUnits, isAddress } from "ethers";
import { useAccount, useSwitchChain } from "wagmi";
import {
  DEFAULT_ROUTER,
  ERC20_ABI,
  EXPLORER_URL,
  LITVM_CHAIN_ID,
  NATIVE_SENTINEL,
  POPULAR_TOKENS,
  ROUTER_ABI,
  RPC_URL,
  SWAP_TOKENS,
  errMsg,
  isNativeAddr,
  shortAddr,
} from "@/lib/litvm";

type TokenMeta = { address: string; symbol: string; decimals: number; balance: string };
type Status = { kind: "idle" | "info" | "ok" | "error"; msg: string; txHash?: string };

const readProvider = new JsonRpcProvider(RPC_URL);

async function loadTokenMeta(addr: string, owner?: string): Promise<TokenMeta> {
  if (isNativeAddr(addr)) {
    let bal = "0";
    if (owner) {
      try { bal = formatEther(await readProvider.getBalance(owner)); } catch { /* ignore */ }
    }
    return { address: NATIVE_SENTINEL, symbol: "zkLTC", decimals: 18, balance: bal };
  }
  const c = new Contract(addr, ERC20_ABI, readProvider);
  const [sym, dec, balRaw] = await Promise.all([
    c.symbol().catch(() => "TOKEN"),
    c.decimals().catch(() => 18),
    owner ? c.balanceOf(owner).catch(() => 0n) : Promise.resolve(0n),
  ]);
  const decimals = Number(dec);
  return {
    address: addr,
    symbol: String(sym),
    decimals,
    balance: formatUnits(balRaw as bigint, decimals),
  };
}

/** Token avatar — first letter on a violet gradient circle */
function TokenAvatar({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const initial = (symbol || "?").charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-violet font-display text-primary-foreground shadow-glow-violet/40"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

/** Modal for picking a token */
function TokenPickerModal({
  open,
  onClose,
  onPick,
  tokenBalances,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (addr: string) => void;
  tokenBalances: Record<string, string>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SWAP_TOKENS;
    return SWAP_TOKENS.filter(
      (t) => t.symbol.toLowerCase().includes(q) || t.address.toLowerCase().includes(q),
    );
  }, [query]);

  const customAddress = useMemo(() => {
    const q = query.trim();
    if (isAddress(q) && !SWAP_TOKENS.some((t) => t.address.toLowerCase() === q.toLowerCase())) {
      return q;
    }
    return null;
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 pt-[10vh] backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-md panel-elevated p-5 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-gradient-violet">Select a Token</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or paste address"
            className="h-12 w-full rounded-xl border border-border/60 bg-background/60 pl-11 pr-4 text-sm placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {customAddress && (
            <button
              onClick={() => onPick(customAddress)}
              className="flex w-full items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-3 text-left transition-colors hover:bg-primary/10"
            >
              <div className="flex items-center gap-3">
                <TokenAvatar symbol="?" />
                <div>
                  <div className="text-sm font-semibold">Import token</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{shortAddr(customAddress)}</div>
                </div>
              </div>
              <span className="text-[10px] uppercase tracking-wider text-primary">Custom</span>
            </button>
          )}

          {filtered.map((t) => {
            const bal = tokenBalances[t.address] ?? "—";
            return (
              <button
                key={t.address}
                onClick={() => onPick(t.address)}
                className="group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
              >
                <div className="flex items-center gap-3">
                  <TokenAvatar symbol={t.symbol} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{t.symbol}</span>
                      {!isNativeAddr(t.address) && (
                        <a
                          href={`${EXPLORER_URL}/token/${t.address}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{t.symbol}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-mono">{(+bal).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  <Star className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-gold/60" />
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && !customAddress && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No tokens found. Paste a contract address to import.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Settings popover for slippage */
function SettingsPopover({
  open,
  onClose,
  slippage,
  onSlippage,
}: {
  open: boolean;
  onClose: () => void;
  slippage: number;
  onSlippage: (s: number) => void;
}) {
  if (!open) return null;
  return (
    <div className="absolute right-0 top-12 z-30 w-72 panel-elevated p-4 animate-scale-in" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Transaction Settings</div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <div className="text-xs text-muted-foreground">Slippage tolerance</div>
        <div className="mt-2 flex gap-2">
          {[0.1, 0.5, 1].map((v) => (
            <button
              key={v}
              onClick={() => onSlippage(v)}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                slippage === v
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border bg-surface hover:border-primary/40"
              }`}
            >
              {v}%
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Swap() {
  const { address: walletAddr, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [routerAddr] = useState(DEFAULT_ROUTER);
  const [wethAddr, setWethAddr] = useState<string>("");
  const [tokenInAddr, setTokenInAddr] = useState<string>(NATIVE_SENTINEL);
  const [tokenOutAddr, setTokenOutAddr] = useState<string>(POPULAR_TOKENS[0].address);
  const [tokenIn, setTokenIn] = useState<TokenMeta | null>(null);
  const [tokenOut, setTokenOut] = useState<TokenMeta | null>(null);
  const [amountIn, setAmountIn] = useState<string>("");
  const [amountOut, setAmountOut] = useState<string>("");
  const [slippage, setSlippage] = useState<number>(0.5);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", msg: "" });
  const [pickerSide, setPickerSide] = useState<"in" | "out" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({});
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load WETH from router
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = new Contract(routerAddr, ROUTER_ABI, readProvider);
        const w = String(await r.WETH());
        if (!cancel) setWethAddr(w);
      } catch {
        if (!cancel) setWethAddr("");
      }
    })();
    return () => { cancel = true; };
  }, [routerAddr]);

  // Load token in / out metas
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const meta = await loadTokenMeta(tokenInAddr, walletAddr);
        if (!cancel) setTokenIn(meta);
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [tokenInAddr, walletAddr]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const meta = await loadTokenMeta(tokenOutAddr, walletAddr);
        if (!cancel) setTokenOut(meta);
      } catch { /* ignore */ }
    })();
    return () => { cancel = true; };
  }, [tokenOutAddr, walletAddr]);

  // Load all SWAP_TOKENS balances for the picker (lazy / fire-and-forget)
  useEffect(() => {
    let cancel = false;
    if (!walletAddr) { setTokenBalances({}); return; }
    (async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        SWAP_TOKENS.map(async (t) => {
          try {
            const m = await loadTokenMeta(t.address, walletAddr);
            out[t.address] = m.balance;
          } catch { out[t.address] = "0"; }
        })
      );
      if (!cancel) setTokenBalances(out);
    })();
    return () => { cancel = true; };
  }, [walletAddr]);

  const reloadAllowance = useCallback(async () => {
    if (!walletAddr || isNativeAddr(tokenInAddr)) { setAllowance(0n); return; }
    try {
      const c = new Contract(tokenInAddr, ERC20_ABI, readProvider);
      const a = (await c.allowance(walletAddr, routerAddr)) as bigint;
      setAllowance(BigInt(a));
    } catch { setAllowance(0n); }
  }, [walletAddr, tokenInAddr, routerAddr]);

  useEffect(() => { reloadAllowance(); }, [reloadAllowance]);

  const fetchQuote = useCallback(async () => {
    if (!tokenIn || !tokenOut || !wethAddr || !amountIn || +amountIn <= 0) {
      setAmountOut(""); setQuoteLoading(false); return;
    }
    const inA  = isNativeAddr(tokenInAddr)  ? wethAddr : tokenInAddr;
    const outA = isNativeAddr(tokenOutAddr) ? wethAddr : tokenOutAddr;
    if (inA.toLowerCase() === outA.toLowerCase()) {
      setAmountOut(""); setQuoteLoading(false);
      setStatus({ kind: "error", msg: "Cannot swap same token." });
      return;
    }
    try {
      const router = new Contract(routerAddr, ROUTER_ABI, readProvider);
      const inWei = parseUnits(amountIn, tokenIn.decimals);
      const amounts = (await router.getAmountsOut(inWei, [inA, outA])) as bigint[];
      setAmountOut(formatUnits(amounts[amounts.length - 1], tokenOut.decimals));
      setStatus({ kind: "idle", msg: "" });
    } catch (e) {
      const m = errMsg(e);
      setAmountOut("");
      setStatus({
        kind: "error",
        msg: m.includes("INSUFFICIENT") || m.includes("liquidity") ? "No liquidity for this pair." : "Quote failed: " + m.slice(0, 120),
      });
    } finally {
      setQuoteLoading(false);
    }
  }, [tokenIn, tokenOut, wethAddr, amountIn, tokenInAddr, tokenOutAddr, routerAddr]);

  useEffect(() => {
    if (!amountIn || +amountIn <= 0) { setAmountOut(""); return; }
    setQuoteLoading(true);
    if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
    quoteTimerRef.current = setTimeout(() => { fetchQuote(); }, 350);
    return () => { if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current); };
  }, [amountIn, fetchQuote]);

  const ensureChain = useCallback(async () => {
    if (chainId !== LITVM_CHAIN_ID) {
      await switchChainAsync({ chainId: LITVM_CHAIN_ID });
    }
  }, [chainId, switchChainAsync]);

  const onFlip = () => {
    setTokenInAddr(tokenOutAddr);
    setTokenOutAddr(tokenInAddr);
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(""); setAmountOut("");
    setStatus({ kind: "idle", msg: "" });
  };

  const onMax = () => {
    if (!tokenIn) return;
    setAmountIn(tokenIn.balance);
  };

  const onApprove = async () => {
    if (!tokenIn || isNativeAddr(tokenInAddr) || !window.ethereum) return;
    setBusy(true);
    setStatus({ kind: "info", msg: "Approving token…" });
    try {
      await ensureChain();
      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const c = new Contract(tokenInAddr, ERC20_ABI, signer);
      const inWei = parseUnits(amountIn || "0", tokenIn.decimals);
      const tx = await c.approve(routerAddr, inWei);
      setStatus({ kind: "info", msg: "Waiting for approval confirmation…" });
      await tx.wait();
      setStatus({ kind: "ok", msg: "Approved! Now click Swap." });
      await reloadAllowance();
    } catch (e) {
      setStatus({ kind: "error", msg: "Approval failed: " + errMsg(e).slice(0, 140) });
    } finally {
      setBusy(false);
    }
  };

  const onSwap = async () => {
    if (!tokenIn || !tokenOut || !amountIn || !amountOut || !walletAddr || !window.ethereum) return;
    const inA  = isNativeAddr(tokenInAddr)  ? wethAddr : tokenInAddr;
    const outA = isNativeAddr(tokenOutAddr) ? wethAddr : tokenOutAddr;
    const path = [inA, outA];

    setBusy(true);
    setStatus({ kind: "info", msg: "Sending swap transaction…" });
    try {
      await ensureChain();
      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const router = new Contract(routerAddr, ROUTER_ABI, signer);
      const inWei = parseUnits(amountIn, tokenIn.decimals);
      const outWei = parseUnits(amountOut, tokenOut.decimals);
      const minOut = outWei - (outWei * BigInt(Math.floor(slippage * 100))) / 10000n;
      const deadline = Math.floor(Date.now() / 1000) + 600;

      let tx;
      if (isNativeAddr(tokenInAddr)) {
        tx = await router.swapExactETHForTokens(minOut, path, walletAddr, deadline, { value: inWei });
      } else if (isNativeAddr(tokenOutAddr)) {
        tx = await router.swapExactTokensForETH(inWei, minOut, path, walletAddr, deadline);
      } else {
        tx = await router.swapExactTokensForTokens(inWei, minOut, path, walletAddr, deadline);
      }

      setStatus({ kind: "info", msg: "Confirming… " + tx.hash.slice(0, 12) + "…", txHash: tx.hash });
      const receipt = await tx.wait();
      const finalHash = receipt?.hash ?? tx.hash;
      setStatus({
        kind: "ok",
        msg: `Swap confirmed! tx ${shortAddr(finalHash)}`,
        txHash: finalHash,
      });
      setAmountIn(""); setAmountOut("");
      const [m1, m2] = await Promise.all([
        loadTokenMeta(tokenInAddr, walletAddr),
        loadTokenMeta(tokenOutAddr, walletAddr),
      ]);
      setTokenIn(m1); setTokenOut(m2);
      reloadAllowance();
    } catch (e) {
      setStatus({ kind: "error", msg: "Swap failed: " + errMsg(e).slice(0, 160) });
    } finally {
      setBusy(false);
    }
  };

  const priceStr = useMemo(() => {
    if (!amountIn || !amountOut || +amountIn === 0 || !tokenIn || !tokenOut) return null;
    const r = +amountOut / +amountIn;
    return `1 ${tokenIn.symbol} = ${r.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`;
  }, [amountIn, amountOut, tokenIn, tokenOut]);

  const minRecv = useMemo(() => {
    if (!amountOut || !tokenOut) return null;
    const v = +amountOut * (1 - slippage / 100);
    return `${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`;
  }, [amountOut, slippage, tokenOut]);

  // Action button
  let action: React.ReactNode = null;
  if (!isConnected) {
    action = (
      <button disabled className="h-14 w-full rounded-xl border border-border/60 bg-surface/60 text-sm font-medium text-muted-foreground">
        Connect wallet to swap
      </button>
    );
  } else if (!tokenIn || !tokenOut) {
    action = (
      <button disabled className="h-14 w-full rounded-xl border border-border/60 bg-surface/60 text-sm font-medium text-muted-foreground">
        Loading tokens…
      </button>
    );
  } else if (!amountIn || +amountIn <= 0) {
    action = (
      <button disabled className="h-14 w-full rounded-xl border border-border/60 bg-surface/60 text-sm font-medium text-muted-foreground">
        Enter an amount
      </button>
    );
  } else if (+amountIn > +tokenIn.balance) {
    action = (
      <button disabled className="h-14 w-full rounded-xl border border-destructive/40 bg-destructive/10 text-sm font-medium text-destructive">
        Insufficient {tokenIn.symbol} balance
      </button>
    );
  } else if (quoteLoading) {
    action = (
      <button disabled className="h-14 w-full rounded-xl border border-border/60 bg-surface/60 text-sm font-medium text-muted-foreground">
        <RefreshCw className="mr-2 inline h-4 w-4 animate-spin" /> Fetching best quote…
      </button>
    );
  } else if (!amountOut) {
    action = (
      <button disabled className="h-14 w-full rounded-xl border border-border/60 bg-surface/60 text-sm font-medium text-muted-foreground">
        No quote available
      </button>
    );
  } else {
    const needsApprove = !isNativeAddr(tokenInAddr) && (() => {
      try { return parseUnits(amountIn, tokenIn.decimals) > allowance; } catch { return false; }
    })();
    if (needsApprove) {
      action = (
        <button onClick={onApprove} disabled={busy} className="btn-primary h-14 w-full text-base">
          {busy ? "Working…" : `Approve ${tokenIn.symbol}`}
        </button>
      );
    } else {
      action = (
        <button onClick={onSwap} disabled={busy} className="btn-primary h-14 w-full text-base">
          {busy ? "Swapping…" : `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`}
        </button>
      );
    }
  }

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-primary">
          <Zap className="h-3 w-3" /> Best price routing
        </div>
        <h1 className="mt-4 font-display text-5xl md:text-6xl">
          <span className="text-gradient-aurora">LitVM</span>
          <span className="text-foreground">Swap</span>
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Trade any LitVM token instantly · zkLTC native · low fees · instant settlement
        </p>
      </div>

      {/* Swap card */}
      <div className="mx-auto max-w-lg">
        <div className="panel-elevated relative p-5 md:p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-gradient-violet">Swap Your Assets</h2>
            <div className="relative flex items-center gap-2">
              <button
                onClick={() => fetchQuote()}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                title="Refresh quote"
              >
                <RefreshCw className={`h-4 w-4 ${quoteLoading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-surface/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                title="Settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
              <SettingsPopover
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                slippage={slippage}
                onSlippage={(s) => { setSlippage(s); setSettingsOpen(false); }}
              />
            </div>
          </div>

          {/* You pay */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">You pay</span>
              {tokenIn && (
                <button onClick={onMax} className="text-muted-foreground hover:text-primary">
                  Balance: {(+tokenIn.balance).toFixed(4)} {tokenIn.symbol}
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 p-3 transition-colors focus-within:border-primary/50">
              <button
                onClick={() => setPickerSide("in")}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-border/40 bg-surface/80 px-3 py-2 transition-colors hover:border-primary/40"
              >
                <TokenAvatar symbol={tokenIn?.symbol || "?"} size={28} />
                <span className="font-display text-base text-primary">{tokenIn?.symbol || "Select"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              <input
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.0"
                inputMode="decimal"
                className="w-full bg-transparent text-right font-display text-3xl text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              />
            </div>
          </div>

          {/* Flip */}
          <div className="my-2 flex justify-center">
            <button
              onClick={onFlip}
              className="group flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-surface/80 text-primary backdrop-blur transition-all hover:border-primary hover:bg-primary/10 hover:rotate-180"
            >
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>

          {/* You receive */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">You receive</span>
              {tokenOut && (
                <span className="text-muted-foreground">
                  Balance: {(+tokenOut.balance).toFixed(4)} {tokenOut.symbol}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 p-3">
              <button
                onClick={() => setPickerSide("out")}
                className="flex shrink-0 items-center gap-2 rounded-xl border border-border/40 bg-surface/80 px-3 py-2 transition-colors hover:border-primary/40"
              >
                <TokenAvatar symbol={tokenOut?.symbol || "?"} size={28} />
                <span className="font-display text-base text-primary">{tokenOut?.symbol || "Select"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="w-full text-right font-display text-3xl text-foreground">
                {quoteLoading ? "…" : amountOut ? (+amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 }) : <span className="text-muted-foreground/40">0.0</span>}
              </div>
            </div>
          </div>

          {/* Quote details */}
          {(priceStr || minRecv) && (
            <div className="mt-4 space-y-1.5 rounded-xl border border-border/40 bg-background/40 p-3 text-xs">
              {priceStr && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Rate</span>
                  <span className="font-mono text-foreground">{priceStr}</span>
                </div>
              )}
              {minRecv && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Min received ({slippage}%)</span>
                  <span className="font-mono text-foreground">{minRecv}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Network</span>
                <span className="font-mono text-foreground">LitVM LiteForge</span>
              </div>
            </div>
          )}

          {/* Status */}
          {status.kind !== "idle" && status.msg && (
            <div
              className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs ${
                status.kind === "error"
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : status.kind === "ok"
                  ? "border-green/40 bg-green/10 text-green"
                  : "border-primary/30 bg-primary/10 text-primary"
              }`}
            >
              <span className="min-w-0 break-words">{status.msg}</span>
              {status.txHash && (
                <a
                  href={`${EXPLORER_URL}/tx/${status.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-current/40 px-2 py-1 font-medium hover:bg-current/10"
                >
                  Explorer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Action button */}
          <div className="mt-5">{action}</div>
        </div>

        <div className="mt-3 text-center text-[11px] text-muted-foreground">
          Routed via{" "}
          <a href={`${EXPLORER_URL}/address/${routerAddr}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
            {shortAddr(routerAddr)}
          </a>{" "}
          · OmniFun V2 Router
        </div>
      </div>

      {/* Token picker modal */}
      <TokenPickerModal
        open={pickerSide !== null}
        onClose={() => setPickerSide(null)}
        onPick={(addr) => {
          if (pickerSide === "in") setTokenInAddr(addr);
          else if (pickerSide === "out") setTokenOutAddr(addr);
          setPickerSide(null);
        }}
        tokenBalances={tokenBalances}
      />
    </div>
  );
}
