// @ts-check
/* @ts-self-types="./mod.d.ts" */

const deps = {
  // for npm: and jsr:@npm/ specifiers
  npmJsr: "https://npm2jsr.easrng.net",

  // jsr instance
  jsr: "https://jsr.io",

  // specific js files
  esms:
    "https://cdn.jsdelivr.net/npm/es-module-shims@2.0.10/dist/es-module-shims.js",
  semver: "https://jsr.io/@std/semver/1.0.4",
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

  function insertSorted(array, element, comparator) {
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

  /**
   * @param {string} pkg
   */
  function encodePackageName(pkg) {
    const match = pkg.match(/^@([^@\/]*)\/([^@\/]*)$|^([^@\/]*)$/);
    if (!match) throw new TypeError("invalid package name");
    if (match[3]) {
      if (match[3].includes("__")) {
        throw new TypeError("can't encode package name unambiguously");
      }
      return match[3];
    }
    if (match[1].includes("__")) {
      throw new TypeError("can't encode scope name unambiguously");
    }
    return `${match[1]}__${match[2]}`;
  }

  const mod = /** @type {ESMS} */ (
    /** @type {Partial<ESMS>} */ ({
      __proto__: globalThis,
      esmsInitOptions: {
        tsTransform: new URL("babel-ts-standalone.js", import.meta.url).href,
        shimMode: true,
        resolve(id, base, next) {
          if (id.startsWith("npm:")) {
            const pkg = id.match(/^npm:(@[^\/@]+\/[^\/@]+|[^@][^\/@]*)/);
            if (!pkg) throw new Error("invalid npm specifier");
            id = "jsr:@npm/" + encodePackageName(pkg[1]) +
              id.slice(pkg[0].length);
          }
          if (id.startsWith("jsr:")) {
            return jsrResolve(id);
          }
          return next(id, base);
        },
      },
    })
  );
  new Function(
    "self",
    (await (await fetch(deps.esms)).text())
      .replace(/resolved\.r/g, "await resolved.r")
      .replace("({ n, d, t, a }) =>", "async ({ n, d, t, a }) =>")
      .replace("load.d = load.a[0]", "load.d = (await Promise.all(load.a[0]")
      .replace(".filter(l => l)", ")).filter(l => l)")
      .replace(/(`.*)importShim/g, "$1globalThis[Symbol.for('jsrImport.1')]")
      .replace(
        /pushStringTo\(statementStart \+ 6\);\s+resolvedSource \+= `Shim/,
        "pushStringTo(statementStart);\nresolvedSource += `globalThis[Symbol.for('jsrImport.1')]",
      ),
  )(mod);
  const { importShim } = mod;
  Object.defineProperty(globalThis, Symbol.for("jsrImport.1"), {
    value: importShim,
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
    const [, name, rawVersion, rawSubpath] = match;
    const jsrInstance = name.startsWith("@npm/") ? deps.npmJsr : deps.jsr;
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
            await fetch(`${jsrInstance}/${name}/${version[1]}_meta.json`)
          ).json())();
        packageMetaCache.set(pkg, versionMetaPromise);
      }
      const versionMeta = await versionMetaPromise;
      const subpath = "." + (rawSubpath || "");
      const resolved = versionMeta.exports[subpath];
      if (!resolved) {
        throw new Error(
          `subpath '${subpath}' is not exported from package '${pkg}'`,
        );
      }
      return new URL(resolved, `${jsrInstance}/${name}/${version[1]}/`).href;
    }
    const existingVersion = version &&
      activeVersions?.find((e) => semver.satisfies(e[0], version));
    if (existingVersion) {
      return pickVersion(existingVersion);
    }
    let packageMetaPromise = packageMetaCache.get(name);
    if (!packageMetaPromise) {
      packageMetaPromise = (async () =>
        await (await fetch(`${jsrInstance}/${name}/meta.json`)).json())();
      packageMetaCache.set(name, packageMetaPromise);
    }
    const packageMeta = await packageMetaPromise;

    /** @type {[SemVer, string][]} */
    const availableVersions = [];
    /** @type {[SemVer, string][]} */
    const yankedVersions = [];
    for (
      const [k, v] of /** @type {[ string, { yanked?: boolean } ][]} */ (
        Object.entries(packageMeta.versions)
      )
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
