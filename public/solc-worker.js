/* eslint-disable no-restricted-globals */
// Web Worker: loads soljson from the official Solidity CDN, compiles via the
// low-level `solidity_compile` C export, and resolves OpenZeppelin imports
// from a CDN cache. No npm dependency — pure browser.

const SOLC_VERSION = "v0.8.26+commit.8a97fa7a";
const SOLC_URL = `https://binaries.soliditylang.org/bin/soljson-${SOLC_VERSION}.js`;
const OZ_VERSION = "5.0.2";
const OZ_BASE = `https://cdn.jsdelivr.net/npm/@openzeppelin/contracts@${OZ_VERSION}/`;

let solcReady = null;
let solidity_compile = null;
let allocString = null;

function loadSolc() {
  if (solcReady) return solcReady;
  solcReady = new Promise((resolve, reject) => {
    try {
      // soljson.js sets globalThis.Module and runs an Emscripten init.
      // We hook onRuntimeInitialized BEFORE importing the script.
      self.Module = {
        onRuntimeInitialized: () => {
          try {
            const M = self.Module;
            // Available export name varies by Solidity version. 0.6.0+ exposes
            // `solidity_compile`. Older builds used `compileStandard` /
            // `compileJSONCallback`. We only need 0.8.x so this is safe.
            solidity_compile = M.cwrap("solidity_compile", "string", ["string", "number", "number"]);

            // Helper to copy a JS string into the Emscripten heap and get a
            // pointer (used for the import callback bridge).
            allocString = (str) => {
              const bytes = M.lengthBytesUTF8(str) + 1;
              const ptr = M._malloc(bytes);
              M.stringToUTF8(str, ptr, bytes);
              return ptr;
            };

            resolve();
          } catch (err) {
            reject(err);
          }
        },
      };
      self.importScripts(SOLC_URL);
    } catch (err) {
      reject(err);
    }
  });
  return solcReady;
}

const ozCache = new Map();
async function fetchOzSource(path) {
  if (ozCache.has(path)) return ozCache.get(path);
  const sub = path.replace(/^@openzeppelin\/contracts\//, "");
  const url = OZ_BASE + sub;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${path} (${res.status})`);
  const txt = await res.text();
  ozCache.set(path, txt);
  return txt;
}

const importRegex = /import\s+(?:\{[^}]*\}\s+from\s+)?["']([^"']+)["']/g;

async function preFetchImports(rootSources) {
  const queue = [];
  for (const src of Object.values(rootSources)) {
    let m;
    importRegex.lastIndex = 0;
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
    importRegex.lastIndex = 0;
    while ((m = importRegex.exec(txt)) !== null) {
      let next = m[1];
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

// The solidity_compile C function takes a callback pointer that is invoked
// for each unresolved import. We register a JS function with addFunction.
function makeReadCallback() {
  const M = self.Module;
  // Signature: void (*)(const char* context, const char* kind, const char* data, char** o_contents, char** o_error)
  // i.e. signature 'viiiii' in Emscripten ABI.
  const fn = (_ctx, _kind, dataPtr, oContents, oError) => {
    try {
      const path = M.UTF8ToString(dataPtr);
      // Only support OpenZeppelin paths from cache
      const src = ozCache.get(path);
      if (src) {
        const ptr = allocString(src);
        // Write `ptr` into *oContents (oContents is char**, 4-byte pointer in wasm32)
        M.setValue(oContents, ptr, "i32");
      } else {
        const err = `File not found: ${path}`;
        const ptr = allocString(err);
        M.setValue(oError, ptr, "i32");
      }
    } catch (e) {
      const ptr = allocString("Read callback error: " + (e?.message || String(e)));
      M.setValue(oError, ptr, "i32");
    }
  };
  return M.addFunction(fn, "viiiii");
}

self.onmessage = async (e) => {
  const { id, type, payload } = e.data || {};
  try {
    if (type === "compile") {
      await loadSolc();
      const { source, fileName, contractName } = payload;
      const sources = { [fileName]: { content: source } };
      await preFetchImports(sources);

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

      const cbPtr = makeReadCallback();
      let outStr;
      try {
        // Reset any prior compiler state inside the wasm module (defensive —
        // prevents "another CompilerStack aside me" if solc was ever invoked
        // before in this worker).
        try {
          const reset = self.Module.cwrap("solidity_reset", null, []);
          reset();
        } catch { /* not all builds export it */ }
        outStr = solidity_compile(JSON.stringify(input), cbPtr, 0);
      } finally {
        try { self.Module.removeFunction(cbPtr); } catch { /* ignore */ }
      }

      const out = JSON.parse(outStr);
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
