import { useEffect, useRef, useState } from "react";
import { Zap, Send } from "lucide-react";
import { useAccount, useBalance } from "wagmi";
import { Contract, JsonRpcProvider, formatEther, parseEther, BrowserProvider } from "ethers";
import { DAPPS, EXPLORER_URL, LITVM_CHAIN_ID, RPC_URL, WZKLTC_ABI, WZKLTC_ADDR, errMsg, shortAddr } from "@/lib/litvm";

type Msg =
  | { who: "bot"; html: string; ts: string }
  | { who: "you"; text: string; ts: string };

const time = () => new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });

const HELP_HTML = `
<div class="text-primary text-sm uppercase tracking-[0.2em] mb-2">Available commands</div>
<table class="text-xs w-full">
  <tbody>
    <tr><td class="text-primary py-0.5 pr-4">/help</td><td>Show all available commands</td></tr>
    <tr><td class="text-primary py-0.5 pr-4">/balance</td><td>Check zkLTC + WZKLTC balance</td></tr>
    <tr><td class="text-primary py-0.5 pr-4">/wrap [amt]</td><td>Wrap zkLTC → WZKLTC</td></tr>
    <tr><td class="text-primary py-0.5 pr-4">/unwrap [amt]</td><td>Unwrap WZKLTC → zkLTC</td></tr>
    <tr><td class="text-primary py-0.5 pr-4">/dapps</td><td>List ecosystem dapps</td></tr>
    <tr><td class="text-primary py-0.5 pr-4">/network</td><td>Show LitVM network stats</td></tr>
    <tr><td class="text-primary py-0.5 pr-4">/clear</td><td>Clear terminal output</td></tr>
  </tbody>
</table>`;

const readProvider = new JsonRpcProvider(RPC_URL);

export default function Terminal() {
  const { address, chainId } = useAccount();
  const { data: nativeBal } = useBalance({ address, chainId: LITVM_CHAIN_ID });
  const [messages, setMessages] = useState<Msg[]>([
    {
      who: "bot",
      ts: "—:—",
      html: `
        <div class="text-primary font-display text-xl tracking-[0.1em]">LITVM TERMINAL v1.0</div>
        <div class="mt-2 text-sm">Welcome to the unified LitVM DeFi terminal.<br/>Connect your wallet and start exploring.</div>
        <div class="mt-2 text-sm">Type <span class="text-primary">/help</span> to see all commands.</div>`,
    },
  ]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const bot = (html: string) => setMessages((m) => [...m, { who: "bot", html, ts: time() }]);
  const you = (text: string) => setMessages((m) => [...m, { who: "you", text, ts: time() }]);

  async function runCommand(raw: string) {
    const cmd = raw.trim();
    if (!cmd) return;
    you(cmd);
    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(" ");

    switch (head.toLowerCase()) {
      case "/help":
        bot(HELP_HTML);
        return;
      case "/clear":
        setMessages([]);
        return;
      case "/network": {
        try {
          const [bn, fee] = await Promise.all([readProvider.getBlockNumber(), readProvider.getFeeData()]);
          bot(`<div class="text-primary text-xs uppercase tracking-[0.2em] mb-2">Network</div>
            <div class="text-xs grid grid-cols-2 gap-y-1">
              <span class="text-muted-foreground">Chain ID</span><span class="font-mono">4441</span>
              <span class="text-muted-foreground">Latest block</span><span class="font-mono">#${bn.toLocaleString()}</span>
              <span class="text-muted-foreground">Gas price</span><span class="font-mono">${fee.gasPrice ? (Number(fee.gasPrice) / 1e9).toFixed(3) : "—"} Gwei</span>
              <span class="text-muted-foreground">RPC</span><span class="font-mono break-all">${RPC_URL}</span>
            </div>`);
        } catch (e) { bot(`<span class="text-destructive">RPC error: ${errMsg(e)}</span>`); }
        return;
      }
      case "/dapps":
        bot(`<div class="text-primary text-xs uppercase tracking-[0.2em] mb-2">Ecosystem</div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            ${DAPPS.map(d => `<a href="${d.url}" target="_blank" class="border border-border rounded-sm p-2 hover:border-primary"><span class="mr-1">${d.icon}</span><span class="text-foreground">${d.name}</span><div class="text-muted-foreground text-[10px] mt-1">${d.desc}</div></a>`).join("")}
          </div>`);
        return;
      case "/balance": {
        if (!address) { bot('<span class="text-destructive">Connect your wallet first.</span>'); return; }
        try {
          const c = new Contract(WZKLTC_ADDR, WZKLTC_ABI, readProvider);
          const wbal = (await c.balanceOf(address)) as bigint;
          bot(`<div class="text-primary text-xs uppercase tracking-[0.2em] mb-2">Balances · ${shortAddr(address)}</div>
            <div class="text-xs grid grid-cols-2 gap-y-1">
              <span class="text-muted-foreground">zkLTC</span><span class="font-mono">${nativeBal ? (+formatEther(nativeBal.value)).toFixed(6) : "—"}</span>
              <span class="text-muted-foreground">WZKLTC</span><span class="font-mono">${(+formatEther(wbal)).toFixed(6)}</span>
            </div>`);
        } catch (e) { bot(`<span class="text-destructive">Error: ${errMsg(e)}</span>`); }
        return;
      }
      case "/wrap":
      case "/unwrap": {
        if (!arg || +arg <= 0) { bot('<span class="text-destructive">Usage: /wrap 0.5</span>'); return; }
        if (!window.ethereum) { bot('<span class="text-destructive">No wallet found.</span>'); return; }
        if (chainId !== LITVM_CHAIN_ID) { bot('<span class="text-destructive">Switch to LitVM LiteForge (chain 4441) first.</span>'); return; }
        try {
          const provider = new BrowserProvider(window.ethereum as never);
          const signer = await provider.getSigner();
          const c = new Contract(WZKLTC_ADDR, WZKLTC_ABI, signer);
          const isWrap = head.toLowerCase() === "/wrap";
          bot("⏳ Confirm in wallet…");
          const tx = isWrap
            ? await c.deposit({ value: parseEther(arg) })
            : await c.withdraw(parseEther(arg));
          bot(`⏳ ${isWrap ? "Wrapping" : "Unwrapping"}… <a class="text-primary underline" href="${EXPLORER_URL}/tx/${tx.hash}" target="_blank">View TX</a>`);
          await tx.wait();
          bot(`✅ ${isWrap ? "Wrapped" : "Unwrapped"} ${arg} ${isWrap ? "zkLTC → WZKLTC" : "WZKLTC → zkLTC"} 🔥`);
        } catch (e) { bot(`<span class="text-destructive">${errMsg(e)}</span>`); }
        return;
      }
      default:
        bot(`<span class="text-destructive">Unknown command: ${head}</span> · type <span class="text-primary">/help</span>`);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-3 font-display text-4xl">
        <Zap className="h-7 w-7 text-fire" /> LitVM Terminal
      </h1>

      <div className="panel flex h-[70vh] flex-col">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m, i) => m.who === "bot" ? (
            <div key={i}>
              <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">LitVM · {m.ts}</div>
              <div
                className="rounded-sm border border-primary/30 bg-primary/5 p-3 text-foreground"
                dangerouslySetInnerHTML={{ __html: m.html }}
              />
            </div>
          ) : (
            <div key={i} className="text-right">
              <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">You · {m.ts}</div>
              <div className="inline-block rounded-sm border border-border bg-surface px-3 py-2 font-mono text-sm">{m.text}</div>
            </div>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); const v = input; setInput(""); runCommand(v); }}
          className="flex items-center gap-2 border-t border-border bg-surface p-3"
        >
          <span className="text-primary">❯</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type /help to get started…"
            className="flex-1 bg-transparent font-mono text-sm placeholder:text-muted-foreground focus:outline-none"
          />
          <button type="submit" className="inline-flex items-center gap-1 rounded-sm bg-gradient-cyan px-3 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
            <Send className="h-3 w-3" /> Send
          </button>
        </form>
      </div>
    </div>
  );
}
