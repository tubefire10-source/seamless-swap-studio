import { useEffect, useMemo, useState } from "react";
import {
  Hammer,
  Copy,
  Download,
  Check,
  ExternalLink,
  Rocket,
  Zap,
  ShieldCheck,
  Coins,
  Image as ImageIcon,
  Lock,
  Hourglass,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useAccount, useChainId, usePublicClient, useReadContract, useSwitchChain, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther, parseEther, parseUnits, isAddress, decodeEventLog, type Hex } from "viem";
import { EXPLORER_URL, LITVM_CHAIN_ID, shortAddr } from "@/lib/litvm";
import {
  LITVM_FACTORY_ABI,
  LITVM_FACTORY_ADDRESS,
  LITVM_FACTORY_DEFAULT_FEE_ETHER,
  LITVM_FACTORY_NATIVE_SYMBOL,
  FACTORY_TYPE_LABEL,
} from "@/lib/litvmFactory";
import {
  Erc20Form,
  ForgeKind,
  NftForm,
  StakingForm,
  VestingForm,
  genErc20,
  genNft,
  genStaking,
  genVesting,
  getContractName,
  type FactoryForm,
} from "@/lib/forgeTemplates";

type DeployStatus =
  | { kind: "idle" }
  | { kind: "deploying"; tx?: `0x${string}` }
  | { kind: "ok"; tx: `0x${string}`; address: `0x${string}` }
  | { kind: "error"; msg: string };

type SupportedKind = Exclude<ForgeKind, "factory">;

const TABS: { value: SupportedKind; label: string; icon: typeof Coins; desc: string }[] = [
  { value: "erc20", label: "ERC20 Token", icon: Coins, desc: "Standard fungible token with optional mint, burn, pause." },
  { value: "nft", label: "NFT (ERC721)", icon: ImageIcon, desc: "ERC721 collection with mint price, max supply, public mint toggle." },
  { value: "staking", label: "Staking", icon: Lock, desc: "Single-asset staking pool with daily reward rate and lock period." },
  { value: "vesting", label: "Vesting", icon: Hourglass, desc: "Cliff + linear vesting for team / investor / advisor allocations." },
];

const initErc20: Erc20Form = {
  name: "",
  symbol: "",
  supply: "1000000",
  decimals: "18",
  owner: "",
  mintable: true,
  burnable: true,
  pausable: true,
  ownable: true,
  tax: false,
  reentrancyGuard: true,
  taxBps: "200",
  taxAddr: "",
};

const initNft: NftForm = {
  name: "",
  symbol: "",
  maxSupply: "10000",
  price: "0.05",
  perWallet: "5",
  baseUri: "",
  whitelist: false,
  reveal: false,
  royalty: false,
  royaltyBps: "500",
  royaltyAddr: "",
};

const initStaking: StakingForm = {
  contractName: "",
  stakeToken: "",
  rewardToken: "",
  apr: "12",
  lockDays: "30",
  minStake: "1",
  emergency: true,
  pausable: true,
  autoCompound: false,
};

const initVesting: VestingForm = {
  contractName: "",
  token: "",
  cliffDays: "90",
  durationDays: "365",
  beneficiary: "",
  amount: "",
  revocable: true,
  multiBeneficiary: false,
  emitEvents: true,
};

const initFactoryForm: FactoryForm = {
  contractName: "LitVMTokenFactory",
  fee: "0.05",
  owner: "",
  mintable: true,
  burnable: true,
  pausable: true,
  customDecimals: true,
  trackTokens: true,
  whitelist: false,
};

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[10px] font-mono text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function Toggle({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-xs transition-all ${
        checked
          ? "border-primary/60 bg-primary/10 text-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]"
          : "border-border bg-card/40 text-muted-foreground hover:border-primary/30"
      }`}
    >
      <span className="font-medium">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </button>
  );
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-muted-foreground/70">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export default function Forge() {
  const [tab, setTab] = useState<SupportedKind>("erc20");
  const [erc20, setErc20] = useState<Erc20Form>(initErc20);
  const [nft, setNft] = useState<NftForm>(initNft);
  const [staking, setStaking] = useState<StakingForm>(initStaking);
  const [vesting, setVesting] = useState<VestingForm>(initVesting);
  const [generated, setGenerated] = useState<Record<SupportedKind, string>>({
    erc20: "",
    nft: "",
    staking: "",
    vesting: "",
  });
  const [copied, setCopied] = useState(false);
  const [deploy, setDeploy] = useState<DeployStatus>({ kind: "idle" });
  const [showDeploy, setShowDeploy] = useState(false);
  const [myContracts, setMyContracts] = useState<Array<{ address: `0x${string}`; type: number; label: string; deployedAt: number }>>([]);

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: LITVM_CHAIN_ID });

  const { data: feeWei } = useReadContract({
    address: LITVM_FACTORY_ADDRESS,
    abi: LITVM_FACTORY_ABI,
    functionName: "deployFee",
    chainId: LITVM_CHAIN_ID,
  });
  const feeEther = feeWei ? formatEther(feeWei as bigint) : LITVM_FACTORY_DEFAULT_FEE_ETHER;

  const code = generated[tab];
  const forms = { erc20, nft, staking, vesting, factory: initFactoryForm };
  const contractName = getContractName(tab, forms);
  const fileName = useMemo(() => contractName + ".sol", [contractName]);

  const loadMine = async () => {
    if (!address || !publicClient) return;
    try {
      const addrs = (await publicClient.readContract({
        address: LITVM_FACTORY_ADDRESS,
        abi: LITVM_FACTORY_ABI,
        functionName: "getContractsByCreator",
        args: [address],
      })) as `0x${string}`[];

      const infos = await Promise.all(
        addrs.map((a) =>
          publicClient.readContract({
            address: LITVM_FACTORY_ADDRESS,
            abi: LITVM_FACTORY_ABI,
            functionName: "getContractInfo",
            args: [a],
          }),
        ),
      );
      setMyContracts(
        (infos as Array<{ contractAddress: `0x${string}`; contractType: number; label: string; deployedAt: bigint }>)
          .map((i) => ({
            address: i.contractAddress,
            type: Number(i.contractType),
            label: i.label,
            deployedAt: Number(i.deployedAt),
          }))
          .reverse(),
      );
    } catch (e) {
      console.warn("loadMine failed", e);
    }
  };

  useEffect(() => {
    loadMine();
  }, [address, publicClient]);

  const onGenerate = () => {
    let out = "";
    if (tab === "erc20") out = genErc20(erc20);
    else if (tab === "nft") out = genNft(nft);
    else if (tab === "staking") out = genStaking(staking);
    else out = genVesting(vesting);
    setGenerated((p) => ({ ...p, [tab]: out }));
    toast({ title: "Contract preview generated", description: `${fileName} ready to copy or deploy.` });
    requestAnimationFrame(() => {
      document.getElementById("forge-output")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const onDownload = () => {
    const blob = new Blob([code], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const buildFactoryCall = (): {
    functionName: "deployERC20" | "deployNFT" | "deployStaking" | "deployVesting";
    args: readonly unknown[];
    value: bigint;
  } => {
    const value = (feeWei as bigint | undefined) ?? parseEther(LITVM_FACTORY_DEFAULT_FEE_ETHER);

    if (tab === "erc20") {
      if (!erc20.name.trim()) throw new Error("Token name is required");
      if (!erc20.symbol.trim()) throw new Error("Token symbol is required");
      const decimals = Number(erc20.decimals || "18");
      if (!Number.isFinite(decimals) || decimals < 0 || decimals > 18) throw new Error("Decimals must be 0–18");
      const supply = BigInt(erc20.supply || "0");
      if (supply <= 0n) throw new Error("Supply must be greater than 0");
      return {
        functionName: "deployERC20",
        args: [
          erc20.name.trim(),
          erc20.symbol.trim(),
          decimals,
          supply,
          erc20.mintable,
          erc20.burnable,
          erc20.pausable,
        ],
        value,
      };
    }

    if (tab === "nft") {
      if (!nft.name.trim()) throw new Error("Collection name is required");
      if (!nft.symbol.trim()) throw new Error("Symbol is required");
      const maxSupply = BigInt(nft.maxSupply || "0");
      if (maxSupply <= 0n) throw new Error("Max supply must be greater than 0");
      const mintPriceWei = parseEther(nft.price || "0");
      return {
        functionName: "deployNFT",
        args: [
          nft.name.trim(),
          nft.symbol.trim(),
          nft.baseUri.trim(),
          maxSupply,
          mintPriceWei,
          true,
        ],
        value,
      };
    }

    if (tab === "staking") {
      if (!isAddress(staking.stakeToken)) throw new Error("Invalid staking token address");
      const reward = staking.rewardToken && staking.rewardToken.trim().length
        ? staking.rewardToken
        : staking.stakeToken;
      if (!isAddress(reward)) throw new Error("Invalid reward token address");
      const aprNum = Number(staking.apr || "0");
      if (!Number.isFinite(aprNum) || aprNum < 0) throw new Error("Invalid APR");
      const aprScaled = parseUnits(aprNum.toString(), 18);
      const ratePerDay = aprScaled / (100n * 365n);
      const lockDays = BigInt(staking.lockDays || "0");
      const label = (staking.contractName || `${shortAddr(staking.stakeToken)} Staking`).trim();
      return {
        functionName: "deployStaking",
        args: [staking.stakeToken, reward, ratePerDay, lockDays, label],
        value,
      };
    }

    if (!isAddress(vesting.token)) throw new Error("Invalid token address");
    if (!isAddress(vesting.beneficiary)) throw new Error("Invalid beneficiary address");
    const amount = BigInt(vesting.amount || "0");
    if (amount <= 0n) throw new Error("Vesting amount must be greater than 0");
    const cliffDays = BigInt(vesting.cliffDays || "0");
    const durationDays = BigInt(vesting.durationDays || "0");
    if (durationDays <= 0n) throw new Error("Vesting duration must be greater than 0");
    const label = (vesting.contractName || "Vesting").trim();
    return {
      functionName: "deployVesting",
      args: [vesting.token, vesting.beneficiary, amount, cliffDays, durationDays, vesting.revocable, label],
      value,
    };
  };

  const onDeploy = async () => {
    if (!isConnected || !walletClient || !address) {
      toast({ title: "Connect wallet", description: "Connect your wallet to deploy on LitVM.", variant: "destructive" });
      return;
    }
    setShowDeploy(true);
    setDeploy({ kind: "deploying" });
    try {
      if (chainId !== LITVM_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: LITVM_CHAIN_ID });
        } catch {
          throw new Error("Please switch your wallet to LitVM (Chain 4441) and try again.");
        }
      }
      const { functionName, args, value } = buildFactoryCall();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callArgs: any = args;

      await publicClient!.simulateContract({
        address: LITVM_FACTORY_ADDRESS,
        abi: LITVM_FACTORY_ABI,
        functionName,
        args: callArgs,
        value,
        account: address,
      });

      const hash = await walletClient.writeContract({
        address: LITVM_FACTORY_ADDRESS,
        abi: LITVM_FACTORY_ABI,
        functionName,
        args: callArgs,
        value,
        account: walletClient.account,
        chain: walletClient.chain,
      });
      setDeploy({ kind: "deploying", tx: hash });

      const receipt = await publicClient!.waitForTransactionReceipt({ hash });

      let deployedAddr: `0x${string}` | undefined;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== LITVM_FACTORY_ADDRESS.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: LITVM_FACTORY_ABI,
            data: log.data as Hex,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            topics: (log as any).topics,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any;
          if (decoded.eventName === "ContractDeployed") {
            deployedAddr = decoded.args.contractAddress as `0x${string}`;
            break;
          }
        } catch {
          /* skip non-matching logs */
        }
      }
      if (!deployedAddr) throw new Error("Deployment confirmed but contract address not found in logs.");

      setDeploy({ kind: "ok", tx: hash, address: deployedAddr });
      toast({ title: "Contract deployed 🚀", description: `Live at ${shortAddr(deployedAddr)}` });
      loadMine();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setDeploy({ kind: "error", msg: err?.shortMessage || err?.message || String(e) });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-card/20 p-6 backdrop-blur-xl md:p-10">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-primary">
              <Hammer className="h-3 w-3" /> Contract Forge · 1-Click Deploy
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Create & deploy on <span className="text-gradient-aurora">LitVM</span>
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Fill the form → deploy in one transaction. No Remix, no compiler, no setup. Powered by the on-chain{" "}
              <a
                href={`${EXPLORER_URL}/address/${LITVM_FACTORY_ADDRESS}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-primary hover:underline"
              >
                LitVMFactory
              </a>{" "}
              on Chain 4441.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 font-mono text-[11px] text-muted-foreground">
              <span className="rounded-full border border-border bg-card/60 px-2.5 py-1">
                Fee: <span className="text-primary">{feeEther} {LITVM_FACTORY_NATIVE_SYMBOL}</span>
              </span>
              <span className="rounded-full border border-border bg-card/60 px-2.5 py-1">
                Factory: <span className="text-foreground/80">{shortAddr(LITVM_FACTORY_ADDRESS)}</span>
              </span>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as SupportedKind)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="gap-2 rounded-xl border border-border bg-card/50 px-4 py-2.5 text-xs font-medium text-muted-foreground backdrop-blur transition-all data-[state=active]:border-primary/60 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-glow-violet"
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="mt-6">
            <Card className="border-border/60 bg-card/60 p-6 backdrop-blur-xl md:p-8">
              <div className="mb-6 flex items-start gap-3">
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5">
                  <t.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-semibold">{t.label}</h2>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">// {t.desc}</p>
                </div>
              </div>

              {t.value === "erc20" && <Erc20Panel form={erc20} setForm={setErc20} />}
              {t.value === "nft" && <NftPanel form={nft} setForm={setNft} />}
              {t.value === "staking" && <StakingPanel form={staking} setForm={setStaking} />}
              {t.value === "vesting" && <VestingPanel form={vesting} setForm={setVesting} />}

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  onClick={onGenerate}
                  size="lg"
                  variant="outline"
                  className="gap-2 text-sm font-medium"
                >
                  <Zap className="h-4 w-4" /> Preview Source
                </Button>
                <Button
                  onClick={onDeploy}
                  disabled={deploy.kind === "deploying"}
                  size="lg"
                  className="gap-2 bg-gradient-violet text-base font-semibold shadow-glow-violet hover:opacity-90"
                >
                  {deploy.kind === "deploying" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Deploy ({feeEther} {LITVM_FACTORY_NATIVE_SYMBOL})
                </Button>
              </div>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {code && (
        <Card id="forge-output" className="overflow-hidden border-primary/20 bg-card/70 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="font-mono text-sm text-primary">{fileName}</div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">
                <span className="status-dot" /> Source preview
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={onCopy} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={onDownload} className="gap-1.5">
                <Download className="h-3.5 w-3.5" /> Download
              </Button>
            </div>
          </div>
          <pre className="max-h-[600px] overflow-auto bg-background/40 p-5 font-mono text-xs leading-relaxed text-foreground/90">
            <code>{code}</code>
          </pre>
          <div className="flex items-start gap-2 border-t border-border/60 bg-card/60 px-5 py-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-primary" />
            <p>
              Reference source — your actual deployment uses the audited on-chain factory at{" "}
              <span className="font-mono text-foreground/80">{shortAddr(LITVM_FACTORY_ADDRESS)}</span>.
            </p>
          </div>
        </Card>
      )}

      <Card className="border-border/60 bg-card/60 p-5 backdrop-blur-xl md:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <h3 className="font-display text-base font-semibold">My deployed contracts</h3>
          </div>
          <Button variant="outline" size="sm" onClick={loadMine} disabled={!address}>
            Refresh
          </Button>
        </div>
        {!address && (
          <p className="font-mono text-xs text-muted-foreground">// Connect a wallet to see your deployments.</p>
        )}
        {address && myContracts.length === 0 && (
          <p className="font-mono text-xs text-muted-foreground">// No contracts deployed yet from this address.</p>
        )}
        {myContracts.length > 0 && (
          <div className="space-y-2">
            {myContracts.map((c) => (
              <div
                key={c.address}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                      {FACTORY_TYPE_LABEL[c.type] ?? "?"}
                    </span>
                    <span className="truncate text-sm font-medium">{c.label || "—"}</span>
                  </div>
                  <a
                    href={`${EXPLORER_URL}/address/${c.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[11px] text-muted-foreground hover:text-primary"
                  >
                    {c.address}
                  </a>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 px-2 text-[10px]"
                    onClick={() => navigator.clipboard.writeText(c.address)}
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </Button>
                  <Button asChild size="sm" variant="outline" className="h-7 gap-1 px-2 text-[10px]">
                    <a href={`${EXPLORER_URL}/address/${c.address}`} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3 w-3" /> Explorer
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <DeployModal
        open={showDeploy}
        status={deploy}
        contractName={contractName}
        onClose={() => setShowDeploy(false)}
      />
    </div>
  );
}

function DeployModal({
  open,
  status,
  contractName,
  onClose,
}: {
  open: boolean;
  status: DeployStatus;
  contractName: string;
  onClose: () => void;
}) {
  if (!open) return null;
  const busy = status.kind === "deploying";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md border-primary/30 bg-card/95 p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-2.5">
              {status.kind === "ok" ? (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              ) : status.kind === "error" ? (
                <AlertCircle className="h-5 w-5 text-destructive" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
            </div>
            <div>
              <h3 className="font-display text-base font-semibold">
                {status.kind === "deploying" && "Deploying to LitVM…"}
                {status.kind === "ok" && "Contract deployed 🚀"}
                {status.kind === "error" && "Deployment failed"}
                {status.kind === "idle" && "Deploy contract"}
              </h3>
              <p className="font-mono text-[11px] text-muted-foreground">// {contractName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-1 text-muted-foreground transition hover:bg-card hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status.kind === "deploying" && (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Confirm the transaction in your wallet, then waiting for block confirmation…</p>
            {status.tx && (
              <a
                href={`${EXPLORER_URL}/tx/${status.tx}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-mono text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {status.tx.slice(0, 10)}…{status.tx.slice(-8)}
              </a>
            )}
          </div>
        )}

        {status.kind === "ok" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <Label className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Contract address
              </Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 break-all font-mono text-xs text-primary">{status.address}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(status.address)}
                  className="h-7 gap-1 px-2 text-[10px]"
                >
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={`${EXPLORER_URL}/address/${status.address}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3" /> Contract
                </a>
              </Button>
              <Button asChild size="sm" className="gap-1.5 bg-gradient-violet shadow-glow-violet hover:opacity-90">
                <a href={`${EXPLORER_URL}/tx/${status.tx}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3" /> Transaction
                </a>
              </Button>
            </div>
          </div>
        )}

        {status.kind === "error" && (
          <div className="space-y-3">
            <pre className="max-h-60 overflow-auto rounded-xl border border-destructive/30 bg-destructive/5 p-3 font-mono text-[11px] text-destructive">
              {status.msg}
            </pre>
            <Button onClick={onClose} variant="outline" size="sm" className="w-full">
              Close
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function Erc20Panel({ form, setForm }: { form: Erc20Form; setForm: (f: Erc20Form) => void }) {
  const set = <K extends keyof Erc20Form>(k: K, v: Erc20Form[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-4">
      <FieldRow>
        <Field label="Token Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. PepeCoin" />
        </Field>
        <Field label="Token Symbol">
          <Input value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="e.g. PEPE" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Total Supply" hint="Whole tokens — decimals applied automatically by the contract">
          <Input type="number" value={form.supply} onChange={(e) => set("supply", e.target.value)} />
        </Field>
        <Field label="Decimals">
          <Input type="number" value={form.decimals} onChange={(e) => set("decimals", e.target.value)} min={0} max={18} />
        </Field>
      </FieldRow>
      <Divider>features</Divider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Toggle label="Mintable" checked={form.mintable} onCheckedChange={(v) => set("mintable", v)} />
        <Toggle label="Burnable" checked={form.burnable} onCheckedChange={(v) => set("burnable", v)} />
        <Toggle label="Pausable" checked={form.pausable} onCheckedChange={(v) => set("pausable", v)} />
      </div>
    </div>
  );
}

function NftPanel({ form, setForm }: { form: NftForm; setForm: (f: NftForm) => void }) {
  const set = <K extends keyof NftForm>(k: K, v: NftForm[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-4">
      <FieldRow>
        <Field label="Collection Name">
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. LitVM Punks" />
        </Field>
        <Field label="Symbol">
          <Input value={form.symbol} onChange={(e) => set("symbol", e.target.value)} placeholder="e.g. LVMP" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Max Supply">
          <Input type="number" value={form.maxSupply} onChange={(e) => set("maxSupply", e.target.value)} />
        </Field>
        <Field label="Mint Price (zkLTC)">
          <Input type="number" step="0.001" value={form.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
      </FieldRow>
      <Field label="Base URI" hint="Metadata folder — token URIs become {baseURI}{tokenId}.json">
        <Input value={form.baseUri} onChange={(e) => set("baseUri", e.target.value)} placeholder="https://api.yourproject.xyz/meta/" />
      </Field>
    </div>
  );
}

function StakingPanel({ form, setForm }: { form: StakingForm; setForm: (f: StakingForm) => void }) {
  const set = <K extends keyof StakingForm>(k: K, v: StakingForm[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-4">
      <FieldRow>
        <Field label="Staking Token Address">
          <Input value={form.stakeToken} onChange={(e) => set("stakeToken", e.target.value)} placeholder="0x... ERC20 to stake" />
        </Field>
        <Field label="Reward Token Address" hint="Blank = same as stake token">
          <Input value={form.rewardToken} onChange={(e) => set("rewardToken", e.target.value)} placeholder="0x..." />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Annual Reward Rate (%)" hint="Converted to per-day rate × 1e18 on-chain">
          <Input type="number" value={form.apr} onChange={(e) => set("apr", e.target.value)} />
        </Field>
        <Field label="Lock Period (days)">
          <Input type="number" value={form.lockDays} onChange={(e) => set("lockDays", e.target.value)} />
        </Field>
      </FieldRow>
      <Field label="Pool Label" hint="Stored on-chain as the contract's display name">
        <Input value={form.contractName} onChange={(e) => set("contractName", e.target.value)} placeholder="e.g. PEPE Staking Pool" />
      </Field>
    </div>
  );
}

function VestingPanel({ form, setForm }: { form: VestingForm; setForm: (f: VestingForm) => void }) {
  const set = <K extends keyof VestingForm>(k: K, v: VestingForm[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-4">
      <FieldRow>
        <Field label="Token Address">
          <Input value={form.token} onChange={(e) => set("token", e.target.value)} placeholder="0x... token to vest" />
        </Field>
        <Field label="Vesting Label">
          <Input value={form.contractName} onChange={(e) => set("contractName", e.target.value)} placeholder="e.g. Team Vesting" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Beneficiary Address">
          <Input value={form.beneficiary} onChange={(e) => set("beneficiary", e.target.value)} placeholder="0x..." />
        </Field>
        <Field label="Total Amount (wei)" hint="Raw amount including decimals — e.g. 10000 * 10^18">
          <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="e.g. 10000000000000000000000" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Cliff Period (days)" hint="No tokens released before cliff ends">
          <Input type="number" value={form.cliffDays} onChange={(e) => set("cliffDays", e.target.value)} />
        </Field>
        <Field label="Vesting Duration (days after cliff)">
          <Input type="number" value={form.durationDays} onChange={(e) => set("durationDays", e.target.value)} />
        </Field>
      </FieldRow>
      <Divider>features</Divider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Toggle label="Revocable by owner" checked={form.revocable} onCheckedChange={(v) => set("revocable", v)} />
      </div>
    </div>
  );
}
