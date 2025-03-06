const { printProgress } = await import("jsr:@luca/flag");
const container = document.createElement("div");
container.style.whiteSpace = "pre-wrap";
container.textContent = "anyway here's @luca/flag\n";
document.body.append(container);
const flag = document.createElement("pre");
const realConsoleLog = console.log;
console.log = (_str: string, ...csses: string[]) => {
  flag.append(
    ...csses.map(
      (css) =>
        css &&
        Object.assign(document.createElement("span"), {
          textContent: " ",
          style: css,
        }),
    ),
    "\n",
  );
};
try {
  printProgress();
} finally {
  console.log = realConsoleLog;
}
container.append(flag);
const { encodeCbor } = await import("jsr:@std/cbor/encode-cbor");
const { encodeBase64 } = await import("jsr:@std/encoding/base64");
container.append(
  "we can import std packages like @std/cbor and @std/encoding\n",
);
container.append(
  encodeBase64(
    encodeCbor({
      awawa: true,
    }),
  ),
);
container.append("\nwow that sure is some base64 right there\n");

const { toText } = await import("jsr:@std/streams/to-text");
container.append(
  "hmm what about @std/streams? that one could be useful in browsers too\nalso i added better npm support with https://github.com/easrng/npm2jsr so i'll put that in codemirror now (with typescript lsp) (it doesn't load with esm.sh) (will take a sec to load)",
);
const text = await toText((await fetch(import.meta.url)).body!);

import type { CompilerOptions } from "npm:typescript@5.7";
const [
  ts,
  { createSystem, createVirtualTypeScriptEnvironment, createDefaultMapFromCDN },
  { basicSetup, EditorView },
  { tsAutocomplete, tsFacet, tsHover, tsLinter, tsSync },
  { autocompletion },
  { javascript },
  { createWorker },
] = await Promise.all([
  import("npm:typescript@5.7").then((m) => m.default),
  import("npm:@typescript/vfs@1"),
  import("npm:codemirror@6"),
  import("npm:@easrng/codemirror-ts"),
  import("npm:@codemirror/autocomplete@6"),
  import("npm:@codemirror/lang-javascript@6"),
  import("npm:@easrng/codemirror-ts/worker"),
]);

// ATA is complicated
// for jsr things just use the host resolver and return the imported typescript
// this isn't perfect since deps aren't loaded but it's Good Enough for the demo lol
// not even trying for npm, just stubbing them out
const jsrDeps = await Promise.all(
  text.match(/\bjsr:[^"']+/g)!.map(async (specifier) => {
    return [specifier, await import.meta.resolve(specifier)];
  }),
);
const compilerOpts: CompilerOptions = {
  target: ts.ScriptTarget.ES2024,
  jsx: ts.JsxEmit.React,
  strict: true,
  esModuleInterop: true,
  module: ts.ModuleKind.NodeNext,
  suppressOutputPathCheck: true,
  skipLibCheck: true,
  skipDefaultLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  paths: {
    ...Object.fromEntries(
      jsrDeps.map(([k, v]) => [k, ["/" + v.replace(/[\/:]+/g, "/")]]),
    ),
    "npm:*": ["/any.ts"],
  },
};
const fsMap = await createDefaultMapFromCDN(
  compilerOpts,
  ts.version,
  false,
  ts,
);
fsMap.set(
  "/any.ts",
  "export let{createSystem,createVirtualTypeScriptEnvironment,basicSetup,EditorView,tsAutocomplete,tsFacet,tsHover,tsLinter,tsSync,autocompletion,javascript,createWorker,ScriptTarget,JsxEmit,ModuleKind,ModuleResolutionKind,version}=0 as any;export type CompilerOptions=any",
);
await Promise.all(
  jsrDeps
    .map(([, v]) => ["/" + v.replace(/[\/:]+/g, "/"), v])
    .map(async ([saveTo, url]) => {
      const text = await (await fetch(url)).text();
      fsMap.set(saveTo, text);
    }),
);
const system = createSystem(fsMap);
const path = "/index.mts";
const env = createVirtualTypeScriptEnvironment(system, [], ts, compilerOpts);

const worker = createWorker({ env });
await worker.initialize();

const promised: any = {};
for (const k in worker) {
  promised[k] = (...a: any) =>
    Promise.resolve().then(() => (worker as any)[k](...a));
}

new EditorView({
  doc: text,
  extensions: [
    basicSetup,
    javascript({
      typescript: true,
      jsx: true,
    }),
    tsFacet.of({ path, worker: promised }),
    tsSync(),
    tsLinter(),
    autocompletion({
      override: [tsAutocomplete()],
    }),
    tsHover(),
  ],
  parent: container,
});
