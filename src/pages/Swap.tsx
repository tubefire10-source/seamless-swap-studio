import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowDownUp, ExternalLink } from "lucide-react";
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, formatUnits, parseUnits, isAddress, ZeroAddress } from "ethers";
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
type Status = { kind: "idle" | "info" | "ok" | "error"; msg: string };

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

function TokenChips({
  selected, onSelect,
}: { selected: string; onSelect: (a: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SWAP_TOKENS.map((t) => {
        const active = t.address.toLowerCase() === selected.toLowerCase();
        return (
          <button
            key={t.address}
            onClick={() => onSelect(t.address)}
            className={`chip ${active ? "chip-active" : ""}`}
            type="button"
          >
            {t.symbol}
          </button>
        );
      })}
    </div>
  );
}

export default function Swap() {
  const { address: walletAddr, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [routerAddr, setRouterAddr] = useState(DEFAULT_ROUTER);
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
  const [advanced, setAdvanced] = useState(false);
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setStatus({ kind: "info", msg: "⏳ Approving token…" });
    try {
      await ensureChain();
      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const c = new Contract(tokenInAddr, ERC20_ABI, signer);
      const inWei = parseUnits(amountIn || "0", tokenIn.decimals);
      const tx = await c.approve(routerAddr, inWei);
      setStatus({ kind: "info", msg: "⏳ Waiting for approval confirmation…" });
      await tx.wait();
      setStatus({ kind: "ok", msg: "✅ Approved! Now click Swap." });
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
    setStatus({ kind: "info", msg: "⏳ Sending swap transaction…" });
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

      setStatus({ kind: "info", msg: "⏳ Confirming… " + tx.hash.slice(0, 12) + "…" });
      const receipt = await tx.wait();
      setStatus({
        kind: "ok",
        msg: `✅ Swap confirmed! tx ${shortAddr(receipt?.hash ?? tx.hash)}`,
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
    if (!amountIn || !amountOut || +amountIn === 0 || !tokenIn || !tokenOut) return "—";
    const r = +amountOut / +amountIn;
    return `1 ${tokenIn.symbol} = ${r.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`;
  }, [amountIn, amountOut, tokenIn, tokenOut]);

  const minRecv = useMemo(() => {
    if (!amountOut || !tokenOut) return "—";
    const v = +amountOut * (1 - slippage / 100);
    return `${v.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${tokenOut.symbol}`;
  }, [amountOut, slippage, tokenOut]);

  const routeStr = tokenIn && tokenOut ? `${tokenIn.symbol} → ${tokenOut.symbol}` : "—";

  const lastTxHash = status.kind === "ok" && status.msg.includes("tx ") ? status.msg.split("tx ")[1] : null;

  let action: React.ReactNode = null;
  if (!isConnected) {
    action = <div className="rounded-sm border border-border bg-surface p-4 text-center text-sm text-muted-foreground">Connect wallet to swap</div>;
  } else if (!tokenIn || !tokenOut) {
    action = <button disabled className="h-12 w-full rounded-sm border border-border bg-surface text-sm text-muted-foreground">Loading tokens…</button>;
  } else if (!amountIn || +amountIn <= 0) {
    action = <button disabled className="h-12 w-full rounded-sm border border-border bg-surface text-sm text-muted-foreground">Enter amount</button>;
  } else if (+amountIn > +tokenIn.balance) {
    action = <button disabled className="h-12 w-full rounded-sm border border-destructive/40 bg-destructive/10 text-sm text-destructive">Insufficient {tokenIn.symbol} balance</button>;
  } else if (quoteLoading) {
    action = <button disabled className="h-12 w-full rounded-sm border border-border bg-surface text-sm text-muted-foreground">Fetching quote…</button>;
  } else if (!amountOut) {
    action = <button disabled className="h-12 w-full rounded-sm border border-border bg-surface text-sm text-muted-foreground">No quote available</button>;
  } else {
    const needsApprove = !isNativeAddr(tokenInAddr) && (() => {
      try { return parseUnits(amountIn, tokenIn.decimals) > allowance; } catch { return false; }
    })();
    if (needsApprove) {
      action = (
        <button onClick={onApprove} disabled={busy} className="h-12 w-full rounded-sm bg-gradient-fire text-base font-semibold uppercase tracking-widest text-fire-foreground transition-opacity hover:opacity-90 disabled:opacity-60">
          {busy ? "Working…" : `Approve ${tokenIn.symbol}`}
        </button>
      );
    } else {
      action = (
        <button onClick={onSwap} disabled={busy} className="h-12 w-full rounded-sm bg-gradient-cyan text-base font-semibold uppercase tracking-widest text-primary-foreground shadow-glow-cyan transition-opacity hover:opacity-90 disabled:opacity-60">
          {busy ? "Working…" : `Swap ${tokenIn.symbol} → ${tokenOut.symbol}`}
        </button>
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-3 font-display text-4xl">
          <ArrowLeftRight className="h-7 w-7 text-primary" /> Swap
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Swap zkLTC and any LitVM ERC-20 directly from your wallet. Pick a token below or paste any contract address.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <div className="panel p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>You pay</span>
              {tokenIn && <span>Balance: {(+tokenIn.balance).toFixed(4)} {tokenIn.symbol}</span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0.0"
                inputMode="decimal"
                className="w-full bg-transparent font-display text-3xl text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button onClick={onMax} className="chip chip-active text-[11px]">MAX</button>
            </div>
            <div className="mt-3"><TokenChips selected={tokenInAddr} onSelect={setTokenInAddr} /></div>
            <input
              type="text"
              value={isNativeAddr(tokenInAddr) ? "" : tokenInAddr}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") setTokenInAddr(NATIVE_SENTINEL);
                else if (isAddress(v)) setTokenInAddr(v);
                else setTokenInAddr(v);
              }}
              placeholder="or paste any 0x… token address"
              className="mt-3 h-9 w-full rounded-sm border border-border bg-surface px-3 font-mono text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex justify-center">
            <button onClick={onFlip} className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-surface text-primary transition-colors hover:border-primary hover:bg-primary/10">
              <ArrowDownUp className="h-4 w-4" />
            </button>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              <span>You receive</span>
              {tokenOut && <span>Balance: {(+tokenOut.balance).toFixed(4)} {tokenOut.symbol}</span>}
            </div>
            <div className="mt-2 font-display text-3xl text-foreground">
              {quoteLoading ? "…" : amountOut ? (+amountOut).toLocaleString(undefined, { maximumFractionDigits: 8 }) : "0.0"}
            </div>
            <div className="mt-3"><TokenChips selected={tokenOutAddr} onSelect={setTokenOutAddr} /></div>
            <input
              type="text"
              value={isNativeAddr(tokenOutAddr) ? "" : tokenOutAddr}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === "") setTokenOutAddr(NATIVE_SENTINEL);
                else setTokenOutAddr(v);
              }}
              placeholder="or paste any 0x… token address"
              className="mt-3 h-9 w-full rounded-sm border border-border bg-surface px-3 font-mono text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            {tokenOut && !isNativeAddr(tokenOut.address) && (
              <div className="mt-2 text-[11px] text-muted-foreground">
                {tokenOut.symbol} · {tokenOut.decimals} dec · {shortAddr(tokenOut.address)}
              </div>
            )}
          </div>

          <div className="panel flex items-center justify-between p-3">
            <div className="text-xs text-muted-foreground">Slippage tolerance</div>
            <div className="flex gap-1">
              {[0.1, 0.5, 1].map((v) => (
                <button
                  key={v}
                  onClick={() => setSlippage(v)}
                  className={`chip text-[11px] ${slippage === v ? "chip-active" : ""}`}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>

          <button onClick={() => setAdvanced((v) => !v)} className="text-xs text-muted-foreground hover:text-primary">
            {advanced ? "− Hide advanced" : "+ Advanced (router override)"}
          </button>
          {advanced && (
            <div className="panel space-y-2 p-3">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Router contract</div>
              <input
                value={routerAddr}
                onChange={(e) => setRouterAddr(e.target.value.trim())}
                className="h-9 w-full rounded-sm border border-border bg-surface px-3 font-mono text-xs focus:border-primary focus:outline-none"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>WETH: {wethAddr ? shortAddr(wethAddr) : "—"}</span>
                <button onClick={() => setRouterAddr(DEFAULT_ROUTER)} className="text-fire hover:underline">
                  Reset to Onmifun
                </button>
              </div>
            </div>
          )}

          {status.msg && (
            <div className={`rounded-sm border p-3 text-sm ${
              status.kind === "ok" ? "border-green/40 bg-green/10 text-green" :
              status.kind === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" :
              "border-primary/40 bg-primary/10 text-primary"
            }`}>
              {status.msg}
              {lastTxHash && (
                <a href={`${EXPLORER_URL}/tx/${lastTxHash}`} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 underline">
                  View <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {action}
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary">How it works</div>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs text-muted-foreground">
              <li>Default router is <span className="text-fire">Onmifun V2</span> — already wired up.</li>
              <li>Pick a token chip or paste any LitVM ERC-20 address.</li>
              <li>Live quote pulled from router's <span className="text-primary">getAmountsOut</span>.</li>
              <li>Approve once for ERC-20 inputs, then swap.</li>
              <li>Swap fails if no liquidity pool exists for the pair.</li>
            </ol>
          </div>

          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary">Quote details</div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className="text-foreground">{priceStr}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Min received</span><span className="text-foreground">{minRecv}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Slippage</span><span className="text-foreground">{slippage}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Route</span><span className="text-foreground">{routeStr}</span></div>
            </div>
          </div>

          <div className="panel p-4">
            <div className="text-[11px] uppercase tracking-[0.2em] text-primary">Wallet</div>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Address</span><span className="font-mono text-foreground">{walletAddr ? shortAddr(walletAddr) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{tokenIn?.symbol ?? "In"} bal</span><span className="text-foreground">{tokenIn ? (+tokenIn.balance).toFixed(4) : "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{tokenOut?.symbol ?? "Out"} bal</span><span className="text-foreground">{tokenOut ? (+tokenOut.balance).toFixed(4) : "—"}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

void ZeroAddress;
