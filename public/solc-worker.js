/* eslint-disable no-restricted-globals */
// Web Worker: loads solc-js from CDN, compiles Solidity, resolves OpenZeppelin
// imports from CDN on demand. Runs off the main thread.

let compilerReady = null;
let solc = null;

const SOLC_VERSION = "v0.8.26+commit.8a97fa7a";
const SOLC_URL = `https://binaries.soliditylang.org/bin/soljson-${SOLC_VERSION}.js`;
const OZ_VERSION = "5.0.2";
const OZ_BASE = `https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@${OZ_VERSION}/`;

function loadSolc() {
  if (compilerReady) return compilerReady;
  compilerReady = (async () => {
    // Load the wrapper from a UMD-friendly CDN build
    self.importScripts("https://cdn.jsdelivr.net/npm/solc@0.8.26/wrapper.js");
    // Load soljson (the real compiler core)
    self.importScripts(SOLC_URL);
    // self.Module is set by soljson; wrapper exposes a function to wrap it
    const wrapper = self.solcWrapper || self.wrapper || self["solc-wrapper"];
    if (typeof wrapper === "function") {
      solc = wrapper(self.Module);
    } else if (typeof self.Module === "object" && self.Module.cwrap) {
      // Fallback: use bare Module via _compileJSON style — unlikely but safe
      throw new Error("solc wrapper not available");
    }
    if (!solc) throw new Error("Failed to initialise solc compiler");
    return solc;
  })();
  return compilerReady;
}

// Cache fetched OpenZeppelin sources to avoid re-downloading
const ozCache = new Map();

async function fetchOzSource(path) {
  // path looks like "@openzeppelin/contracts/token/ERC20/ERC20.sol"
  if (ozCache.has(path)) return ozCache.get(path);
  const sub = path.replace(/^@openzeppelin\/contracts\//, "");
  const url = OZ_BASE + sub;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${path} (${res.status})`);
  const txt = await res.text();
  ozCache.set(path, txt);
  return txt;
}

// Recursively pre-fetch every OpenZeppelin import the source tree references.
// We do this once before calling solc.compile so the import callback (sync) has
// everything in cache.
const importRegex = /import\s+(?:\{[^}]*\}\s+from\s+)?["']([^"']+)["']/g;

async function resolveAllImports(rootSources) {
  const queue = [];
  for (const src of Object.values(rootSources)) {
    let m;
    while ((m = importRegex.exec(src.content)) !== null) queue.push(m[1]);
  }
  const seen = new Set();
  while (queue.length) {
    const imp = queue.shift();
    if (seen.has(imp)) continue;
    seen.add(imp);
    if (!imp.startsWith("@openzeppelin/")) continue;
    const txt = await fetchOzSource(imp);
    let m;
    while ((m = importRegex.exec(txt)) !== null) {
      let next = m[1];
      // Resolve relative imports inside OZ tree
      if (next.startsWith(".")) {
        const baseParts = imp.split("/");
        baseParts.pop();
        const parts = next.split("/");
        for (const p of parts) {
          if (p === ".") continue;
          if (p === "..") baseParts.pop();
          else baseParts.push(p);
        }
        next = baseParts.join("/");
      }
      if (!seen.has(next)) queue.push(next);
    }
  }
}

function importCallback(path) {
  // Sync callback — must read from cache
  if (path.startsWith("@openzeppelin/")) {
    const cached = ozCache.get(path);
    if (cached) return { contents: cached };
    return { error: `Source not pre-fetched: ${path}` };
  }
  return { error: `Unknown import: ${path}` };
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  try {
    if (type === "compile") {
      await loadSolc();
      const { source, fileName, contractName } = payload;
      const sources = { [fileName]: { content: source } };
      await resolveAllImports(sources);

      const input = {
        language: "Solidity",
        sources,
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "paris",
          outputSelection: {
            "*": { "*": ["abi", "evm.bytecode.object"] },
          },
        },
      };

      const out = JSON.parse(
        solc.compile(JSON.stringify(input), { import: importCallback })
      );
      const errors = (out.errors || []).filter((er) => er.severity === "error");
      if (errors.length) {
        self.postMessage({ id, ok: false, error: errors.map((e) => e.formattedMessage || e.message).join("\n\n") });
        return;
      }
      const contract = out.contracts?.[fileName]?.[contractName];
      if (!contract) {
        const found = Object.keys(out.contracts?.[fileName] || {}).join(", ");
        self.postMessage({ id, ok: false, error: `Contract "${contractName}" not found. Found: ${found || "none"}` });
        return;
      }
      self.postMessage({
        id,
        ok: true,
        result: {
          abi: contract.abi,
          bytecode: "0x" + contract.evm.bytecode.object,
          warnings: (out.errors || []).filter((er) => er.severity !== "error").map((e) => e.formattedMessage || e.message),
        },
      });
      return;
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
};
