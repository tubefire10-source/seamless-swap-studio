// Thin client for the Solidity compiler web worker.
// Loads /solc-worker.js, sends compile requests, returns abi + bytecode.

export type CompileResult = {
  abi: unknown[];
  bytecode: `0x${string}`;
  warnings: string[];
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (r: CompileResult) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker("/solc-worker.js");
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, result, error } = e.data || {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(result);
    else p.reject(new Error(error || "Compilation failed"));
  };
  worker.onerror = (e) => {
    // eslint-disable-next-line no-console
    console.error("solc worker error", e);
  };
  return worker;
}

export function compileSolidity(args: {
  source: string;
  fileName: string;
  contractName: string;
}): Promise<CompileResult> {
  const id = nextId++;
  const w = getWorker();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, type: "compile", payload: args });
  });
}
