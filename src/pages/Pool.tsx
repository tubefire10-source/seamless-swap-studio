import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ChevronDown, Droplets, ExternalLink, Plus, Minus, RefreshCw, X, Search } from "lucide-react";
import { BrowserProvider, Contract, JsonRpcProvider, formatEther, formatUnits, parseUnits, isAddress } from "ethers";
import { useAccount, useSwitchChain } from "wagmi";
import {
  DEFAULT_FACTORY,
  DEFAULT_ROUTER,
  ERC20_ABI,
  EXPLORER_URL,
  FACTORY_ABI,
  LITVM_CHAIN_ID,
  NATIVE_SENTINEL,
  PAIR_ABI,
  POPULAR_TOKENS,
  ROUTER_ABI,
  RPC_URL,
  SWAP_DEADLINE_SEC,
  SWAP_TOKENS,
  WZKLTC_ADDR,
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

function TokenAvatar({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const initial = (symbol || "?").charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-primary font-display text-primary-foreground"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}

function TokenPickerModal({
  open, onClose, onPick,
}: { open: boolean; onClose: () => void; onPick: (addr: string) => void }) {
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
    if (isAddress(q) && !SWAP_TOKENS.some((t) => t.address.toLowerCase() === q.toLowerCase())) return q;
    return null;
  }, [query]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/70 p-4 pt-[10vh] backdrop-blur-md animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-md panel-elevated p-5 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-gradient-aurora">Select a Token</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or paste address"
            className="h-12 w-full rounded-xl border border-border bg-background/60 pl-11 pr-4 text-sm placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="mt-4 max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {customAddress && (
            <button onClick={() => onPick(customAddress)} className="flex w-full items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3 py-3 text-left transition-colors hover:bg-primary/10">
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
          {filtered.map((t) => (
            <button key={t.address} onClick={() => onPick(t.address)} className="group flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10">
              <div className="flex items-center gap-3">
                <TokenAvatar symbol={t.symbol} />
                <div>
                  <div className="text-sm font-semibold text-foreground">{t.symbol}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">{isNativeAddr(t.address) ? "Native" : shortAddr(t.address)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Pool() {
  const { address: walletAddr, isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [tab, setTab] = useState<"add" | "remove">("add");
  const [tokenAAddr, setTokenAAddr] = useState<string>(NATIVE_SENTINEL);
  const [tokenBAddr, setTokenBAddr] = useState<string>(POPULAR_TOKENS[0].address);
  const [tokenA, setTokenA] = useState<TokenMeta | null>(null);
  const [tokenB, setTokenB] = useState<TokenMeta | null>(null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [pickerSide, setPickerSide] = useState<"a" | "b" | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", msg: "" });

  // pair info
  const [pairAddr, setPairAddr] = useState<string>("");
  const [pairLp, setPairLp] = useState<{ balance: bigint; totalSupply: bigint; reserves: [bigint, bigint]; token0: string }>({
    balance: 0n, totalSupply: 0n, reserves: [0n, 0n], token0: "",
  });

  // remove
  const [removeAmount, setRemoveAmount] = useState(""); // LP tokens
  const [lpAllowance, setLpAllowance] = useState<bigint>(0n);

  // approvals
  const [allowanceA, setAllowanceA] = useState<bigint>(0n);
  const [allowanceB, setAllowanceB] = useState<bigint>(0n);

  const ensureChain = useCallback(async () => {
    if (chainId !== LITVM_CHAIN_ID) await switchChainAsync({ chainId: LITVM_CHAIN_ID });
  }, [chainId, switchChainAsync]);

  // Load metas
  useEffect(() => {
    let cancel = false;
    (async () => {
      try { const m = await loadTokenMeta(tokenAAddr, walletAddr); if (!cancel) setTokenA(m); } catch { /* */ }
    })();
    return () => { cancel = true; };
  }, [tokenAAddr, walletAddr]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try { const m = await loadTokenMeta(tokenBAddr, walletAddr); if (!cancel) setTokenB(m); } catch { /* */ }
    })();
    return () => { cancel = true; };
  }, [tokenBAddr, walletAddr]);

  // Resolve pair
  const reloadPair = useCallback(async () => {
    try {
      const a0 = isNativeAddr(tokenAAddr) ? WZKLTC_ADDR : tokenAAddr;
      const b0 = isNativeAddr(tokenBAddr) ? WZKLTC_ADDR : tokenBAddr;
      if (a0.toLowerCase() === b0.toLowerCase()) {
        setPairAddr(""); return;
      }
      const f = new Contract(DEFAULT_FACTORY, FACTORY_ABI, readProvider);
      const p = String(await f.getPair(a0, b0));
      if (p === "0x0000000000000000000000000000000000000000") {
        setPairAddr("");
        setPairLp({ balance: 0n, totalSupply: 0n, reserves: [0n, 0n], token0: "" });
        return;
      }
      setPairAddr(p);
      const pair = new Contract(p, PAIR_ABI, readProvider);
      const [t0, reserves, ts, bal, lpAllow] = await Promise.all([
        pair.token0() as Promise<string>,
        pair.getReserves() as Promise<[bigint, bigint, number]>,
        pair.totalSupply() as Promise<bigint>,
        walletAddr ? (pair.balanceOf(walletAddr) as Promise<bigint>) : Promise.resolve(0n),
        walletAddr ? (pair.allowance(walletAddr, DEFAULT_ROUTER) as Promise<bigint>) : Promise.resolve(0n),
      ]);
      setPairLp({ balance: bal, totalSupply: ts, reserves: [reserves[0], reserves[1]], token0: t0 });
      setLpAllowance(lpAllow);
    } catch { setPairAddr(""); }
  }, [tokenAAddr, tokenBAddr, walletAddr]);
  useEffect(() => { reloadPair(); }, [reloadPair]);

  // Allowances for tokens A & B
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!walletAddr) { setAllowanceA(0n); setAllowanceB(0n); return; }
      try {
        const aA = isNativeAddr(tokenAAddr) ? 2n ** 255n : await new Contract(tokenAAddr, ERC20_ABI, readProvider).allowance(walletAddr, DEFAULT_ROUTER);
        const aB = isNativeAddr(tokenBAddr) ? 2n ** 255n : await new Contract(tokenBAddr, ERC20_ABI, readProvider).allowance(walletAddr, DEFAULT_ROUTER);
        if (!cancel) { setAllowanceA(BigInt(aA)); setAllowanceB(BigInt(aB)); }
      } catch { /* */ }
    })();
    return () => { cancel = true; };
  }, [walletAddr, tokenAAddr, tokenBAddr]);

  // Auto-fill amountB based on reserves when amountA changes (if pool exists)
  useEffect(() => {
    if (!pairAddr || !tokenA || !tokenB || !amountA || +amountA <= 0) return;
    try {
      const a0 = isNativeAddr(tokenAAddr) ? WZKLTC_ADDR : tokenAAddr;
      const [r0, r1] = pairLp.reserves;
      const aIsToken0 = pairLp.token0.toLowerCase() === a0.toLowerCase();
      const reserveA = aIsToken0 ? r0 : r1;
      const reserveB = aIsToken0 ? r1 : r0;
      if (reserveA === 0n || reserveB === 0n) return;
      const amtAWei = parseUnits(amountA, tokenA.decimals);
      const amtBWei = (amtAWei * reserveB) / reserveA;
      setAmountB(formatUnits(amtBWei, tokenB.decimals));
    } catch { /* */ }
  }, [amountA, pairAddr, pairLp, tokenA, tokenB, tokenAAddr]);

  const onApprove = async (which: "a" | "b") => {
    const addr = which === "a" ? tokenAAddr : tokenBAddr;
    const meta = which === "a" ? tokenA : tokenB;
    const amt = which === "a" ? amountA : amountB;
    if (!meta || isNativeAddr(addr) || !window.ethereum) return;
    setBusy(true);
    setStatus({ kind: "info", msg: `Approving ${meta.symbol}…` });
    try {
      await ensureChain();
      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const c = new Contract(addr, ERC20_ABI, signer);
      const wei = parseUnits(amt || "0", meta.decimals);
      const tx = await c.approve(DEFAULT_ROUTER, wei);
      await tx.wait();
      setStatus({ kind: "ok", msg: `${meta.symbol} approved.` });
      // reload allowances
      const a = await new Contract(addr, ERC20_ABI, readProvider).allowance(walletAddr!, DEFAULT_ROUTER);
      if (which === "a") setAllowanceA(BigInt(a)); else setAllowanceB(BigInt(a));
    } catch (e) {
      setStatus({ kind: "error", msg: "Approval failed: " + errMsg(e).slice(0, 120) });
    } finally { setBusy(false); }
  };

  const onAddLiquidity = async () => {
    if (!tokenA || !tokenB || !amountA || !amountB || !walletAddr || !window.ethereum) return;
    setBusy(true);
    setStatus({ kind: "info", msg: "Adding liquidity…" });
    try {
      await ensureChain();
      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const router = new Contract(DEFAULT_ROUTER, ROUTER_ABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SEC;
      const slippageBps = 500n; // 5% min
      const aWei = parseUnits(amountA, tokenA.decimals);
      const bWei = parseUnits(amountB, tokenB.decimals);
      const aMin = aWei - (aWei * slippageBps) / 10000n;
      const bMin = bWei - (bWei * slippageBps) / 10000n;

      let tx;
      if (isNativeAddr(tokenAAddr) && !isNativeAddr(tokenBAddr)) {
        tx = await router.addLiquidityZKLTC(tokenBAddr, bWei, bMin, aMin, walletAddr, deadline, { value: aWei });
      } else if (isNativeAddr(tokenBAddr) && !isNativeAddr(tokenAAddr)) {
        tx = await router.addLiquidityZKLTC(tokenAAddr, aWei, aMin, bMin, walletAddr, deadline, { value: bWei });
      } else if (!isNativeAddr(tokenAAddr) && !isNativeAddr(tokenBAddr)) {
        tx = await router.addLiquidity(tokenAAddr, tokenBAddr, aWei, bWei, aMin, bMin, walletAddr, deadline);
      } else {
        throw new Error("Cannot add zkLTC + zkLTC");
      }

      setStatus({ kind: "info", msg: "Confirming…", txHash: tx.hash });
      const receipt = await tx.wait();
      const finalHash = receipt?.hash ?? tx.hash;
      setStatus({ kind: "ok", msg: `Liquidity added! tx ${shortAddr(finalHash)}`, txHash: finalHash });
      setAmountA(""); setAmountB("");
      reloadPair();
      const [m1, m2] = await Promise.all([loadTokenMeta(tokenAAddr, walletAddr), loadTokenMeta(tokenBAddr, walletAddr)]);
      setTokenA(m1); setTokenB(m2);
    } catch (e) {
      setStatus({ kind: "error", msg: "Add failed: " + errMsg(e).slice(0, 160) });
    } finally { setBusy(false); }
  };

  const onApproveLp = async () => {
    if (!pairAddr || !window.ethereum) return;
    setBusy(true);
    setStatus({ kind: "info", msg: "Approving LP…" });
    try {
      await ensureChain();
      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const pair = new Contract(pairAddr, PAIR_ABI, signer);
      const wei = parseUnits(removeAmount || "0", 18);
      const tx = await pair.approve(DEFAULT_ROUTER, wei);
      await tx.wait();
      setStatus({ kind: "ok", msg: "LP approved." });
      const a = await new Contract(pairAddr, PAIR_ABI, readProvider).allowance(walletAddr!, DEFAULT_ROUTER);
      setLpAllowance(BigInt(a));
    } catch (e) {
      setStatus({ kind: "error", msg: "Approval failed: " + errMsg(e).slice(0, 120) });
    } finally { setBusy(false); }
  };

  const onRemoveLiquidity = async () => {
    if (!pairAddr || !walletAddr || !removeAmount || !window.ethereum) return;
    setBusy(true);
    setStatus({ kind: "info", msg: "Removing liquidity…" });
    try {
      await ensureChain();
      const provider = new BrowserProvider(window.ethereum as never);
      const signer = await provider.getSigner();
      const router = new Contract(DEFAULT_ROUTER, ROUTER_ABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SEC;
      const lpWei = parseUnits(removeAmount, 18);
      let tx;
      if (isNativeAddr(tokenAAddr) && !isNativeAddr(tokenBAddr)) {
        tx = await router.removeLiquidityZKLTC(tokenBAddr, lpWei, 0, 0, walletAddr, deadline);
      } else if (isNativeAddr(tokenBAddr) && !isNativeAddr(tokenAAddr)) {
        tx = await router.removeLiquidityZKLTC(tokenAAddr, lpWei, 0, 0, walletAddr, deadline);
      } else {
        tx = await router.removeLiquidity(tokenAAddr, tokenBAddr, lpWei, 0, 0, walletAddr, deadline);
      }
      setStatus({ kind: "info", msg: "Confirming…", txHash: tx.hash });
      const receipt = await tx.wait();
      const finalHash = receipt?.hash ?? tx.hash;
      setStatus({ kind: "ok", msg: `Removed! tx ${shortAddr(finalHash)}`, txHash: finalHash });
      setRemoveAmount("");
      reloadPair();
      const [m1, m2] = await Promise.all([loadTokenMeta(tokenAAddr, walletAddr), loadTokenMeta(tokenBAddr, walletAddr)]);
      setTokenA(m1); setTokenB(m2);
    } catch (e) {
      setStatus({ kind: "error", msg: "Remove failed: " + errMsg(e).slice(0, 160) });
    } finally { setBusy(false); }
  };

  const flip = () => {
    setTokenAAddr(tokenBAddr); setTokenBAddr(tokenAAddr);
    setTokenA(tokenB); setTokenB(tokenA);
    setAmountA(""); setAmountB("");
  };

  const lpBalanceFmt = formatUnits(pairLp.balance, 18);
  const lpShare = pairLp.totalSupply > 0n ? Number((pairLp.balance * 10000n) / pairLp.totalSupply) / 100 : 0;

  // Derived action buttons (Add)
  const needsApproveA = tokenA && !isNativeAddr(tokenAAddr) && (() => {
    try { return parseUnits(amountA || "0", tokenA.decimals) > allowanceA; } catch { return false; }
  })();
  const needsApproveB = tokenB && !isNativeAddr(tokenBAddr) && (() => {
    try { return parseUnits(amountB || "0", tokenB.decimals) > allowanceB; } catch { return false; }
  })();

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs uppercase tracking-[0.25em] text-primary">
          <Droplets className="h-3 w-3" /> Liquidity
        </div>
        <h1 className="mt-3 font-display text-4xl">
          <span className="text-gradient-aurora">Pools</span>
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Provide liquidity to LiteSwap V2 pairs and earn LP tokens · Powered by your own factory & router.
        </p>
      </div>

      <div className="mx-auto max-w-lg">
        <div className="panel-elevated p-5">
          {/* Tabs */}
          <div className="flex gap-1 rounded-xl border border-border bg-background/40 p-1">
            <button
              onClick={() => setTab("add")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "add" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Plus className="h-4 w-4" /> Add
            </button>
            <button
              onClick={() => setTab("remove")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === "remove" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Minus className="h-4 w-4" /> Remove
            </button>
          </div>

          {/* Token A */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{tab === "add" ? "Token A" : "Pair token A"}</span>
              {tokenA && (
                <button onClick={() => setAmountA(tokenA.balance)} className="text-muted-foreground hover:text-primary num">
                  Balance: {(+tokenA.balance).toFixed(4)} {tokenA.symbol}
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3">
              <button onClick={() => setPickerSide("a")} className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 hover:border-primary/40">
                <TokenAvatar symbol={tokenA?.symbol || "?"} />
                <span className="font-display text-sm text-primary">{tokenA?.symbol || "Select"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {tab === "add" ? (
                <input
                  value={amountA}
                  onChange={(e) => setAmountA(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.0" inputMode="decimal"
                  className="w-full bg-transparent text-right font-mono text-2xl text-foreground placeholder:text-muted-foreground/40 focus:outline-none num"
                />
              ) : (
                <div className="w-full text-right font-mono text-sm text-muted-foreground num">
                  {pairAddr ? shortAddr(pairAddr) : "No pair"}
                </div>
              )}
            </div>
          </div>

          {/* Flip / plus */}
          <div className="my-2 flex justify-center">
            <button onClick={flip} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-primary hover:border-primary">
              {tab === "add" ? <Plus className="h-4 w-4" /> : <ArrowDownUp className="h-4 w-4" />}
            </button>
          </div>

          {/* Token B */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{tab === "add" ? "Token B" : "Pair token B"}</span>
              {tokenB && (
                <button onClick={() => setAmountB(tokenB.balance)} className="text-muted-foreground hover:text-primary num">
                  Balance: {(+tokenB.balance).toFixed(4)} {tokenB.symbol}
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-background/60 p-3">
              <button onClick={() => setPickerSide("b")} className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 hover:border-primary/40">
                <TokenAvatar symbol={tokenB?.symbol || "?"} />
                <span className="font-display text-sm text-primary">{tokenB?.symbol || "Select"}</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
              {tab === "add" ? (
                <input
                  value={amountB}
                  onChange={(e) => setAmountB(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.0" inputMode="decimal"
                  className="w-full bg-transparent text-right font-mono text-2xl text-foreground placeholder:text-muted-foreground/40 focus:outline-none num"
                />
              ) : (
                <div className="w-full text-right text-xs text-muted-foreground num">
                  LP balance: {(+lpBalanceFmt).toFixed(6)}
                </div>
              )}
            </div>
          </div>

          {/* Remove form */}
          {tab === "remove" && (
            <div className="mt-4 space-y-3 rounded-xl border border-border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">LP tokens to burn</div>
              <div className="flex items-center gap-2">
                <input
                  value={removeAmount}
                  onChange={(e) => setRemoveAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.0" inputMode="decimal"
                  className="w-full bg-transparent font-mono text-2xl text-foreground placeholder:text-muted-foreground/40 focus:outline-none num"
                />
                <button onClick={() => setRemoveAmount(lpBalanceFmt)} className="rounded-lg border border-border px-2 py-1 text-xs hover:border-primary/40 hover:text-primary">
                  MAX
                </button>
              </div>
              <div className="flex justify-between text-[11px] text-muted-foreground num">
                <span>Pool share</span>
                <span>{lpShare.toFixed(4)}%</span>
              </div>
            </div>
          )}

          {/* Pair info */}
          {pairAddr && (
            <div className="mt-4 space-y-1.5 rounded-xl border border-border bg-background/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pair</span>
                <a href={`${EXPLORER_URL}/address/${pairAddr}`} target="_blank" rel="noreferrer" className="num text-primary hover:underline">
                  {shortAddr(pairAddr)} <ExternalLink className="inline h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Your LP</span>
                <span className="num text-foreground">{(+lpBalanceFmt).toFixed(6)}</span>
              </div>
            </div>
          )}

          {/* Status */}
          {status.kind !== "idle" && status.msg && (
            <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs ${
              status.kind === "error" ? "border-destructive/40 bg-destructive/10 text-destructive"
              : status.kind === "ok" ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-surface text-foreground"
            }`}>
              <span className="min-w-0 break-words">{status.msg}</span>
              {status.txHash && (
                <a href={`${EXPLORER_URL}/tx/${status.txHash}`} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-current px-2 py-1 hover:bg-current/10">
                  Explorer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 space-y-2">
            {!isConnected ? (
              <button disabled className="h-12 w-full rounded-xl border border-border bg-surface text-sm text-muted-foreground">
                Connect wallet
              </button>
            ) : tab === "add" ? (
              <>
                {needsApproveA && (
                  <button onClick={() => onApprove("a")} disabled={busy} className="btn-primary h-12 w-full text-sm">
                    Approve {tokenA?.symbol}
                  </button>
                )}
                {needsApproveB && (
                  <button onClick={() => onApprove("b")} disabled={busy} className="btn-primary h-12 w-full text-sm">
                    Approve {tokenB?.symbol}
                  </button>
                )}
                <button
                  onClick={onAddLiquidity}
                  disabled={busy || !!needsApproveA || !!needsApproveB || !amountA || !amountB}
                  className="btn-primary h-12 w-full text-sm"
                >
                  {busy ? "Working…" : "Add Liquidity"}
                </button>
              </>
            ) : (
              <>
                {pairAddr && removeAmount && (() => {
                  try { return parseUnits(removeAmount, 18) > lpAllowance; } catch { return false; }
                })() && (
                  <button onClick={onApproveLp} disabled={busy} className="btn-primary h-12 w-full text-sm">
                    Approve LP
                  </button>
                )}
                <button
                  onClick={onRemoveLiquidity}
                  disabled={busy || !pairAddr || !removeAmount}
                  className="btn-primary h-12 w-full text-sm"
                >
                  {busy ? "Working…" : "Remove Liquidity"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-3 text-center text-[11px] text-muted-foreground num">
          Factory <a href={`${EXPLORER_URL}/address/${DEFAULT_FACTORY}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{shortAddr(DEFAULT_FACTORY)}</a>
          {" · "}Router <a href={`${EXPLORER_URL}/address/${DEFAULT_ROUTER}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">{shortAddr(DEFAULT_ROUTER)}</a>
        </div>
      </div>

      <TokenPickerModal
        open={pickerSide !== null}
        onClose={() => setPickerSide(null)}
        onPick={(addr) => {
          if (pickerSide === "a") setTokenAAddr(addr);
          else if (pickerSide === "b") setTokenBAddr(addr);
          setPickerSide(null);
        }}
      />
    </div>
  );
}
