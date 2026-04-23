import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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
  Factory,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { EXPLORER_URL, LITVM_CHAIN_ID } from "@/lib/litvm";
import { compileSolidity } from "@/lib/solcCompile";
import {
  Erc20Form,
  FactoryForm,
  ForgeKind,
  NftForm,
  StakingForm,
  VestingForm,
  genErc20,
  genFactory,
  genNft,
  genStaking,
  genVesting,
  getContractName,
} from "@/lib/forgeTemplates";

type DeployStatus =
  | { kind: "idle" }
  | { kind: "compiling" }
  | { kind: "deploying"; tx?: `0x${string}` }
  | { kind: "ok"; tx: `0x${string}`; address: `0x${string}` }
  | { kind: "error"; msg: string };


const TABS: { value: ForgeKind; label: string; icon: typeof Coins; desc: string }[] = [
  { value: "erc20", label: "ERC20 Token", icon: Coins, desc: "Standard fungible token with optional mint, burn, pause, and transfer tax." },
  { value: "nft", label: "NFT (ERC721)", icon: ImageIcon, desc: "ERC721 collection with mint price, max supply, whitelist, and royalties." },
  { value: "staking", label: "Staking", icon: Lock, desc: "Single-asset staking with APR, lock period, and emergency withdraw." },
  { value: "vesting", label: "Vesting", icon: Hourglass, desc: "Cliff + linear vesting for team / investor / advisor allocations." },
  { value: "factory", label: "Token Factory", icon: Factory, desc: "Pay-to-deploy ERC20 factory — collect fees on every token launch." },
];

const initErc20: Erc20Form = {
  name: "",
  symbol: "",
  supply: "1000000000",
  decimals: "18",
  owner: "",
  mintable: false,
  burnable: false,
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
  whitelist: true,
  reveal: false,
  royalty: true,
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

const initFactory: FactoryForm = {
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
  const [tab, setTab] = useState<ForgeKind>("erc20");
  const [erc20, setErc20] = useState<Erc20Form>(initErc20);
  const [nft, setNft] = useState<NftForm>(initNft);
  const [staking, setStaking] = useState<StakingForm>(initStaking);
  const [vesting, setVesting] = useState<VestingForm>(initVesting);
  const [factory, setFactory] = useState<FactoryForm>(initFactory);
  const [generated, setGenerated] = useState<Record<ForgeKind, string>>({
    erc20: "",
    nft: "",
    staking: "",
    vesting: "",
    factory: "",
  });
  const [copied, setCopied] = useState(false);
  const [deploy, setDeploy] = useState<DeployStatus>({ kind: "idle" });
  const [showDeploy, setShowDeploy] = useState(false);

  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: LITVM_CHAIN_ID });

  const code = generated[tab];
  const forms = { erc20, nft, staking, vesting, factory };
  const contractName = getContractName(tab, forms);
  const fileName = useMemo(() => contractName + ".sol", [contractName]);

  const onGenerate = () => {
    let out = "";
    if (tab === "erc20") out = genErc20(erc20);
    else if (tab === "nft") out = genNft(nft);
    else if (tab === "staking") out = genStaking(staking);
    else if (tab === "vesting") out = genVesting(vesting);
    else out = genFactory(factory);
    setGenerated((p) => ({ ...p, [tab]: out }));
    toast({ title: "Contract generated", description: `${fileName} ready to copy, download, or deploy.` });
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

  const onDeploy = async () => {
    if (!code) {
      toast({ title: "Generate first", description: "Click Generate to build the contract before deploying." });
      return;
    }
    if (!isConnected || !walletClient) {
      toast({ title: "Connect wallet", description: "Connect your wallet to deploy on LitVM.", variant: "destructive" });
      return;
    }
    setShowDeploy(true);
    setDeploy({ kind: "compiling" });
    try {
      if (chainId !== LITVM_CHAIN_ID) {
        try {
          await switchChainAsync({ chainId: LITVM_CHAIN_ID });
        } catch {
          throw new Error("Please switch your wallet to LitVM (Chain 4441) and try again.");
        }
      }
      const { abi, bytecode } = await compileSolidity({
        source: code,
        fileName,
        contractName,
      });
      setDeploy({ kind: "deploying" });
      const hash = await walletClient.deployContract({
        abi: abi as never,
        bytecode: bytecode as `0x${string}`,
        args: [],
        account: walletClient.account,
        chain: walletClient.chain,
      });
      setDeploy({ kind: "deploying", tx: hash });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      const addr = receipt.contractAddress as `0x${string}` | undefined;
      if (!addr) throw new Error("Deployment succeeded but no contract address returned.");
      setDeploy({ kind: "ok", tx: hash, address: addr });
      toast({ title: "Contract deployed 🚀", description: `Live at ${addr.slice(0, 10)}…${addr.slice(-6)}` });
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setDeploy({ kind: "error", msg: err?.shortMessage || err?.message || String(e) });
    }
  };

  return (
    <div className="space-y-8 pb-12">
      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/60 to-card/20 p-6 backdrop-blur-xl md:p-10">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-primary">
              <Hammer className="h-3 w-3" /> Contract Forge
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Now you can <span className="text-gradient-aurora">create &amp; deploy</span> on LitVM
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Fill the form → get production-ready Solidity. No Remix, no VPS, no API. Five battle-tested templates,
              auto-generated and ready to ship on LitVM LiteForge (Chain 4441).
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="gap-2 bg-gradient-violet shadow-glow-violet hover:opacity-90"
          >
            <Link to="/deploy">
              <Rocket className="h-4 w-4" /> Deploy ERC20 (1-click)
            </Link>
          </Button>
        </div>
      </div>

      {/* TABS */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as ForgeKind)}>
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

              {t.value === "erc20" && (
                <Erc20Panel form={erc20} setForm={setErc20} />
              )}
              {t.value === "nft" && <NftPanel form={nft} setForm={setNft} />}
              {t.value === "staking" && <StakingPanel form={staking} setForm={setStaking} />}
              {t.value === "vesting" && <VestingPanel form={vesting} setForm={setVesting} />}
              {t.value === "factory" && <FactoryPanel form={factory} setForm={setFactory} />}

              <Button
                onClick={onGenerate}
                size="lg"
                className="mt-6 w-full gap-2 bg-gradient-violet text-base font-semibold shadow-glow-violet hover:opacity-90"
              >
                <Zap className="h-4 w-4" /> Generate {t.label} Contract →
              </Button>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* OUTPUT */}
      {code && (
        <Card id="forge-output" className="overflow-hidden border-primary/20 bg-card/70 backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="font-mono text-sm text-primary">{fileName}</div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary">
                <span className="status-dot" /> LitVM 4441
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
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href="https://remix.ethereum.org" target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Remix
                </a>
              </Button>
              <Button
                size="sm"
                onClick={onDeploy}
                disabled={deploy.kind === "compiling" || deploy.kind === "deploying"}
                className="gap-1.5 bg-gradient-violet shadow-glow-violet hover:opacity-90"
              >
                {deploy.kind === "compiling" || deploy.kind === "deploying" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Rocket className="h-3.5 w-3.5" />
                )}
                Deploy on LitVM
              </Button>
            </div>
          </div>
          <pre className="max-h-[600px] overflow-auto bg-background/40 p-5 font-mono text-xs leading-relaxed text-foreground/90">
            <code>{code}</code>
          </pre>
          <div className="flex items-start gap-2 border-t border-border/60 bg-card/60 px-5 py-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-primary" />
            <p>
              Always audit before mainnet deployment. Templates use OpenZeppelin v5 patterns — install via{" "}
              <span className="font-mono text-foreground/80">npm i @openzeppelin/contracts</span> or use Remix's
              auto-resolver.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ───────────────────────── PANELS ───────────────────────── */

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
        <Field label="Total Supply" hint="Human-readable (decimals auto-applied)">
          <Input type="number" value={form.supply} onChange={(e) => set("supply", e.target.value)} />
        </Field>
        <Field label="Decimals">
          <Input type="number" value={form.decimals} onChange={(e) => set("decimals", e.target.value)} min={0} max={18} />
        </Field>
      </FieldRow>
      <Field label="Owner / Recipient Address">
        <Input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="0x... (blank = deployer)" />
      </Field>
      <Divider>features</Divider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Toggle label="Mintable" checked={form.mintable} onCheckedChange={(v) => set("mintable", v)} />
        <Toggle label="Burnable" checked={form.burnable} onCheckedChange={(v) => set("burnable", v)} />
        <Toggle label="Pausable" checked={form.pausable} onCheckedChange={(v) => set("pausable", v)} />
        <Toggle label="Ownable" checked={form.ownable} onCheckedChange={(v) => set("ownable", v)} />
        <Toggle label="Transfer Tax" checked={form.tax} onCheckedChange={(v) => set("tax", v)} />
        <Toggle label="ReentrancyGuard" checked={form.reentrancyGuard} onCheckedChange={(v) => set("reentrancyGuard", v)} />
      </div>
      {form.tax && (
        <FieldRow>
          <Field label="Tax % (basis points — 100 = 1%)">
            <Input type="number" value={form.taxBps} onChange={(e) => set("taxBps", e.target.value)} />
          </Field>
          <Field label="Tax Receiver Address">
            <Input value={form.taxAddr} onChange={(e) => set("taxAddr", e.target.value)} placeholder="0x..." />
          </Field>
        </FieldRow>
      )}
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
      <FieldRow>
        <Field label="Max Mint Per Wallet">
          <Input type="number" value={form.perWallet} onChange={(e) => set("perWallet", e.target.value)} />
        </Field>
        <Field label="Base URI">
          <Input value={form.baseUri} onChange={(e) => set("baseUri", e.target.value)} placeholder="https://api.yourproject.xyz/meta/" />
        </Field>
      </FieldRow>
      <Divider>features</Divider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Toggle label="Whitelist phase" checked={form.whitelist} onCheckedChange={(v) => set("whitelist", v)} />
        <Toggle label="Reveal mechanic" checked={form.reveal} onCheckedChange={(v) => set("reveal", v)} />
        <Toggle label="Royalties (ERC2981)" checked={form.royalty} onCheckedChange={(v) => set("royalty", v)} />
      </div>
      {form.royalty && (
        <FieldRow>
          <Field label="Royalty % (bps — 500 = 5%)">
            <Input type="number" value={form.royaltyBps} onChange={(e) => set("royaltyBps", e.target.value)} />
          </Field>
          <Field label="Royalty Receiver">
            <Input value={form.royaltyAddr} onChange={(e) => set("royaltyAddr", e.target.value)} placeholder="0x... (blank = owner)" />
          </Field>
        </FieldRow>
      )}
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
        <Field label="Annual Reward Rate (%)">
          <Input type="number" value={form.apr} onChange={(e) => set("apr", e.target.value)} />
        </Field>
        <Field label="Lock Period (days)">
          <Input type="number" value={form.lockDays} onChange={(e) => set("lockDays", e.target.value)} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Min Stake Amount">
          <Input type="number" value={form.minStake} onChange={(e) => set("minStake", e.target.value)} />
        </Field>
        <Field label="Contract Name">
          <Input value={form.contractName} onChange={(e) => set("contractName", e.target.value)} placeholder="e.g. PEPEStaking" />
        </Field>
      </FieldRow>
      <Divider>features</Divider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Toggle label="Emergency withdraw" checked={form.emergency} onCheckedChange={(v) => set("emergency", v)} />
        <Toggle label="Pausable" checked={form.pausable} onCheckedChange={(v) => set("pausable", v)} />
        <Toggle label="Auto-compound" checked={form.autoCompound} onCheckedChange={(v) => set("autoCompound", v)} />
      </div>
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
        <Field label="Contract Name">
          <Input value={form.contractName} onChange={(e) => set("contractName", e.target.value)} placeholder="e.g. TeamVesting" />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Cliff Period (days)" hint="Zero tokens released before cliff">
          <Input type="number" value={form.cliffDays} onChange={(e) => set("cliffDays", e.target.value)} />
        </Field>
        <Field label="Vesting Duration (days after cliff)">
          <Input type="number" value={form.durationDays} onChange={(e) => set("durationDays", e.target.value)} />
        </Field>
      </FieldRow>
      {!form.multiBeneficiary && (
        <FieldRow>
          <Field label="Beneficiary Address" hint="Settable later if blank">
            <Input value={form.beneficiary} onChange={(e) => set("beneficiary", e.target.value)} placeholder="0x..." />
          </Field>
          <Field label="Total Vest Amount (tokens)">
            <Input type="number" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="e.g. 10000000" />
          </Field>
        </FieldRow>
      )}
      <Divider>features</Divider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Toggle label="Revocable by owner" checked={form.revocable} onCheckedChange={(v) => set("revocable", v)} />
        <Toggle label="Multi-beneficiary" checked={form.multiBeneficiary} onCheckedChange={(v) => set("multiBeneficiary", v)} />
        <Toggle label="Emit release events" checked={form.emitEvents} onCheckedChange={(v) => set("emitEvents", v)} />
      </div>
    </div>
  );
}

function FactoryPanel({ form, setForm }: { form: FactoryForm; setForm: (f: FactoryForm) => void }) {
  const set = <K extends keyof FactoryForm>(k: K, v: FactoryForm[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-4">
      <FieldRow>
        <Field label="Factory Contract Name">
          <Input value={form.contractName} onChange={(e) => set("contractName", e.target.value)} />
        </Field>
        <Field label="Deploy Fee (zkLTC)">
          <Input type="number" step="0.001" value={form.fee} onChange={(e) => set("fee", e.target.value)} />
        </Field>
      </FieldRow>
      <Field label="Owner Address (receives fees)">
        <Input value={form.owner} onChange={(e) => set("owner", e.target.value)} placeholder="0x... (blank = deployer)" />
      </Field>
      <Divider>child token features</Divider>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Toggle label="Mintable" checked={form.mintable} onCheckedChange={(v) => set("mintable", v)} />
        <Toggle label="Burnable" checked={form.burnable} onCheckedChange={(v) => set("burnable", v)} />
        <Toggle label="Pausable" checked={form.pausable} onCheckedChange={(v) => set("pausable", v)} />
        <Toggle label="Custom decimals" checked={form.customDecimals} onCheckedChange={(v) => set("customDecimals", v)} />
        <Toggle label="Track all tokens" checked={form.trackTokens} onCheckedChange={(v) => set("trackTokens", v)} />
        <Toggle label="Creator whitelist" checked={form.whitelist} onCheckedChange={(v) => set("whitelist", v)} />
      </div>
    </div>
  );
}
