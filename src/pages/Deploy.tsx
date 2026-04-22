import { useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, formatUnits, parseEther } from "ethers";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Rocket,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Flame,
  Pause,
  Play,
  Plus,
  Users,
  Wallet,
  Coins,
} from "lucide-react";
import {
  TOKEN_FACTORY_ABI,
  TOKEN_FACTORY_ADDRESS,
  TOKEN_FACTORY_CHAIN_ID,
  CUSTOM_TOKEN_ABI,
  SEPOLIA_EXPLORER,
  type TokenInfo,
} from "@/lib/tokenFactory";
import { errMsg, shortAddr } from "@/lib/litvm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";

type Status =
  | { kind: "idle" }
  | { kind: "info"; msg: string }
  | { kind: "ok"; msg: string; tx?: string; tokenAddr?: string }
  | { kind: "error"; msg: string };

type FormState = {
  name: string;
  symbol: string;
  decimals: string;
  totalSupply: string;
  mintable: boolean;
  burnable: boolean;
  pausable: boolean;
};

const DEFAULT_FORM: FormState = {
  name: "",
  symbol: "",
  decimals: "18",
  totalSupply: "1000000",
  mintable: true,
  burnable: true,
  pausable: false,
};

function getEthereum(): { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null {
  return (window as unknown as { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum ?? null;
}

async function ensureSepolia() {
  const eth = getEthereum();
  if (!eth) throw new Error("No wallet detected");
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0xaa36a7" }], // 11155111
    });
  } catch (err: unknown) {
    const e = err as { code?: number };
    if (e?.code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0xaa36a7",
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.drpc.org"],
            blockExplorerUrls: [SEPOLIA_EXPLORER],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

function copyText(text: string, label = "Copied") {
  navigator.clipboard.writeText(text);
  toast({ title: label, description: text });
}

export default function Deploy() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const [deployFee, setDeployFee] = useState<string>("0.05");
  const [totalDeployed, setTotalDeployed] = useState<number | null>(null);
  const [myTokens, setMyTokens] = useState<TokenInfo[]>([]);
  const [allTokens, setAllTokens] = useState<TokenInfo[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const onSepolia = chainId === TOKEN_FACTORY_CHAIN_ID;

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Load factory stats + tokens via public RPC (read-only, doesn't need wallet on Sepolia)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { JsonRpcProvider } = await import("ethers");
        const provider = new JsonRpcProvider("https://sepolia.drpc.org");
        const factory = new Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, provider);

        const [fee, total] = await Promise.all([
          factory.deployFee() as Promise<bigint>,
          factory.getTotalDeployed() as Promise<bigint>,
        ]);
        if (cancelled) return;
        setDeployFee(formatUnits(fee, 18));
        setTotalDeployed(Number(total));

        // Load all tokens (last 20)
        const all = (await factory.getAllTokens()) as string[];
        const recent = all.slice(-20).reverse();
        const infos = await Promise.all(
          recent.map(async (addr) => {
            try {
              return (await factory.getTokenInfo(addr)) as TokenInfo;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        setAllTokens(infos.filter((i): i is TokenInfo => i !== null));

        // Load my tokens
        if (address) {
          const mine = (await factory.getTokensByCreator(address)) as string[];
          const myInfos = await Promise.all(
            mine.map(async (addr) => {
              try {
                return (await factory.getTokenInfo(addr)) as TokenInfo;
              } catch {
                return null;
              }
            })
          );
          if (cancelled) return;
          setMyTokens(myInfos.filter((i): i is TokenInfo => i !== null).reverse());
        } else {
          setMyTokens([]);
        }
      } catch (e) {
        console.error("Factory load failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, refreshKey]);

  async function onDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) {
      setStatus({ kind: "error", msg: "Connect wallet first" });
      return;
    }
    const eth = getEthereum();
    if (!eth) {
      setStatus({ kind: "error", msg: "No wallet detected" });
      return;
    }

    const name = form.name.trim();
    const symbol = form.symbol.trim();
    const decimals = parseInt(form.decimals, 10);
    const supply = form.totalSupply.trim();

    if (!name) return setStatus({ kind: "error", msg: "Name required" });
    if (!symbol) return setStatus({ kind: "error", msg: "Symbol required" });
    if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18)
      return setStatus({ kind: "error", msg: "Decimals must be 0-18" });
    if (!/^\d+$/.test(supply) || BigInt(supply) <= 0n)
      return setStatus({ kind: "error", msg: "Supply must be a positive integer" });

    setBusy(true);
    setStatus({ kind: "info", msg: "Switching to Sepolia…" });
    try {
      if (!onSepolia) {
        try {
          await switchChain({ chainId: TOKEN_FACTORY_CHAIN_ID });
        } catch {
          await ensureSepolia();
        }
      }

      setStatus({ kind: "info", msg: "Preparing transaction…" });
      const provider = new BrowserProvider(eth as unknown as ConstructorParameters<typeof BrowserProvider>[0]);
      const signer = await provider.getSigner();
      const factory = new Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, signer);

      const fee = (await factory.deployFee()) as bigint;

      setStatus({ kind: "info", msg: `Deploying ${symbol}… confirm in wallet (${formatUnits(fee, 18)} ETH fee)` });
      const tx = await factory.deployToken(
        name,
        symbol,
        decimals,
        BigInt(supply),
        form.mintable,
        form.burnable,
        form.pausable,
        { value: fee }
      );
      setStatus({ kind: "info", msg: `Tx submitted: ${tx.hash.slice(0, 10)}… waiting for confirmation` });

      const receipt = await tx.wait();

      // Parse event for token address
      let tokenAddr: string | undefined;
      try {
        for (const log of receipt?.logs ?? []) {
          try {
            const parsed = factory.interface.parseLog(log);
            if (parsed?.name === "TokenDeployed") {
              tokenAddr = parsed.args[0] as string;
              break;
            }
          } catch { /* not our event */ }
        }
      } catch { /* ignore */ }

      setStatus({
        kind: "ok",
        msg: `${symbol} deployed successfully!`,
        tx: tx.hash,
        tokenAddr,
      });
      toast({ title: "Token deployed!", description: `${symbol} live on Sepolia` });
      setForm(DEFAULT_FORM);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setStatus({ kind: "error", msg: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }

  async function tokenAction(tokenAddr: string, action: "pause" | "unpause" | "burn" | "mint", arg?: string) {
    const eth = getEthereum();
    if (!eth) return toast({ title: "No wallet", description: "Connect wallet first" });
    try {
      if (!onSepolia) {
        try { await switchChain({ chainId: TOKEN_FACTORY_CHAIN_ID }); }
        catch { await ensureSepolia(); }
      }
      const provider = new BrowserProvider(eth as unknown as ConstructorParameters<typeof BrowserProvider>[0]);
      const signer = await provider.getSigner();
      const token = new Contract(tokenAddr, CUSTOM_TOKEN_ABI, signer);

      let tx;
      if (action === "pause") tx = await token.pause();
      else if (action === "unpause") tx = await token.unpause();
      else if (action === "burn") {
        const decimals = (await token.decimals()) as number;
        tx = await token.burn(BigInt(arg ?? "0") * (10n ** BigInt(decimals)));
      } else if (action === "mint") {
        const decimals = (await token.decimals()) as number;
        tx = await token.mint(address, BigInt(arg ?? "0") * (10n ** BigInt(decimals)));
      }
      toast({ title: "Tx submitted", description: tx.hash.slice(0, 18) + "…" });
      await tx.wait();
      toast({ title: `${action} confirmed`, description: shortAddr(tokenAddr) });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({ title: "Failed", description: errMsg(e) });
    }
  }

  const supplyPreview = useMemo(() => {
    if (!/^\d+$/.test(form.totalSupply)) return null;
    try {
      return BigInt(form.totalSupply).toLocaleString("en-US");
    } catch {
      return null;
    }
  }, [form.totalSupply]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            <Rocket className="h-3.5 w-3.5 text-primary" />
            Token Deployer
          </div>
          <h1 className="font-display text-4xl text-gradient-fire md:text-5xl">Deploy ERC-20</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One-click ERC-20 factory · {deployFee} ETH fee · Sepolia testnet
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-sm border border-border bg-surface px-3 py-2 text-xs">
            <div className="text-muted-foreground">Total Deployed</div>
            <div className="font-display text-xl text-primary">{totalDeployed ?? "—"}</div>
          </div>
          <div className="rounded-sm border border-border bg-surface px-3 py-2 text-xs">
            <div className="text-muted-foreground">Factory</div>
            <button
              onClick={() => copyText(TOKEN_FACTORY_ADDRESS, "Factory address copied")}
              className="flex items-center gap-1 font-mono text-sm text-foreground hover:text-primary"
            >
              {shortAddr(TOKEN_FACTORY_ADDRESS)}
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </div>
      </header>

      {/* Network warning */}
      {isConnected && !onSepolia && (
        <div className="flex items-start gap-3 rounded-sm border border-fire/40 bg-fire/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-fire" />
          <div className="flex-1">
            <div className="font-medium text-foreground">Wrong network</div>
            <div className="text-xs text-muted-foreground">
              TokenFactory lives on Sepolia (Chain 11155111). Switch network to deploy.
            </div>
          </div>
          <button
            onClick={() => switchChain({ chainId: TOKEN_FACTORY_CHAIN_ID })}
            className="rounded-sm border border-fire bg-fire/20 px-3 py-1.5 text-xs font-medium text-fire hover:bg-fire/30"
          >
            Switch to Sepolia
          </button>
        </div>
      )}

      <Tabs defaultValue="deploy" className="space-y-4">
        <TabsList>
          <TabsTrigger value="deploy">
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Deploy
          </TabsTrigger>
          <TabsTrigger value="mine">
            <Wallet className="mr-1.5 h-3.5 w-3.5" /> My Tokens ({myTokens.length})
          </TabsTrigger>
          <TabsTrigger value="all">
            <Users className="mr-1.5 h-3.5 w-3.5" /> All Tokens
          </TabsTrigger>
        </TabsList>

        {/* Deploy tab */}
        <TabsContent value="deploy" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <form onSubmit={onDeploy} className="panel space-y-4 p-5 lg:col-span-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                    Token Name
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="My Awesome Token"
                    className="h-10 w-full rounded-sm border border-border bg-background px-3 text-sm focus:border-primary focus:outline-none"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                    Symbol
                  </label>
                  <input
                    value={form.symbol}
                    onChange={(e) => update("symbol", e.target.value.toUpperCase())}
                    placeholder="MAT"
                    maxLength={11}
                    className="h-10 w-full rounded-sm border border-border bg-background px-3 font-mono text-sm uppercase focus:border-primary focus:outline-none"
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                    Decimals
                  </label>
                  <input
                    value={form.decimals}
                    onChange={(e) => update("decimals", e.target.value.replace(/\D/g, ""))}
                    placeholder="18"
                    className="h-10 w-full rounded-sm border border-border bg-background px-3 font-mono text-sm focus:border-primary focus:outline-none"
                    disabled={busy}
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">0–18 (standard: 18)</div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs uppercase tracking-wider text-muted-foreground">
                    Total Supply
                  </label>
                  <input
                    value={form.totalSupply}
                    onChange={(e) => update("totalSupply", e.target.value.replace(/\D/g, ""))}
                    placeholder="1000000"
                    className="h-10 w-full rounded-sm border border-border bg-background px-3 font-mono text-sm focus:border-primary focus:outline-none"
                    disabled={busy}
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {supplyPreview ? `${supplyPreview} ${form.symbol || "tokens"}` : "Whole units (no decimals)"}
                  </div>
                </div>
              </div>

              {/* Feature toggles */}
              <div>
                <label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                  Features
                </label>
                <div className="grid gap-2 md:grid-cols-3">
                  {[
                    { key: "mintable", label: "Mintable", desc: "Owner can mint more" },
                    { key: "burnable", label: "Burnable", desc: "Holders can burn" },
                    { key: "pausable", label: "Pausable", desc: "Owner can pause transfers" },
                  ].map((f) => (
                    <label
                      key={f.key}
                      className={`cursor-pointer rounded-sm border px-3 py-2.5 transition-colors ${
                        form[f.key as keyof FormState]
                          ? "border-primary bg-primary/10"
                          : "border-border bg-surface hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{f.label}</span>
                        <input
                          type="checkbox"
                          checked={Boolean(form[f.key as keyof FormState])}
                          onChange={(e) => update(f.key as keyof FormState, e.target.checked as never)}
                          className="h-4 w-4 accent-primary"
                          disabled={busy}
                        />
                      </div>
                      <div className="text-[10px] text-muted-foreground">{f.desc}</div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              {status.kind !== "idle" && (
                <div
                  className={`flex items-start gap-2 rounded-sm border px-3 py-2.5 text-sm ${
                    status.kind === "ok"
                      ? "border-green-500/40 bg-green-500/10 text-green-400"
                      : status.kind === "error"
                      ? "border-fire/40 bg-fire/10 text-fire"
                      : "border-primary/40 bg-primary/10 text-primary"
                  }`}
                >
                  {status.kind === "ok" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : status.kind === "error" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                  )}
                  <div className="flex-1 break-words">
                    <div>{status.msg}</div>
                    {status.kind === "ok" && status.tokenAddr && (
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                        <span className="font-mono">{status.tokenAddr}</span>
                        <button onClick={() => copyText(status.tokenAddr!)} className="hover:text-foreground">
                          <Copy className="inline h-3 w-3" /> copy
                        </button>
                        <a
                          href={`${SEPOLIA_EXPLORER}/address/${status.tokenAddr}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-foreground"
                        >
                          <ExternalLink className="inline h-3 w-3" /> explorer
                        </a>
                      </div>
                    )}
                    {status.kind === "ok" && status.tx && (
                      <a
                        href={`${SEPOLIA_EXPLORER}/tx/${status.tx}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs hover:text-foreground"
                      >
                        view tx <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {!isConnected ? (
                <div className="flex justify-center">
                  <ConnectButton />
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-gradient-fire text-base font-medium text-primary-foreground shadow-glow-fire transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Deploying…
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" /> Deploy Token ({deployFee} ETH)
                    </>
                  )}
                </button>
              )}
            </form>

            {/* Side info */}
            <aside className="space-y-4">
              <div className="panel p-5">
                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Coins className="h-3.5 w-3.5" /> How it works
                </div>
                <ol className="space-y-2 text-sm text-foreground/85">
                  <li>1. Fill token details &amp; pick features.</li>
                  <li>2. Pay {deployFee} ETH deploy fee on Sepolia.</li>
                  <li>3. Factory deploys your ERC-20 instantly.</li>
                  <li>4. Full supply minted to your wallet.</li>
                </ol>
              </div>
              <div className="panel p-5 text-xs">
                <div className="mb-2 flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-fire" /> Heads up
                </div>
                <p className="text-foreground/75">
                  Factory is deployed on <span className="text-fire">Sepolia testnet</span>, not LitVM.
                  You'll be prompted to switch networks when deploying.
                </p>
              </div>
            </aside>
          </div>
        </TabsContent>

        {/* My tokens */}
        <TabsContent value="mine" className="space-y-3">
          {!isConnected ? (
            <div className="panel flex flex-col items-center gap-3 p-10 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">Connect wallet to see your deployed tokens</div>
              <ConnectButton />
            </div>
          ) : myTokens.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              You haven't deployed any tokens yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {myTokens.map((t) => (
                <TokenCard key={t.contractAddress} token={t} owned onAction={tokenAction} />
              ))}
            </div>
          )}
        </TabsContent>

        {/* All tokens */}
        <TabsContent value="all" className="space-y-3">
          {allTokens.length === 0 ? (
            <div className="panel p-10 text-center text-sm text-muted-foreground">
              No tokens deployed yet via this factory.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {allTokens.map((t) => (
                <TokenCard key={t.contractAddress} token={t} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TokenCard({
  token,
  owned,
  onAction,
}: {
  token: TokenInfo;
  owned?: boolean;
  onAction?: (addr: string, action: "pause" | "unpause" | "burn" | "mint", arg?: string) => void;
}) {
  const [mintAmt, setMintAmt] = useState("");
  const [burnAmt, setBurnAmt] = useState("");
  const deployedDate = new Date(Number(token.deployedAt) * 1000).toLocaleDateString();

  return (
    <div className="panel p-4 transition-shadow hover:shadow-glow-cyan">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-display text-xl text-foreground">{token.symbol}</div>
            <span className="truncate text-xs text-muted-foreground">{token.name}</span>
          </div>
          <button
            onClick={() => copyText(token.contractAddress, "Token address copied")}
            className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary"
          >
            {shortAddr(token.contractAddress)} <Copy className="h-3 w-3" />
          </button>
        </div>
        <a
          href={`${SEPOLIA_EXPLORER}/address/${token.contractAddress}`}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-primary"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Supply</div>
          <div className="font-mono text-foreground">{token.totalSupply.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Decimals</div>
          <div className="font-mono text-foreground">{token.decimals}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Creator</div>
          <div className="font-mono text-foreground">{shortAddr(token.creator)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Deployed</div>
          <div className="text-foreground">{deployedDate}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {token.mintable && <span className="chip text-[10px]">MINTABLE</span>}
        {token.burnable && <span className="chip text-[10px]">BURNABLE</span>}
        {token.pausable && <span className="chip text-[10px]">PAUSABLE</span>}
      </div>

      {owned && onAction && (
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          {token.mintable && (
            <div className="flex gap-2">
              <input
                value={mintAmt}
                onChange={(e) => setMintAmt(e.target.value.replace(/\D/g, ""))}
                placeholder="Amount"
                className="h-8 flex-1 rounded-sm border border-border bg-background px-2 font-mono text-xs"
              />
              <button
                onClick={() => mintAmt && onAction(token.contractAddress, "mint", mintAmt)}
                className="flex items-center gap-1 rounded-sm border border-primary/50 bg-primary/10 px-2.5 text-xs text-primary hover:bg-primary/20"
              >
                <Plus className="h-3 w-3" /> Mint
              </button>
            </div>
          )}
          {token.burnable && (
            <div className="flex gap-2">
              <input
                value={burnAmt}
                onChange={(e) => setBurnAmt(e.target.value.replace(/\D/g, ""))}
                placeholder="Amount"
                className="h-8 flex-1 rounded-sm border border-border bg-background px-2 font-mono text-xs"
              />
              <button
                onClick={() => burnAmt && onAction(token.contractAddress, "burn", burnAmt)}
                className="flex items-center gap-1 rounded-sm border border-fire/50 bg-fire/10 px-2.5 text-xs text-fire hover:bg-fire/20"
              >
                <Flame className="h-3 w-3" /> Burn
              </button>
            </div>
          )}
          {token.pausable && (
            <div className="flex gap-2">
              <button
                onClick={() => onAction(token.contractAddress, "pause")}
                className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-border bg-surface px-2 py-1.5 text-xs hover:border-fire/50 hover:text-fire"
              >
                <Pause className="h-3 w-3" /> Pause
              </button>
              <button
                onClick={() => onAction(token.contractAddress, "unpause")}
                className="flex flex-1 items-center justify-center gap-1 rounded-sm border border-border bg-surface px-2 py-1.5 text-xs hover:border-primary/50 hover:text-primary"
              >
                <Play className="h-3 w-3" /> Unpause
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function copyText(text: string, label = "Copied") {
  navigator.clipboard.writeText(text);
  toast({ title: label, description: text });
}
