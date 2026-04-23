// Thin client for the Solidity compiler web worker.
// Loads /solc-worker.js, sends compile requests, returns abi + bytecode.

export type CompileResult = {
  abi: unknown[];
  bytecode: `0x${string}`;
  warnings: string[];
};

let nextId = 1;

export function compileSolidity(args: {
  source: string;
  fileName: string;
  contractName: string;
}): Promise<CompileResult> {
  // Spawn a fresh worker per compile. solc's internal CompilerStack is a
  // singleton inside the wasm module and cannot be safely reused across
  // compiles ("You shall not have another CompilerStack aside me").
  // Cost is just the JS worker boot — soljson itself is HTTP-cached.
  const worker = new Worker("/solc-worker.js");
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      try { worker.terminate(); } catch { /* ignore */ }
    };
    worker.onmessage = (e: MessageEvent) => {
      const { ok, result, error } = e.data || {};
      cleanup();
      if (ok) resolve(result);
      else reject(new Error(error || "Compilation failed"));
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || "Worker crashed"));
    };
    worker.postMessage({ id, type: "compile", payload: args });
  });
}

