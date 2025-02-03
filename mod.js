// @ts-check
/* @ts-self-types="./mod.d.ts" */

const deps = {
  // for npm: specifiers
  npmCdn: "https://esm.sh/",

  // jsr instance
  jsr: "https://jsr.io",

  // specific js files
  esms:
    "https://cdn.jsdelivr.net/npm/es-module-shims@2.0.9/dist/es-module-shims.js",
  amaro: "https://cdn.jsdelivr.net/npm/amaro@0.3.1/dist/index.js",
  semver: "https://jsr.io/@std/semver/1.0.3",
};

const jsrImportPromise = (async () => {
  /** @typedef {{
    tsTransform: string;
    shimMode?: boolean;
    resolve?: (
      id: string,
      parentUrl: string,
      resolve: (id: string, parentUrl: string) => string,
    ) => string | Promise<string>;
    fetch?: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
    revokeBlobURLs?: boolean;
    meta?: (meta: any, url: string) => void;
  }} ESMSInitOptions */

  /** @typedef {{
    imports: Record<string, string>;
    scopes: Record<string, Record<string, string>>;
    integrity: Record<string, string>;
  }} ImportMap */

  /** @typedef {{
    esmsInitOptions?: ESMSInitOptions;
    importShim: {
      (
        specifier: string,
        parentUrl?: string,
      ): Promise<any>;
      resolve: (id: string, parentURL?: string) => string;
      addImportMap: (importMap: Partial<ImportMap>) => void;
      getImportMap: () => ImportMap;
    };
  }} ESMS */

  /** @type {<T>(
    array: T[],
    element: T,
    comparator: (a: T, b: T) => number,
  ) => void} */
  function insertSorted(
    array,
    element,
    comparator,
  ) {
    let value, i;
    for (
      i = 0;
      i < array.length && (value = comparator(array[i], element)) < 0;
      i++
    ) {
      // pass
    }
    if (value === 0) return;
    array.splice(i, 0, element);
  }

  const mod = /** @type {ESMS} */ (/** @type {Partial<ESMS>} */ ({
    __proto__: globalThis,
    esmsInitOptions: {
      tsTransform: URL.createObjectURL(
        new Blob([
          `
            const module = {};
            function require(mod) {
              switch (mod) {
                case 'util': return { TextEncoder, TextDecoder };
                case 'node:buffer': return { Buffer: { from: function (a) { return Uint8Array.from(atob(a), (x) => x.charCodeAt(0)); } } };
                default: throw new Error('No impl for ' + mod);
              }
            }
          `.replace(/^ {12}/gm, "").trim() + "\n\n",
          await (await fetch(deps.amaro)).blob(),
          "\n" + `
            const amaroTransformSync = module.exports.transformSync;
            export function transform(source, url) {
              try {
                const transformed = amaroTransformSync(source, { mode: 'transform', filename: url, transform: { noEmptyExport: true } }).code;
                // Importantly, return undefined when there is no work to do
                if (transformed !== source)
                  return transformed;
              } catch (e) {
                // This is needed pending figuring out why filename option above isn't working
                throw new SyntaxError(e.message.replace(',-', url + ' - '));
              }
            }
          `.replace(/^ {12}/gm, "").trim(),
        ], { type: "text/javascript" }),
      ),
      shimMode: true,
      resolve(id, base, next) {
        if (id.startsWith("npm:")) {
          return deps.npmCdn + id.slice("npm:".length);
        }
        if (id.startsWith("jsr:")) {
          return jsrResolve(id);
        }
        return next(id, base);
      },
    },
  }));
  new Function(
    "self",
    "document",
    (await (await fetch(deps.esms)).text())
      .replace(/resolved\.r/g, "await resolved.r")
      .replace("({ n, d, t, a }) =>", "async ({ n, d, t, a }) =>")
      .replace("load.d = load.a[0]", "load.d = (await Promise.all(load.a[0]")
      .replace(".filter(l => l)", ")).filter(l => l)")
      .replace(/(`.*)importShim/g, "$1globalThis[Symbol.for('jsrImport.1')]"),
  )(mod);
  const { importShim } = mod;
  Object.defineProperty(globalThis, Symbol.for("jsrImport.1"), {
    value: {
      _s: /** @type {any} */ (importShim)._s,
      _r: /** @type {any} */ (importShim)._r,
    },
    configurable: true,
    enumerable: false,
    writable: false,
  });
  const semver = Object.assign(
    {},
    ...(await Promise.all(
      ["compare", "parse", "parse_range", "format_range", "satisfies"].map(
        (n) => importShim(`${deps.semver}/${n}.ts`),
      ),
    )),
  );
  /** @typedef {unknown} SemVer */
  /** @type {Map<string, any>} */
  const packageMetaCache = new Map();
  /** @type {Map<string, [SemVer, string][]>} */
  const versionsMap = new Map();
  async function jsrResolve(/** @type {string} */ id) {
    const match = id.match(
      /^jsr:(@[^\/@]+\/[^\/@]+|[^\/@]+)(?:@([^\/@]+))?(\/.*)?$/,
    );
    if (!match) throw new TypeError("invalid JSR specifier");
    const [, name, rawVersion, subpath] = match;
    const version = semver.parseRange(rawVersion || "*");
    let activeVersions = versionsMap.get(name);
    if (!activeVersions) {
      versionsMap.set(name, activeVersions = []);
    }
    async function pickVersion(/** @type {[SemVer, string]} */ version) {
      if (!activeVersions) throw new Error("unreachable");
      insertSorted(
        activeVersions,
        version,
        (b, a) => semver.compare(a[0], b[0]),
      );
      const pkg = `${name}@${version[1]}`;
      let versionMetaPromise = packageMetaCache.get(pkg);
      if (!versionMetaPromise) {
        versionMetaPromise = (async () =>
          await (
            await fetch(`${deps.jsr}/${name}/${version[1]}_meta.json`)
          ).json())();
        packageMetaCache.set(pkg, versionMetaPromise);
      }
      const versionMeta = await versionMetaPromise;
      return new URL(
        versionMeta.exports["." + (subpath || "")],
        `${deps.jsr}/${name}/${version[1]}/`,
      ).href;
    }
    const existingVersion = version &&
      activeVersions?.find((e) => semver.satisfies(e[0], version));
    if (existingVersion) {
      return pickVersion(existingVersion);
    }
    let packageMetaPromise = packageMetaCache.get(name);
    if (!packageMetaPromise) {
      packageMetaPromise = (async () =>
        await (await fetch(`${deps.jsr}/${name}/meta.json`)).json())();
      packageMetaCache.set(name, packageMetaPromise);
    }
    const packageMeta = await packageMetaPromise;

    /** @type {[SemVer, string][]} */
    const availableVersions = [];
    /** @type {[SemVer, string][]} */
    const yankedVersions = [];
    for (
      const [k, v]
        of /** @type {[ string, { yanked?: boolean } ][]} */ (Object.entries(
          packageMeta.versions,
        ))
    ) {
      if (v.yanked) {
        yankedVersions.push([semver.parse(k), k]);
      } else {
        availableVersions.push([semver.parse(k), k]);
      }
    }
    availableVersions.sort((b, a) => semver.compare(a[0], b[0]));
    yankedVersions.sort((b, a) => semver.compare(a[0], b[0]));
    for (const candidate of availableVersions) {
      if (semver.satisfies(candidate[0], version)) {
        return pickVersion(candidate);
      }
    }
    for (const candidate of yankedVersions) {
      if (semver.satisfies(candidate[0], version)) {
        console.warn(
          "used yanked version " +
            candidate[1] +
            " for import jsr:" +
            name +
            "@" +
            rawVersion,
        );
        return pickVersion(candidate);
      }
    }
    throw new TypeError(
      "No version matched range " +
        semver.formatRange(version) +
        " for package jsr:" +
        name,
    );
  }
  return importShim;
})();

/**
 * @param {string} id
 * @returns {Promise<any>}
 */
export default async function jsrImport(id) {
  return (await jsrImportPromise)(id);
}
