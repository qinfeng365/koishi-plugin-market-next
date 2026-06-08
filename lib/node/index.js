var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/node/locales/schema.zh-CN.yml
var require_schema_zh_CN = __commonJS({
  "src/node/locales/schema.zh-CN.yml"(exports2, module2) {
    module2.exports = { registry: { $description: "\u63D2\u4EF6\u6E90\u8BBE\u7F6E", endpoint: "\u63D2\u4EF6\u7684\u4E0B\u8F7D\u6E90\u3002\u9ED8\u8BA4\u8DDF\u968F\u5F53\u524D\u9879\u76EE\u7684 npm config\u3002", timeout: "\u83B7\u53D6\u63D2\u4EF6\u6570\u636E\u7684\u8D85\u65F6\u65F6\u95F4\u3002", autoRoute: "\u5F53\u524D\u4E0B\u8F7D\u6E90\u83B7\u53D6\u7248\u672C\u5931\u8D25\u65F6\u81EA\u52A8\u5C1D\u8BD5\u5907\u7528 npm \u6E90\u3002", retry: "\u6BCF\u4E2A npm \u6E90\u83B7\u53D6\u7248\u672C\u5931\u8D25\u540E\u7684\u91CD\u8BD5\u6B21\u6570\u3002", concurrency: "\u6279\u91CF\u83B7\u53D6\u4F9D\u8D56\u7248\u672C\u65F6\u7684\u6700\u5927\u5E76\u53D1\u6570\u3002" }, search: { $description: "\u641C\u7D22\u8BBE\u7F6E", endpoint: "\u7528\u4E8E\u641C\u7D22\u63D2\u4EF6\u5E02\u573A\u7684\u7F51\u5740\u3002\u9ED8\u8BA4\u4F7F\u7528 t4wefan \u955C\u50CF\u3002", timeout: "\u641C\u7D22\u63D2\u4EF6\u5E02\u573A\u7684\u8D85\u65F6\u65F6\u95F4\u3002", proxyAgent: "\u7528\u4E8E\u641C\u7D22\u63D2\u4EF6\u5E02\u573A\u7684\u4EE3\u7406\u3002", autoRoute: "\u5F53\u524D\u5E02\u573A\u6E90\u5931\u8D25\u65F6\u81EA\u52A8\u5C1D\u8BD5\u5907\u7528\u5E02\u573A\u6E90\u3002", logLevel: "\u63D2\u4EF6\u5E02\u573A\u8C03\u8BD5\u65E5\u5FD7\u7EA7\u522B\u3002silent \u5173\u95ED\u65E5\u5FD7\uFF0Cdebug \u8F93\u51FA\u6700\u8BE6\u7EC6\u3002" }, chatlunaTool: "\u542F\u7528 ChatLuna \u63D2\u4EF6\u5E02\u573A\u67E5\u8BE2\u5DE5\u5177\u3002\u542F\u7528\u540E\uFF0C\u82E5\u5F53\u524D Koishi \u540C\u65F6\u5B89\u88C5\u4E86 ChatLuna\uFF0C\u4F1A\u6CE8\u518C\u53EA\u8BFB\u5DE5\u5177 koishi_plugin_market_search\u3002" };
  }
});

// src/node/locales/message.zh-CN.yml
var require_message_zh_CN = __commonJS({
  "src/node/locales/message.zh-CN.yml"(exports2, module2) {
    module2.exports = { "commands.plugin": { description: "\u63D2\u4EF6\u7BA1\u7406" }, "commands.plugin.install": { description: "\u5B89\u88C5\u63D2\u4EF6", messages: { "expect-name": "\u8BF7\u8F93\u5165\u63D2\u4EF6\u540D\u3002", "already-installed": "\u8BE5\u63D2\u4EF6\u5DF2\u5B89\u88C5\u3002", "not-found": "\u672A\u627E\u5230\u8BE5\u63D2\u4EF6\u3002", success: "\u5B89\u88C5\u6210\u529F\uFF01" } }, "commands.plugin.uninstall": { description: "\u5378\u8F7D\u63D2\u4EF6", messages: { "expect-name": "\u8BF7\u8F93\u5165\u63D2\u4EF6\u540D\u3002", "not-installed": "\u8BE5\u63D2\u4EF6\u672A\u5B89\u88C5\u3002", success: "\u5378\u8F7D\u6210\u529F\uFF01" } }, "commands.plugin.upgrade": { description: "\u5347\u7EA7\u63D2\u4EF6", options: { self: "\u5347\u7EA7 Koishi \u672C\u4F53" }, messages: { "all-updated": "\u6240\u6709\u63D2\u4EF6\u5DF2\u662F\u6700\u65B0\u7248\u672C\u3002", available: "\u6709\u53EF\u7528\u7684\u4F9D\u8D56\u66F4\u65B0\uFF1A", prompt: "\u8F93\u5165\u300CY\u300D\u5347\u7EA7\u5168\u90E8\u4F9D\u8D56\uFF0C\u8F93\u5165\u300CN\u300D\u53D6\u6D88\u64CD\u4F5C\u3002", cancelled: "\u5DF2\u53D6\u6D88\u64CD\u4F5C\u3002", success: "\u5347\u7EA7\u6210\u529F\uFF01" } } };
  }
});

// src/node/index.ts
var index_exports = {};
__export(index_exports, {
  Config: () => Config,
  Installer: () => installer_default,
  MarketProvider: () => MarketProvider,
  apply: () => apply,
  inject: () => inject,
  name: () => name,
  usage: () => usage
});
module.exports = __toCommonJS(index_exports);
var import_koishi5 = require("koishi");
var import_registry3 = __toESM(require("@koishijs/registry"));
var import_semver2 = require("semver");
var import_path3 = require("path");
var import_p_map2 = __toESM(require("p-map"));

// src/node/deps.ts
var import_console = require("@koishijs/console");
var DependencyProvider = class extends import_console.DataService {
  constructor(ctx) {
    super(ctx, "dependencies", { authority: 4 });
    this.ctx = ctx;
  }
  ctx;
  async get() {
    return this.ctx.installer.getDeps();
  }
};
var RegistryProvider = class extends import_console.DataService {
  constructor(ctx) {
    super(ctx, "registry", { authority: 4 });
    this.ctx = ctx;
  }
  ctx;
  async get() {
    return this.ctx.installer.fullCache;
  }
};
var RegistryStatusProvider = class extends import_console.DataService {
  constructor(ctx) {
    super(ctx, "registryStatus", { authority: 4 });
    this.ctx = ctx;
  }
  ctx;
  async get() {
    return this.ctx.installer.registryStatus;
  }
};

// src/node/installer.ts
var import_koishi = require("koishi");
var import_registry = __toESM(require("@koishijs/registry"));
var import_path = require("path");
var import_fs = require("fs");
var import_semver = require("semver");
var import_get_registry = __toESM(require("get-registry"));
var import_which_pm_runs = __toESM(require("which-pm-runs"));
var import_execa = __toESM(require("execa"));
var import_p_map = __toESM(require("p-map"));
var logger = new import_koishi.Logger("market");
var REGISTRY_FALLBACK_ENDPOINTS = [
  "https://registry.npmmirror.com",
  "https://mirrors.cloud.tencent.com/npm",
  "https://registry.npmjs.org",
  "https://r.cnpmjs.org"
];
var levelMap = {
  "info": "info",
  "warning": "debug",
  "error": "warn"
};
function loadManifest(name2) {
  const filename = require.resolve(name2 + "/package.json");
  const meta = JSON.parse((0, import_fs.readFileSync)(filename, "utf8"));
  meta.dependencies ||= {};
  (0, import_koishi.defineProperty)(meta, "$workspace", !filename.includes("node_modules"));
  return meta;
}
function getVersions(versions) {
  return Object.fromEntries(versions.map((item) => [item.version, (0, import_koishi.pick)(item, ["peerDependencies", "peerDependenciesMeta", "deprecated"])]).sort(([a], [b]) => (0, import_semver.compare)(b, a)));
}
var Installer = class extends import_koishi.Service {
  constructor(ctx, config = {}) {
    super(ctx, "installer");
    this.ctx = ctx;
    this.config = config;
    this.manifest = loadManifest(this.cwd);
    this.flushData = ctx.throttle(() => {
      ctx.get("console")?.broadcast("market/registry", this.tempCache);
      this.tempCache = {};
    }, 500);
    this.flushRegistryStatus = ctx.throttle(() => {
      ctx.get("console")?.broadcast("market/registry-status", this.tempRegistryStatus);
      this.tempRegistryStatus = {};
    }, 200);
  }
  ctx;
  config;
  http;
  endpoint;
  fullCache = {};
  tempCache = {};
  registryStatus = {};
  pkgTasks = {};
  agent = (0, import_which_pm_runs.default)();
  manifest;
  depTask;
  metadataEndpoint;
  routeProbeTask;
  routeProbeResult;
  flushData;
  tempRegistryStatus = {};
  flushRegistryStatus;
  serial = 0;
  get cwd() {
    return this.ctx.baseDir;
  }
  async start() {
    await this.resetEndpoint();
    logger.debug(`registry endpoint initialized: ${this.endpoint}, timeout=${this.config.timeout ?? "default"}, autoRoute=${this.config.autoRoute !== false}`);
    logger.info(`npm registry endpoint initialized: ${this.endpoint}, timeout=${this.config.timeout ?? "default"}, autoRoute=${this.config.autoRoute !== false}`);
  }
  createHttp(endpoint) {
    const { timeout } = this.config;
    return this.ctx.http.extend({
      endpoint,
      timeout
    });
  }
  async resetEndpoint() {
    const endpoint = this.config.endpoint || await (0, import_get_registry.default)();
    this.endpoint = endpoint;
    this.metadataEndpoint = endpoint;
    this.routeProbeTask = void 0;
    this.routeProbeResult = void 0;
    this.http = this.createHttp(endpoint);
  }
  resolveName(name2) {
    if (name2.startsWith("@koishijs/plugin-")) return [name2];
    if (name2.match(/(^|\/)koishi-plugin-/)) return [name2];
    if (name2[0] === "@") {
      const [left, right] = name2.split("/");
      return [`${left}/koishi-plugin-${right}`];
    } else {
      return [`@koishijs/plugin-${name2}`, `koishi-plugin-${name2}`];
    }
  }
  async findVersion(names) {
    const entries = await Promise.all(names.map(async (name2) => {
      try {
        const versions = Object.entries(await this.getPackage(name2));
        if (!versions.length) return;
        return { [name2]: versions[0][0] };
      } catch (e) {
      }
    }));
    return entries.find(Boolean);
  }
  getRegistryEndpoints() {
    return [this.metadataEndpoint || this.endpoint, this.endpoint, ...this.config.autoRoute === false ? [] : REGISTRY_FALLBACK_ENDPOINTS].filter((endpoint, index, array) => !!endpoint && array.indexOf(endpoint) === index);
  }
  getRouteProbeEndpoints() {
    if (this.config.autoRoute === false) return [];
    return [this.endpoint, ...REGISTRY_FALLBACK_ENDPOINTS].filter((endpoint, index, array) => !!endpoint && array.indexOf(endpoint) === index);
  }
  async ensureMetadataEndpoint(name2, serial = this.serial) {
    const endpoints = this.getRouteProbeEndpoints();
    if (!name2 || endpoints.length <= 1) return;
    if (!this.routeProbeTask) {
      this.routeProbeTask = this.probeMetadataEndpoint(name2, endpoints, serial);
    }
    await this.routeProbeTask;
  }
  async probeMetadataEndpoint(name2, endpoints, serial) {
    const start = Date.now();
    logger.info(`npm registry route probe started: probe=${name2}, candidates=${endpoints.join(", ")}`);
    const tasks = endpoints.map(async (endpoint) => {
      const attemptStart = Date.now();
      try {
        logger.debug(`probe npm registry endpoint: probe=${name2}, endpoint=${endpoint}`);
        const registry = await this.createHttp(endpoint).get(`/${name2}`);
        if (!registry?.versions || typeof registry.versions !== "object") {
          throw new Error(`invalid registry metadata for ${name2}`);
        }
        return { endpoint, registry, elapsed: Date.now() - attemptStart };
      } catch (error) {
        const detail = this.formatRegistryError(error);
        logger.debug(`probe npm registry endpoint failed: probe=${name2}, endpoint=${endpoint}, elapsed=${Date.now() - attemptStart}ms, reason=${detail.reason}, error=${detail.error}`);
        throw error;
      }
    });
    try {
      const result = await Promise.any(tasks);
      if (this.isStale(serial)) return;
      const previous = this.metadataEndpoint;
      this.metadataEndpoint = result.endpoint;
      this.routeProbeResult = { serial, name: name2, ...result };
      logger.info(`npm registry route probe selected: probe=${name2}, endpoint=${result.endpoint}, previous=${previous}, elapsed=${result.elapsed}ms, total=${Date.now() - start}ms`);
    } catch (error) {
      if (this.isStale(serial)) return;
      logger.warn(`npm registry route probe failed: probe=${name2}, candidates=${endpoints.length}, elapsed=${Date.now() - start}ms`);
    }
  }
  isStale(serial) {
    return serial !== this.serial || !this.ctx.scope.isActive;
  }
  setRegistryStatus(name2, status, serial = this.serial) {
    if (this.isStale(serial)) return;
    const value = {
      ...this.registryStatus[name2],
      ...status,
      updatedAt: Date.now()
    };
    this.registryStatus[name2] = this.tempRegistryStatus[name2] = value;
    this.flushRegistryStatus();
  }
  clearRegistryStatus() {
    this.registryStatus = {};
    this.tempRegistryStatus = {};
    this.ctx.get("console")?.broadcast("market/registry-status/clear", {});
  }
  async getRegistry(name2, serial = this.serial) {
    const start = Date.now();
    const maxRetry = Math.max(0, this.config.retry ?? 1);
    let attempts = 0;
    let lastError;
    let lastEndpoint = this.metadataEndpoint || this.endpoint;
    this.setRegistryStatus(name2, {
      loading: true,
      error: void 0,
      reason: void 0,
      endpoint: lastEndpoint,
      attempts,
      elapsed: void 0
    }, serial);
    await this.ensureMetadataEndpoint(name2, serial);
    if (this.isStale(serial)) return;
    const probe = this.routeProbeResult;
    if (probe?.serial === serial && probe.name === name2 && probe.endpoint === this.metadataEndpoint) {
      attempts = 1;
      this.setRegistryStatus(name2, {
        loading: false,
        error: void 0,
        reason: void 0,
        endpoint: probe.endpoint,
        attempts,
        elapsed: Date.now() - start
      }, serial);
      logger.debug(`reuse npm registry route probe payload for ${name2}: endpoint=${probe.endpoint}, probeElapsed=${probe.elapsed}ms`);
      return probe.registry;
    }
    const endpoints = this.getRegistryEndpoints();
    logger.debug(`registry metadata candidates for ${name2}: endpoints=${endpoints.join(", ")}, retry=${maxRetry}, concurrency=${this.config.concurrency ?? 4}`);
    for (const endpoint of endpoints) {
      const http = endpoint === this.endpoint ? this.http : this.createHttp(endpoint);
      for (let retry = 0; retry <= maxRetry; retry++) {
        if (this.isStale(serial)) return;
        attempts++;
        lastEndpoint = endpoint;
        this.setRegistryStatus(name2, { loading: true, endpoint, attempts }, serial);
        const attemptStart = Date.now();
        try {
          logger.debug(`fetch registry metadata for ${name2} from ${endpoint}, attempt=${retry + 1}/${maxRetry + 1}`);
          const registry = await http.get(`/${name2}`);
          if (this.isStale(serial)) return;
          if (!registry?.versions || typeof registry.versions !== "object") {
            throw new Error(`invalid registry metadata for ${name2}`);
          }
          if (endpoint !== this.metadataEndpoint) {
            logger.debug(`fallback npm registry endpoint for ${name2}: ${endpoint}`);
            logger.info(`npm registry fallback selected for ${name2}: endpoint=${endpoint}, previous=${this.metadataEndpoint}`);
            this.metadataEndpoint = endpoint;
          }
          this.setRegistryStatus(name2, {
            loading: false,
            error: void 0,
            reason: void 0,
            endpoint,
            attempts,
            elapsed: Date.now() - start
          }, serial);
          logger.debug(`loaded registry metadata for ${name2} from ${endpoint} in ${Date.now() - attemptStart}ms, versions=${Object.keys(registry.versions).length}`);
          return registry;
        } catch (error) {
          lastError = error;
          const detail2 = this.formatRegistryError(error);
          logger.debug(`failed registry metadata for ${name2} from ${endpoint} in ${Date.now() - attemptStart}ms, attempt=${retry + 1}/${maxRetry + 1}: ${detail2.error}`);
          if (detail2.reason === "not-found") break;
          if (retry < maxRetry) await sleep(300 * (retry + 1));
        }
      }
    }
    const detail = this.formatRegistryError(lastError);
    this.setRegistryStatus(name2, {
      loading: false,
      reason: detail.reason,
      error: detail.error,
      endpoint: lastEndpoint,
      attempts,
      elapsed: Date.now() - start
    }, serial);
    logger.warn(`failed to fetch registry metadata for ${name2}: ${detail.error}`);
  }
  formatRegistryError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (this.ctx.http.isError(error)) {
      const status = error.response?.status;
      if (status === 404) return { reason: "not-found", error: "npm \u5143\u6570\u636E\u4E0D\u5B58\u5728\uFF0C\u6216\u5F53\u524D\u955C\u50CF\u5C1A\u672A\u540C\u6B65\u8BE5\u5305\u3002" };
      if (status) return { reason: "http", error: `npm \u5143\u6570\u636E\u8BF7\u6C42\u5931\u8D25\uFF0CHTTP ${status}\u3002` };
    }
    if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(message)) {
      return { reason: "timeout", error: "npm \u5143\u6570\u636E\u8BF7\u6C42\u8D85\u65F6\u3002" };
    }
    if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|network/i.test(message)) {
      return { reason: "network", error: "npm \u5143\u6570\u636E\u8BF7\u6C42\u7F51\u7EDC\u5931\u8D25\u3002" };
    }
    if (/invalid registry metadata/i.test(message)) {
      return { reason: "invalid", error: "npm \u5143\u6570\u636E\u683C\u5F0F\u5F02\u5E38\u3002" };
    }
    return { reason: "unknown", error: message || "npm \u5143\u6570\u636E\u8BF7\u6C42\u5931\u8D25\u3002" };
  }
  async _getPackage(name2, serial = this.serial) {
    try {
      const registry = await this.getRegistry(name2, serial);
      if (this.isStale(serial)) return;
      if (!registry) return;
      this.fullCache[name2] = this.tempCache[name2] = getVersions(Object.values(registry.versions).filter((remote) => {
        if (name2 === "koishi") return (0, import_semver.satisfies)(remote.version, "4");
        return !import_registry.default.isPlugin(name2) || import_registry.default.isCompatible("4", remote);
      }));
      this.flushData();
      return this.fullCache[name2];
    } catch (e) {
      logger.warn(e.message);
    }
  }
  setPackage(name2, versions) {
    this.fullCache[name2] = this.tempCache[name2] = getVersions(versions);
    this.flushData();
    this.pkgTasks[name2] = Promise.resolve(this.fullCache[name2]);
  }
  getPackage(name2) {
    if (!this.pkgTasks[name2]) {
      const task = this._getPackage(name2, this.serial);
      this.pkgTasks[name2] = task;
      task.then((versions) => {
        if (this.pkgTasks[name2] !== task) return;
        if (!versions) delete this.pkgTasks[name2];
      }, () => {
        if (this.pkgTasks[name2] !== task) return;
        delete this.pkgTasks[name2];
      });
    }
    return this.pkgTasks[name2];
  }
  async _getDeps() {
    const start = Date.now();
    const result = (0, import_koishi.valueMap)(this.manifest.dependencies, (request) => {
      return { request: request.replace(/^[~^]/, "") };
    });
    const names = Object.keys(result);
    logger.debug(`refresh dependency metadata started: total=${names.length}, concurrency=${this.config.concurrency ?? 4}, registry=${this.endpoint}, autoRoute=${this.config.autoRoute !== false}`);
    const probeName = pickMetadataProbe(names);
    if (probeName) await this.ensureMetadataEndpoint(probeName, this.serial);
    logger.debug(`refresh dependency metadata route ready: probe=${probeName ?? "-"}, selected=${this.metadataEndpoint}, configured=${this.endpoint}, probed=${!!this.routeProbeResult}`);
    await (0, import_p_map.default)(names, async (name2) => {
      try {
        const meta = loadManifest(name2);
        result[name2].resolved = meta.version;
        result[name2].workspace = meta.$workspace;
        logger.debug(`local dependency resolved: ${name2}@${meta.version}, workspace=${!!meta.$workspace}, request=${result[name2].request}`);
        if (meta.$workspace) return;
      } catch {
        logger.debug(`local dependency not found before metadata fetch: ${name2}, request=${result[name2].request}`);
      }
      if (!(0, import_semver.valid)(result[name2].request)) {
        result[name2].invalid = true;
        logger.debug(`dependency request is not exact semver: ${name2}, request=${result[name2].request}`);
      }
      const versions = await this.getPackage(name2);
      if (versions) {
        result[name2].latest = Object.keys(versions)[0];
        logger.debug(`dependency latest resolved: ${name2}, resolved=${result[name2].resolved ?? "-"}, latest=${result[name2].latest}, versions=${Object.keys(versions).length}`);
      } else {
        logger.debug(`dependency latest unresolved: ${name2}, resolved=${result[name2].resolved ?? "-"}, request=${result[name2].request}`);
      }
    }, { concurrency: this.config.concurrency ?? 4 });
    const installed = Object.values(result).filter((dep) => dep.resolved).length;
    const invalid = Object.values(result).filter((dep) => dep.invalid).length;
    logger.info(`dependency metadata refresh completed: total=${Object.keys(result).length}, installed=${installed}, invalid=${invalid}, registry=${this.metadataEndpoint}, elapsed=${Date.now() - start}ms`);
    return result;
  }
  getDeps() {
    return this.depTask ||= this._getDeps();
  }
  async refreshData() {
    await Promise.all([
      this.ctx.get("console")?.refresh("dependencies"),
      this.ctx.get("console")?.refresh("registry"),
      this.ctx.get("console")?.refresh("registryStatus"),
      this.ctx.get("console")?.refresh("packages")
    ]);
  }
  async refresh(refresh = false) {
    const start = Date.now();
    this.serial++;
    await this.resetEndpoint();
    this.manifest = loadManifest(this.cwd);
    this.pkgTasks = {};
    this.fullCache = {};
    this.tempCache = {};
    this.clearRegistryStatus();
    this.depTask = this._getDeps();
    if (!refresh) return;
    await this.refreshData();
    logger.info(`dependency refresh requested by console: deps=${Object.keys(this.manifest.dependencies ?? {}).length}, elapsed=${Date.now() - start}ms`);
  }
  async exec(args) {
    const name2 = this.agent?.name ?? "npm";
    const useJson = name2 === "yarn" && this.agent.version >= "2";
    if (name2 !== "yarn") args.unshift("install");
    const start = Date.now();
    logger.info(`run package manager: agent=${name2}${this.agent?.version ? "@" + this.agent.version : ""}, args=${args.join(" ") || "(none)"}, cwd=${this.cwd}, json=${useJson}`);
    return new Promise((resolve4) => {
      if (useJson) args.push("--json");
      const child = (0, import_execa.default)(name2, args, { cwd: this.cwd });
      child.on("exit", (code) => {
        logger.info(`package manager exited: code=${code}, elapsed=${Date.now() - start}ms`);
        resolve4(code);
      });
      child.on("error", (error) => {
        logger.warn(`package manager failed to start: ${error instanceof Error ? error.message : String(error)}`);
        resolve4(-1);
      });
      let stderr = "";
      child.stderr.on("data", (data) => {
        data = stderr + data.toString();
        const lines = data.split("\n");
        stderr = lines.pop();
        for (const line of lines) {
          logger.warn(line);
        }
      });
      let stdout = "";
      child.stdout.on("data", (data) => {
        data = stdout + data.toString();
        const lines = data.split("\n");
        stdout = lines.pop();
        for (const line of lines) {
          if (!useJson || line[0] !== "{") {
            logger.info(line);
            continue;
          }
          try {
            const { type, data: data2 } = JSON.parse(line);
            logger[levelMap[type] ?? "info"](data2);
          } catch (error) {
            logger.warn(line);
            logger.warn(error);
          }
        }
      });
    });
  }
  async override(deps) {
    const filename = (0, import_path.resolve)(this.cwd, "package.json");
    logger.debug(`override package dependencies: file=${filename}, changes=${formatDeps(deps)}`);
    for (const key in deps) {
      if (deps[key]) {
        this.manifest.dependencies[key] = deps[key];
      } else {
        delete this.manifest.dependencies[key];
      }
    }
    this.manifest.dependencies = Object.fromEntries(Object.entries(this.manifest.dependencies).sort((a, b) => a[0].localeCompare(b[0])));
    await import_fs.promises.writeFile(filename, JSON.stringify(this.manifest, null, 2) + "\n");
    logger.info(`package dependencies updated: changes=${formatDeps(deps)}, total=${Object.keys(this.manifest.dependencies).length}`);
  }
  _install() {
    const args = [];
    if (this.config.endpoint) {
      args.push("--registry", this.endpoint);
    }
    return this.exec(args);
  }
  _getLocalDeps(override) {
    return (0, import_koishi.valueMap)(override, (request, name2) => {
      const dep = { request };
      try {
        const meta = loadManifest(name2);
        dep.resolved = meta.version;
        dep.workspace = meta.$workspace;
      } catch {
      }
      return dep;
    });
  }
  async install(deps, forced, beforeReload) {
    const start = Date.now();
    logger.info(`dependency install requested: deps=${formatDeps(deps)}, forced=${!!forced}`);
    const localDeps = this._getLocalDeps(deps);
    logger.debug(`dependency install local state: ${formatLocalDeps(localDeps)}`);
    await this.override(deps);
    for (const name2 in deps) {
      const { resolved, workspace } = localDeps[name2] || {};
      if (workspace || deps[name2] && resolved && (0, import_semver.satisfies)(resolved, deps[name2], { includePrerelease: true })) continue;
      forced = true;
      logger.debug(`dependency install requires package manager: name=${name2}, requested=${deps[name2] || "(remove)"}, resolved=${resolved ?? "-"}, workspace=${!!workspace}`);
      break;
    }
    if (forced) {
      const code = await this._install();
      if (code) return code;
    }
    await this.refresh();
    const newDeps = await this.getDeps();
    let shouldReload = false;
    for (const name2 in localDeps) {
      const { resolved, workspace } = localDeps[name2];
      if (workspace || !newDeps[name2]) continue;
      if (newDeps[name2].resolved === resolved) continue;
      try {
        if (!(require.resolve(name2) in require.cache)) continue;
      } catch (error) {
        logger.error(error);
      }
      shouldReload = true;
      logger.debug(`dependency changed may require full reload: ${name2}, previous=${resolved ?? "-"}, current=${newDeps[name2]?.resolved ?? "-"}`);
    }
    if (beforeReload) {
      try {
        logger.debug("run pre-reload dependency hook");
        await beforeReload();
      } catch (error) {
        logger.warn(error);
      }
    }
    await this.refreshData();
    logger.info(`dependency install completed: deps=${formatDeps(deps)}, forced=${!!forced}, fullReload=${shouldReload}, elapsed=${Date.now() - start}ms`);
    if (shouldReload) {
      logger.info("dependency install triggers full reload");
      this.ctx.loader.fullReload();
    }
    return 0;
  }
};
((Installer2) => {
  Installer2.Config = import_koishi.Schema.object({
    endpoint: import_koishi.Schema.string().role("link"),
    timeout: import_koishi.Schema.number().role("time").default(import_koishi.Time.second * 5),
    autoRoute: import_koishi.Schema.boolean().default(true),
    retry: import_koishi.Schema.number().min(0).max(5).step(1).default(1),
    concurrency: import_koishi.Schema.number().min(1).max(16).step(1).default(4)
  });
})(Installer || (Installer = {}));
function sleep(ms) {
  return new Promise((resolve4) => setTimeout(resolve4, ms));
}
function formatDeps(deps) {
  const entries = Object.entries(deps);
  if (!entries.length) return "(none)";
  return entries.map(([name2, version]) => `${name2}@${version || "(remove)"}`).join(", ");
}
function formatLocalDeps(deps) {
  const entries = Object.entries(deps);
  if (!entries.length) return "(none)";
  return entries.map(([name2, dep]) => `${name2}{request=${dep.request || "-"},resolved=${dep.resolved ?? "-"},workspace=${!!dep.workspace}}`).join(", ");
}
function pickMetadataProbe(names) {
  return names.find((name2) => name2 === "koishi") || names.find((name2) => name2 === "@koishijs/plugin-console") || names.find((name2) => import_registry.default.isPlugin(name2)) || names[0];
}
var installer_default = Installer;

// src/node/market.ts
var import_koishi3 = require("koishi");
var import_registry2 = __toESM(require("@koishijs/registry"));

// src/shared/index.ts
var import_koishi2 = require("koishi");
var import_console2 = require("@koishijs/console");
var logger2 = new import_koishi2.Logger("market");
var MarketProvider = class extends import_console2.DataService {
  _task;
  _timestamp = 0;
  _error;
  constructor(ctx) {
    super(ctx, "market", { authority: 4 });
    ctx.console.addListener("market/refresh", async () => {
      await this.start(true);
    }, { authority: 4 });
    ctx.on("console/connection", async (client) => {
      if (!ctx.console.clients[client.id]) return;
      if (Date.now() - this._timestamp <= import_koishi2.Time.hour * 12) return;
      if (await this.ctx.serial("console/intercept", client, { authority: 4 })) return;
      this.start();
    });
  }
  async start(refresh = false) {
    this._task = null;
    this._error = null;
    this._timestamp = Date.now();
    await this.refresh();
  }
  async prepare() {
    return this._task ||= this.collect().catch((error) => {
      if (error?.message !== "market provider disposed") logger2.warn(error);
      this._error = error;
      this._task = null;
    });
  }
};

// src/node/market.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
var import_crypto = require("crypto");
var DEFAULT_ENDPOINT = "https://registry.koishi.t4wefan.pub/index.json";
var FALLBACK_ENDPOINTS = [
  "https://registry.koishi.t4wefan.pub/index.json",
  "https://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json",
  "https://koi.nyan.zone/registry/index.json",
  "https://kp.itzdrli.cc",
  "https://koishi.itzdrli.cc",
  "https://registry.koishi.chat/index.json"
];
var ROUTE_STAGGER = 120;
var FIRST_PAYLOAD_TIMEOUT = import_koishi3.Time.second * 1.5;
var FAST_ROUTE_THRESHOLD = import_koishi3.Time.second * 1.5;
var MAX_CACHE_ENTRIES = 3;
var logLevels = ["silent", "error", "warn", "info", "debug"];
var MarketProvider2 = class extends MarketProvider {
  constructor(ctx, config = {}) {
    super(ctx);
    this.config = config;
    ctx.effect(() => () => {
      this.disposed = true;
      this.serial++;
      clearTimeout(this.cacheWriteTimer);
    });
    config.endpoint ||= DEFAULT_ENDPOINT;
    this.endpoint = config.endpoint;
    this.cacheFile = (0, import_path2.resolve)(ctx.baseDir, "cache", "market-next-index.json");
    this.http = ctx.http.extend(config);
    this.flushData = ctx.throttle(() => {
      if (this.disposed || !this.scanner || !ctx.scope.isActive) return;
      this.log("debug", `broadcast market patch: delta=${Object.keys(this.tempCache).length}, total=${this.scanner.total}, progress=${this.scanner.progress}, failed=${this.failed.length}`);
      ctx.console.broadcast("market/patch", {
        data: this.tempCache,
        failed: this.failed.length,
        total: this.scanner.total,
        progress: this.scanner.progress,
        stale: false,
        error: void 0,
        cached: false,
        cachedAt: void 0,
        validatedAt: void 0,
        refreshing: false,
        debug: this.getDebugInfo()
      });
      this.tempCache = {};
    }, 500);
  }
  config;
  http;
  failed = [];
  scanner;
  fullCache = {};
  tempCache = {};
  payload;
  endpoint;
  disposed = false;
  serial = 0;
  forceRefresh = false;
  indexMode = "modern";
  cacheFile;
  cacheEntries = {};
  cacheMeta;
  conditionMeta;
  cacheResult;
  debugInfo;
  routeStats = {};
  backgroundTask;
  backgroundSerial;
  pendingRefreshTask;
  cacheWriteTimer;
  flushData;
  async start(refresh = false) {
    const reuseBackground = refresh && !!this.backgroundTask && this.backgroundSerial === this.serial;
    const serial = reuseBackground ? this.serial : ++this.serial;
    const start = Date.now();
    this.log("debug", `start market refresh=${refresh}, serial=${serial}, endpoint=${this.config.endpoint}, timeout=${this.config.timeout ?? "default"}, autoRoute=${this.config.autoRoute !== false}`);
    if (refresh) {
      this.log("info", `market refresh requested: endpoint=${this.config.endpoint}, autoRoute=${this.config.autoRoute !== false}, cache=${this.hasCurrentMarketData() ? "warm" : "cold"}`);
    }
    this.forceRefresh = false;
    if (refresh && await this.startSoftRefresh(serial, start)) {
      if (this.isStale(serial)) {
        this.log("debug", `skip soft market refresh because provider is stale, serial=${serial}`);
        return;
      }
      this.log("debug", `market soft refresh accepted in ${Date.now() - start}ms, serial=${serial}`);
      return;
    }
    this.failed = [];
    this.fullCache = {};
    this.tempCache = {};
    this.debugInfo = void 0;
    if (refresh) {
      this._task = null;
      this._error = null;
      this.log("debug", "soft refresh has no usable cache: start cold market load");
    }
    try {
      await super.start(false);
    } finally {
      this.forceRefresh = false;
    }
    if (this.isStale(serial)) {
      this.log("debug", `skip market refresh result because provider is stale, serial=${serial}`);
      return;
    }
    this.log("debug", `market start completed in ${Date.now() - start}ms, serial=${serial}`);
    this.log("info", `market start completed: elapsed=${Date.now() - start}ms, endpoint=${this.endpoint || this.config.endpoint}, objects=${this.scanner?.total ?? 0}, source=${this.debugInfo?.source ?? "unknown"}`);
  }
  async collect() {
    const serial = this.serial;
    const { timeout } = this.config;
    const registry = this.createScanner();
    const start = Date.now();
    this.failed = [];
    this.log("debug", `collect market index, serial=${serial}, searchEndpoint=${this.config.endpoint}, registryEndpoint=${registry?.config.endpoint}, timeout=${timeout ?? "default"}`);
    if (this.http) {
      if (!this.forceRefresh && await this.applyDiskCache(serial)) {
        if (this.refreshInBackground(serial, "cache-first")) void this.notifyMarketRefresh();
        this.log("debug", `collect market index returned disk cache first, serial=${serial}, elapsed=${Date.now() - start}ms`);
        return null;
      }
      const result = await this.fetchIndex(serial);
      if (this.isStale(serial)) {
        this.log("debug", `drop fetched market index because provider is stale, serial=${serial}`);
        return null;
      }
      const applyStart = Date.now();
      this.applyIndex(result.result, result.endpoint);
      result.timings.apply = Date.now() - applyStart;
      result.timings.total = Date.now() - start;
      this.updateCacheState(result);
      if (result.source !== "disk-cache") this.scheduleDiskCacheWrite(result.result, this.conditionMeta);
      this.cacheMeta = void 0;
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(result.hash),
        etag: result.etag,
        lastModified: result.lastModified,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings
      }, "initial");
      this.log("debug", `loaded market index from ${this.endpoint}: ${this.scanner.total}/${result.result.objects.length} objects, source=${result.source}, version=${this.scanner.version ?? "legacy"}, elapsed=${Date.now() - start}ms`);
      this.log("info", `market index ready: ${formatSnapshot({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        objects: this.scanner.total,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings
      })}`);
    } else {
      this.indexMode = "legacy";
      this.log("debug", `collect legacy registry index via scanner, registryEndpoint=${registry?.config.endpoint}`);
      await this.scanner.collect({ timeout });
      this.log("debug", `legacy scanner collect completed: total=${this.scanner.total}, version=${this.scanner.version ?? "legacy"}, elapsed=${Date.now() - start}ms`);
    }
    if (!this.scanner.version) {
      const analyzeStart = Date.now();
      this.log("debug", `analyze legacy market packages, total=${this.scanner.total}`);
      this.scanner.analyze({
        version: "4",
        onFailure: (name2, reason) => {
          this.failed.push(name2);
          this.log("debug", `failed to analyze package ${name2}: ${formatError(reason)}`);
          if (registry.config.endpoint.startsWith("https://registry.npmmirror.com")) {
            if (this.ctx.http.isError(reason) && reason.response?.status === 404) {
            }
          }
        },
        onRegistry: (registry2, versions) => {
          this.log("debug", `loaded registry metadata for ${registry2.name}: ${versions.length} versions`);
          this.ctx.installer.setPackage(registry2.name, versions);
        },
        onSuccess: (object, versions) => {
          object.package.links ||= {
            npm: `${registry.config.endpoint.replace("registry.", "www.")}/package/${object.package.name}`
          };
          this.fullCache[object.package.name] = this.tempCache[object.package.name] = object;
        },
        after: () => this.flushData()
      });
      this.log("debug", `legacy analyze completed: success=${Object.keys(this.fullCache).length}, failed=${this.failed.length}, elapsed=${Date.now() - analyzeStart}ms`);
    }
    if (this.indexMode === "legacy") {
      this.updateDebugInfo({
        source: "legacy",
        endpoint: registry?.config.endpoint,
        objects: Object.keys(this.fullCache).length,
        timings: { total: Date.now() - start }
      });
    }
    this.log("debug", `collect market index completed, serial=${serial}, elapsed=${Date.now() - start}ms`);
    return null;
  }
  createScanner() {
    const registry = this.ctx.installer.http;
    this.scanner = new import_registry2.default((url, config) => registry.get(url, config));
    return registry;
  }
  hasCurrentMarketData() {
    return !!this.payload || !!this.scanner?.version || this.scanner?.total > 0 || Object.keys(this.fullCache).length > 0;
  }
  async startSoftRefresh(serial, start) {
    if (!this.http) return false;
    this._error = null;
    this.tempCache = {};
    if (this.backgroundTask && this.backgroundSerial === serial) {
      this.log("debug", `soft refresh reused running background task, serial=${serial}, elapsed=${Date.now() - start}ms`);
      this.log("info", `market soft refresh reused running background task: serial=${serial}, elapsed=${Date.now() - start}ms`);
      await this.notifyMarketRefresh();
      return true;
    }
    if (this.hasCurrentMarketData()) {
      if (!this.scanner) this.createScanner();
      this.log("debug", `soft refresh started with current market data, serial=${serial}, hasScanner=${!!this.scanner}, hasPayload=${!!this.payload}`);
      this.log("info", `market soft refresh started with current data: serial=${serial}, endpoint=${this.endpoint || this.config.endpoint}, objects=${this.scanner?.total ?? this.payload?.total ?? 0}`);
      this.refreshInBackground(serial, "soft refresh");
      await this.notifyMarketRefresh();
      return true;
    }
    this.failed = [];
    this.fullCache = {};
    this.createScanner();
    if (await this.applyDiskCache(serial)) {
      this.log("debug", `soft refresh loaded disk cache before background refresh, serial=${serial}, elapsed=${Date.now() - start}ms`);
      this.log("info", `market soft refresh loaded disk cache first: serial=${serial}, elapsed=${Date.now() - start}ms, endpoint=${this.endpoint}`);
      this.refreshInBackground(serial, "soft refresh");
      await this.notifyMarketRefresh();
      return true;
    }
    return false;
  }
  async fetchIndex(serial) {
    const endpoints = this.getEndpoints();
    this.log("debug", `market endpoint candidates: ${endpoints.join(", ")}`);
    this.log("debug", `market route scores before fetch: ${formatRouteScores(this.getRouteScores(endpoints))}`);
    this.log("info", `market endpoint candidates: primary=${endpoints[0]}, fallbacks=${Math.max(0, endpoints.length - 1)}, autoRoute=${this.config.autoRoute !== false}`);
    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const result = await this.fetchEndpoint(endpoints[0], 0, endpoints.length, serial);
      const { endpoint } = result;
      this.endpoint = endpoint;
      result.preferredEndpoint = endpoints[0];
      this.recordRouteSuccess(result);
      return result;
    }
    this.log("debug", `fetch primary market endpoint first, primary=${endpoints[0]}, fallbacks=${endpoints.slice(1).join(", ")}, slowThreshold=${FAST_ROUTE_THRESHOLD}ms`);
    this.log("info", `market route started: primary=${endpoints[0]}, fallbackCount=${endpoints.length - 1}, slowThreshold=${FAST_ROUTE_THRESHOLD}ms`);
    return new Promise((resolve4, reject) => {
      let settled = false;
      let failed = 0;
      let lastError;
      let fallbackStarted = false;
      let fallbackReason;
      const controllers = endpoints.map(() => new AbortController());
      const timer = setTimeout(() => startFallback("primary-slow"), FAST_ROUTE_THRESHOLD);
      const settle = (data, index) => {
        if (settled) {
          this.log("debug", `ignore slower market endpoint ${data.endpoint}, elapsed=${data.elapsed}ms`);
          return;
        }
        settled = true;
        clearTimeout(timer);
        controllers.forEach((controller, controllerIndex) => {
          if (controllerIndex !== index) controller.abort(new Error("market endpoint race settled"));
        });
        this.endpoint = data.endpoint;
        data.preferredEndpoint = endpoints[0];
        if (data.endpoint !== this.config.endpoint) {
          data.fallbackReason = fallbackReason;
          this.log("debug", `fallback endpoint selected: endpoint=${data.endpoint}, reason=${fallbackReason ?? "unknown"}, elapsed=${data.elapsed}ms`);
          this.log("info", `market fallback endpoint selected: endpoint=${data.endpoint}, reason=${fallbackReason ?? "unknown"}, elapsed=${data.elapsed}ms, primary=${endpoints[0]}`);
        } else {
          this.log("info", `market primary endpoint selected: endpoint=${data.endpoint}, elapsed=${data.elapsed}ms, source=${data.source}`);
        }
        this.recordRouteSuccess(data);
        resolve4(data);
      };
      const fail = (endpoint, index, error) => {
        if (settled) return;
        this.recordRouteFailure(endpoint);
        lastError = error;
        failed++;
        if (index === 0) startFallback("primary-failed");
        if (failed < endpoints.length) return;
        settled = true;
        clearTimeout(timer);
        this.log("debug", `all market endpoint candidates failed, count=${endpoints.length}`);
        reject(lastError);
      };
      const startEndpoint = (endpoint, index, waitIndex = 0) => {
        const signal = controllers[index].signal;
        this.waitRouteTurn(waitIndex, signal).then(() => {
          if (settled) throw new Error("market endpoint race settled before request");
          return this.fetchEndpoint(endpoint, index, endpoints.length, serial, false, signal);
        }).then((data) => settle(data, index)).catch((error) => fail(endpoint, index, error));
      };
      const startFallback = (reason) => {
        if (settled || fallbackStarted) return;
        fallbackStarted = true;
        fallbackReason = reason;
        this.log("debug", `start fallback market endpoint race, reason=${reason}, count=${endpoints.length - 1}, stagger=${ROUTE_STAGGER}ms`);
        this.log("info", `market fallback race started: reason=${reason}, count=${endpoints.length - 1}, stagger=${ROUTE_STAGGER}ms`);
        endpoints.slice(1).forEach((endpoint, fallbackIndex) => {
          startEndpoint(endpoint, fallbackIndex + 1, fallbackIndex);
        });
      };
      startEndpoint(endpoints[0], 0);
    });
  }
  getEndpointCandidates() {
    const endpoints = [this.config.endpoint, ...this.config.autoRoute === false ? [] : FALLBACK_ENDPOINTS].filter((endpoint, index, array) => !!endpoint && array.indexOf(endpoint) === index);
    return endpoints;
  }
  getEndpoints() {
    const endpoints = this.getEndpointCandidates();
    if (this.config.autoRoute === false) return endpoints;
    const [primary, ...fallbacks] = endpoints;
    const originalIndex = new Map(fallbacks.map((endpoint, index) => [endpoint, index]));
    return [primary, ...fallbacks.sort((a, b) => {
      const delta = this.getRouteScore(b) - this.getRouteScore(a);
      if (delta) return delta;
      return (originalIndex.get(a) ?? 0) - (originalIndex.get(b) ?? 0);
    })];
  }
  getPreferredEndpoint() {
    return this.config.endpoint;
  }
  waitRouteTurn(index, signal) {
    if (!index) return Promise.resolve();
    return new Promise((resolve4, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const timer = setTimeout(resolve4, index * ROUTE_STAGGER);
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(signal.reason);
      }, { once: true });
    });
  }
  getRouteScore(endpoint) {
    const stats = this.routeStats[endpoint];
    const cached = this.cacheEntries[endpoint];
    let score = endpoint === this.config.endpoint ? 1 : 0;
    if (cached) {
      const age = Date.now() - cached.fetchedAt;
      score += age <= import_koishi3.Time.day ? 1.5 : 0.5;
    }
    if (!stats) return score;
    const total = stats.successes + stats.failures;
    if (total) score += (stats.successes / total - 0.5) * 4;
    score += stats.score;
    score += Math.min(1.5, stats.successes * 0.3);
    score -= Math.min(6, stats.failures * 1.2);
    if (stats.averageElapsed != null) {
      if (stats.averageElapsed <= 600) score += 4;
      else if (stats.averageElapsed <= 1e3) score += 3;
      else if (stats.averageElapsed <= FAST_ROUTE_THRESHOLD) score += 2;
      else if (stats.averageElapsed <= 2500) score += 0;
      else if (stats.averageElapsed <= 4e3) score -= 2;
      else score -= 4;
    }
    if (stats.contentEncoding === "br") score += 0.5;
    if (stats.contentEncoding === "gzip") score += 0.2;
    if (stats.lastSuccess && Date.now() - stats.lastSuccess <= import_koishi3.Time.minute * 10) score += 0.5;
    return score;
  }
  recordRouteSuccess(result) {
    const stats = this.routeStats[result.endpoint] ||= { score: 0, successes: 0, failures: 0 };
    stats.successes++;
    stats.score = clamp(stats.score + (result.elapsed <= FAST_ROUTE_THRESHOLD ? 0.5 : -0.5), -6, 3);
    stats.lastSuccess = Date.now();
    stats.contentEncoding = result.contentEncoding;
    stats.averageElapsed = stats.averageElapsed == null ? result.elapsed : stats.averageElapsed * 0.7 + result.elapsed * 0.3;
    this.log("debug", `route success updated: endpoint=${result.endpoint}, elapsed=${result.elapsed}ms, source=${result.source}, score=${stats.score.toFixed(2)}, successes=${stats.successes}, failures=${stats.failures}, average=${Math.round(stats.averageElapsed)}ms, encoding=${stats.contentEncoding ?? "identity"}`);
  }
  recordRouteFailure(endpoint) {
    const stats = this.routeStats[endpoint] ||= { score: 0, successes: 0, failures: 0 };
    stats.failures++;
    stats.score = clamp(stats.score - 2, -10, 3);
    this.log("debug", `route failure updated: endpoint=${endpoint}, score=${stats.score.toFixed(2)}, successes=${stats.successes}, failures=${stats.failures}, average=${stats.averageElapsed == null ? "-" : Math.round(stats.averageElapsed) + "ms"}`);
  }
  getRouteScores(endpoints = this.getEndpoints()) {
    return endpoints.map((endpoint) => {
      const stats = this.routeStats[endpoint];
      const cache2 = this.cacheEntries[endpoint];
      return {
        endpoint,
        score: Math.round(this.getRouteScore(endpoint) * 10) / 10,
        successes: stats?.successes,
        failures: stats?.failures,
        averageElapsed: stats?.averageElapsed,
        lastSuccess: stats?.lastSuccess,
        contentEncoding: stats?.contentEncoding,
        cached: !!cache2,
        cachedAt: cache2?.fetchedAt
      };
    });
  }
  getConditionalHeaders(endpoint) {
    const meta = this.cacheEntries[endpoint] || (this.conditionMeta?.endpoint === endpoint ? this.conditionMeta : void 0);
    if (!meta) return {};
    const headers = {};
    if (meta.etag) headers["if-none-match"] = meta.etag;
    if (meta.lastModified) headers["if-modified-since"] = meta.lastModified;
    return headers;
  }
  updateCacheState(result) {
    const cached = this.cacheEntries[result.endpoint];
    const sameEndpoint = this.conditionMeta?.endpoint === result.endpoint;
    this.cacheResult = result.result;
    this.conditionMeta = {
      endpoint: result.endpoint,
      fetchedAt: result.source === "network" ? Date.now() : result.cachedAt ?? cached?.fetchedAt ?? this.conditionMeta?.fetchedAt ?? Date.now(),
      validatedAt: result.validatedAt,
      etag: result.etag ?? (sameEndpoint ? this.conditionMeta?.etag : void 0),
      lastModified: result.lastModified ?? (sameEndpoint ? this.conditionMeta?.lastModified : void 0),
      hash: result.hash ?? this.conditionMeta?.hash,
      size: result.size ?? this.conditionMeta?.size,
      wireSize: result.wireSize ?? this.conditionMeta?.wireSize,
      contentEncoding: result.contentEncoding ?? this.conditionMeta?.contentEncoding
    };
    this.cacheEntries[result.endpoint] = {
      ...this.conditionMeta,
      result: result.result
    };
  }
  async fetchEndpoint(endpoint, index, total, serial, warnFailure = true, signal) {
    if (this.isStale(serial)) throw new Error("market provider disposed");
    const start = Date.now();
    try {
      const http = this.ctx.http.extend({
        ...this.config,
        endpoint
      });
      const conditional = this.getConditionalHeaders(endpoint);
      const headers = {
        "accept-encoding": "br,gzip,deflate",
        ...conditional
      };
      const requestStart = Date.now();
      this.log("debug", `fetch market index from ${endpoint} (${index + 1}/${total}), timeout=${this.config.timeout ?? "default"}, proxy=${this.config.proxyAgent ? "yes" : "no"}, compression=yes, conditional=${Object.keys(conditional).length ? "yes" : "no"}`);
      this.log("debug", `market request headers: endpoint=${endpoint}, acceptEncoding=br,gzip,deflate, etag=${conditional["if-none-match"] ?? "-"}, lastModified=${conditional["if-modified-since"] ?? "-"}`);
      const response = await http("", {
        responseType: "text",
        headers,
        signal,
        validateStatus: (status) => status === 304 || status >= 200 && status < 300
      });
      if (this.isStale(serial)) throw new Error("market provider disposed");
      const requestElapsed = Date.now() - requestStart;
      const etag = response.headers.get("etag") || void 0;
      const lastModified = response.headers.get("last-modified") || void 0;
      const contentEncoding = response.headers.get("content-encoding") || void 0;
      const headerWireSize = parseContentLength(response.headers.get("content-length"));
      this.log("debug", `market response headers: endpoint=${endpoint}, status=${response.status}, request=${requestElapsed}ms, etag=${etag ?? "-"}, lastModified=${lastModified ?? "-"}, encoding=${contentEncoding ?? "identity"}, contentLength=${formatBytes(headerWireSize)}`);
      const cached = this.cacheEntries[endpoint];
      if (response.status === 304) {
        if (!cached) {
          throw new Error(`market index from ${endpoint} returned 304 without cache`);
        }
        const elapsed2 = Date.now() - start;
        const validatedAt = Date.now();
        this.log("debug", `market index not modified from ${endpoint} in ${elapsed2}ms, reuse cache hash=${shortHash(cached.hash) || "unknown"}`);
        this.log("info", `market index http-304: endpoint=${endpoint}, elapsed=${elapsed2}ms, request=${requestElapsed}ms, cachedAt=${formatTime(cached.fetchedAt)}, hash=${shortHash(cached.hash) || "unknown"}`);
        return {
          endpoint,
          result: cached.result,
          elapsed: elapsed2,
          candidates: total,
          source: "http-304",
          timings: { request: requestElapsed, total: elapsed2 },
          size: cached.size,
          wireSize: headerWireSize ?? cached.wireSize,
          contentEncoding: contentEncoding ?? cached.contentEncoding,
          hash: cached.hash,
          etag: etag || cached.etag,
          lastModified: lastModified || cached.lastModified,
          cachedAt: cached.fetchedAt,
          validatedAt
        };
      }
      const text = response.data;
      const size = Buffer.byteLength(text);
      const wireSize = normalizeWireSize(headerWireSize, size);
      this.log("debug", `market response body decoded: endpoint=${endpoint}, chars=${text.length}, decodedSize=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, cachedHash=${shortHash(cached?.hash) ?? "-"}, cachedAt=${cached?.fetchedAt ? formatTime(cached.fetchedAt) : "-"}`);
      const hashStart = Date.now();
      const hash = (0, import_crypto.createHash)("sha256").update(text).digest("hex");
      const hashElapsed = Date.now() - hashStart;
      this.log("debug", `market response hash computed: endpoint=${endpoint}, hash=${shortHash(hash) || "unknown"}, elapsed=${hashElapsed}ms, unchanged=${!!cached && cached.hash === hash}`);
      if (cached && cached.hash === hash) {
        const elapsed2 = Date.now() - start;
        const validatedAt = Date.now();
        this.log("debug", `market index hash unchanged from ${endpoint} in ${elapsed2}ms, size=${size}, hash=${shortHash(hash)}`);
        this.log("info", `market index hash-cache: endpoint=${endpoint}, elapsed=${elapsed2}ms, request=${requestElapsed}ms, hash=${shortHash(hash)}, size=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, encoding=${contentEncoding ?? "identity"}`);
        return {
          endpoint,
          result: cached.result,
          elapsed: elapsed2,
          candidates: total,
          source: "hash-cache",
          timings: { request: requestElapsed, hash: hashElapsed, total: elapsed2 },
          size,
          wireSize,
          contentEncoding,
          hash,
          etag,
          lastModified,
          cachedAt: cached.fetchedAt,
          validatedAt
        };
      }
      const parseStart = Date.now();
      this.log("debug", `market json parse started: endpoint=${endpoint}, decodedSize=${formatBytes(size)}`);
      const result = JSON.parse(text);
      const parseElapsed = Date.now() - parseStart;
      if (!Array.isArray(result?.objects)) {
        throw new Error(`invalid market index from ${endpoint}`);
      }
      this.log("debug", `market json parse completed: endpoint=${endpoint}, objects=${result.objects.length}, version=${result.version ?? "legacy"}, elapsed=${parseElapsed}ms`);
      const elapsed = Date.now() - start;
      this.log("debug", `market index fetched from ${endpoint} in ${elapsed}ms, objects=${result.objects.length}, size=${size}, wireSize=${wireSize ?? "unknown"}, encoding=${contentEncoding ?? "identity"}, hash=${shortHash(hash) || "unknown"}, version=${result.version ?? "legacy"}`);
      this.log("info", `market index fetched: endpoint=${endpoint}, elapsed=${elapsed}ms, request=${requestElapsed}ms, hash=${hashElapsed}ms, json=${parseElapsed}ms, objects=${result.objects.length}, size=${formatBytes(size)}, wireSize=${formatBytes(wireSize)}, encoding=${contentEncoding ?? "identity"}, hash=${shortHash(hash) || "unknown"}, version=${result.version ?? "legacy"}`);
      return {
        endpoint,
        result,
        elapsed,
        candidates: total,
        source: "network",
        timings: { request: requestElapsed, hash: hashElapsed, parse: parseElapsed, total: elapsed },
        size,
        wireSize,
        contentEncoding,
        hash,
        etag,
        lastModified
      };
    } catch (error) {
      if (this.isStale(serial)) throw new Error("market provider disposed");
      this.log(warnFailure ? "warn" : "debug", `failed to fetch market index from ${endpoint} in ${Date.now() - start}ms: ${formatError(error)}`);
      this.log("debug", `market endpoint error detail: endpoint=${endpoint}, index=${index + 1}/${total}, warn=${warnFailure}, elapsed=${Date.now() - start}ms, stack=${formatStack(error)}`);
      throw error;
    }
  }
  async get() {
    const start = Date.now();
    if (this.backgroundTask && this.hasCurrentMarketData()) {
      this.log("debug", `return current market payload while background refresh is running, hasScanner=${!!this.scanner}, hasPayload=${!!this.payload}, elapsed=${Date.now() - start}ms`);
      if (this.scanner) return this.createPayload(start, true);
      return {
        ...this.payload,
        stale: false,
        error: void 0,
        refreshing: true,
        loading: false,
        debug: this.getDebugInfo()
      };
    }
    const task = this.prepare();
    if (!this.scanner && !this.payload) {
      const ready = await waitFor(task, FIRST_PAYLOAD_TIMEOUT);
      if (!ready) {
        this.refreshAfterPrepare(task);
        this.log("debug", `return loading market payload while waiting for network, elapsed=${Date.now() - start}ms`);
        this.log("info", `market first payload still waiting for network: elapsed=${Date.now() - start}ms, endpoint=${this.endpoint || this.config.endpoint}`);
        return {
          registry: this.endpoint || this.config.endpoint,
          data: {},
          failed: 0,
          total: 0,
          progress: 0,
          stale: false,
          error: void 0,
          cached: false,
          refreshing: true,
          loading: true,
          debug: this.getDebugInfo({ total: Date.now() - start })
        };
      }
    } else {
      await task;
    }
    if (!this.scanner) {
      this.log("debug", `get market payload without scanner, cached=${!!this.payload}, elapsed=${Date.now() - start}ms`);
      return this.payload ? { ...this.payload, debug: this.getDebugInfo() } : { data: {}, failed: 0, total: 0, progress: 0, debug: this.getDebugInfo() };
    }
    if (this._error) {
      if (!this.payload && this.hasCurrentMarketData() && this.scanner) {
        this.createPayload(start, false);
      }
      if (this.payload) {
        const error = formatError(this._error);
        this.log("debug", `use cached market payload because current load failed: ${error}`);
        this.log("warn", `market load failed; returning previous payload: endpoint=${this.endpoint || this.config.endpoint}, total=${this.payload.total}, error=${error}`);
        return {
          ...this.payload,
          stale: true,
          error,
          refreshing: false,
          loading: false,
          debug: this.getDebugInfo()
        };
      }
      this.log("debug", `get market payload failed without cache, error=${formatError(this._error)}, elapsed=${Date.now() - start}ms`);
      return {
        registry: this.endpoint || this.config.endpoint,
        data: {},
        failed: 0,
        total: 0,
        progress: 0,
        stale: false,
        error: formatError(this._error),
        cached: false,
        refreshing: false,
        loading: false,
        debug: this.getDebugInfo()
      };
    }
    return this.createPayload(start);
  }
  createPayload(start, refreshing = !!this.backgroundTask) {
    this._task ||= Promise.resolve(null);
    const payloadStart = Date.now();
    let data;
    let dataElapsed = 0;
    if (this.indexMode === "modern") {
      const dataStart = Date.now();
      data = Object.fromEntries(this.scanner.objects.map((item) => [item.package.name, item]));
      dataElapsed = Date.now() - dataStart;
    } else {
      data = this.fullCache;
    }
    const payload = {
      registry: this.endpoint || this.ctx.installer.endpoint,
      data,
      failed: this.indexMode === "modern" ? 0 : this.failed.length,
      total: this.scanner.total,
      progress: this.indexMode === "modern" ? this.scanner.total : this.scanner.progress,
      gravatar: process.env.GRAVATAR_MIRROR,
      stale: false,
      error: void 0,
      cached: !!this.cacheMeta,
      cachedAt: this.cacheMeta?.fetchedAt,
      validatedAt: this.cacheMeta?.validatedAt,
      refreshing,
      loading: false,
      debug: this.getDebugInfo({
        payloadData: dataElapsed,
        payload: Date.now() - payloadStart
      })
    };
    this.payload = payload;
    this.log("debug", `get market payload completed: total=${payload.total}, progress=${payload.progress}, failed=${payload.failed}, stale=${!!payload.stale}, elapsed=${Date.now() - start}ms`);
    this.log("debug", `market payload detail: registry=${payload.registry}, cached=${payload.cached}, cachedAt=${payload.cachedAt ? formatTime(payload.cachedAt) : "-"}, validatedAt=${payload.validatedAt ? formatTime(payload.validatedAt) : "-"}, refreshing=${payload.refreshing}, payloadData=${payload.debug?.timings?.payloadData ?? "-"}ms, payload=${payload.debug?.timings?.payload ?? "-"}ms`);
    return payload;
  }
  refreshAfterPrepare(task) {
    if (this.pendingRefreshTask === task) return;
    this.pendingRefreshTask = task;
    task.finally(async () => {
      if (this.pendingRefreshTask === task) this.pendingRefreshTask = void 0;
      if (this.disposed || !this.ctx.scope.isActive) return;
      await this.ctx.get("console")?.refresh("market");
    });
  }
  applyIndex(result, endpoint) {
    if (!Array.isArray(result?.objects)) {
      throw new Error(`invalid market index from ${endpoint}`);
    }
    this.endpoint = endpoint;
    this.indexMode = "modern";
    const ignored = result.objects.filter((object) => object.ignored).length;
    this.scanner.objects = result.objects.filter((object) => !object.ignored);
    this.scanner.total = this.scanner.objects.length;
    this.scanner.version = result.version;
    this.log("debug", `market index applied: endpoint=${endpoint}, version=${result.version ?? "legacy"}, rawObjects=${result.objects.length}, ignored=${ignored}, visible=${this.scanner.total}`);
  }
  async applyDiskCache(serial) {
    const start = Date.now();
    try {
      this.log("debug", `read market disk cache: file=${this.cacheFile}, preferred=${this.config.endpoint}, candidates=${this.getEndpointCandidates().join(", ")}`);
      const readStart = Date.now();
      const content = await import_fs2.promises.readFile(this.cacheFile, "utf8");
      const readElapsed = Date.now() - readStart;
      const parseStart = Date.now();
      const store = normalizeCacheStore(JSON.parse(content));
      const parseElapsed = Date.now() - parseStart;
      this.cacheEntries = { ...this.cacheEntries, ...store.entries };
      this.log("debug", `market disk cache store parsed: bytes=${formatBytes(Buffer.byteLength(content))}, entries=${Object.keys(store.entries).length}, lastUsed=${store.lastUsed ?? "-"}, parse=${parseElapsed}ms, endpoints=${formatCacheEntries(store.entries)}`);
      const cache2 = this.pickDiskCache();
      if (!cache2) {
        this.log("debug", `skip market disk cache because no cached endpoint matches candidates: ${Object.keys(store.entries).join(", ")}`);
        return false;
      }
      if (this.isStale(serial)) return false;
      const applyStart = Date.now();
      this.applyIndex(cache2.result, cache2.endpoint);
      const applyElapsed = Date.now() - applyStart;
      const meta = {
        endpoint: cache2.endpoint,
        fetchedAt: cache2.fetchedAt,
        validatedAt: cache2.validatedAt,
        etag: cache2.etag,
        lastModified: cache2.lastModified,
        hash: cache2.hash,
        size: cache2.size,
        wireSize: cache2.wireSize,
        contentEncoding: cache2.contentEncoding
      };
      this.cacheMeta = this.conditionMeta = meta;
      this.cacheResult = cache2.result;
      this.cacheEntries[cache2.endpoint] = cache2;
      this.updateDebugInfo({
        source: "disk-cache",
        endpoint: cache2.endpoint,
        preferredEndpoint: this.getPreferredEndpoint(),
        fallbackReason: void 0,
        size: cache2.size,
        wireSize: cache2.wireSize,
        contentEncoding: cache2.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(cache2.hash),
        etag: cache2.etag,
        lastModified: cache2.lastModified,
        cachedAt: cache2.fetchedAt,
        validatedAt: cache2.validatedAt,
        timings: {
          cacheRead: readElapsed,
          cacheParse: parseElapsed,
          apply: applyElapsed,
          total: Date.now() - start
        }
      }, "initial");
      this.log("debug", `loaded market index from disk cache: ${this.scanner.total}/${cache2.result.objects.length} objects, endpoint=${cache2.endpoint}, cachedAt=${new Date(cache2.fetchedAt).toISOString()}, entries=${Object.keys(this.cacheEntries).length}, elapsed=${Date.now() - start}ms`);
      this.log("info", `market disk cache loaded: endpoint=${cache2.endpoint}, objects=${this.scanner.total}, cachedAt=${formatTime(cache2.fetchedAt)}, age=${formatAge(Date.now() - cache2.fetchedAt)}, entries=${Object.keys(this.cacheEntries).length}, elapsed=${Date.now() - start}ms, size=${formatBytes(cache2.size)}, wireSize=${formatBytes(cache2.wireSize)}, encoding=${cache2.contentEncoding ?? "identity"}`);
      return true;
    } catch (error) {
      if (error?.code !== "ENOENT") {
        this.log("warn", `failed to read market disk cache: ${formatError(error)}`);
      } else {
        this.log("debug", "market disk cache is empty");
      }
      return false;
    }
  }
  pickDiskCache() {
    const endpoints = this.getEndpointCandidates();
    const primary = this.cacheEntries[this.config.endpoint];
    this.log("debug", `pick market disk cache: preferred=${this.config.endpoint}, endpointCandidates=${endpoints.join(", ")}, cachedEntries=${formatCacheEntries(this.cacheEntries)}`);
    if (primary && Array.isArray(primary.result?.objects)) {
      this.log("debug", `pick market disk cache primary hit: endpoint=${primary.endpoint}, score=${this.getCacheScore(primary).toFixed(2)}, cachedAt=${formatTime(primary.fetchedAt)}, objects=${primary.result.objects.length}`);
      return primary;
    }
    const candidates = endpoints.filter((endpoint) => endpoint !== this.config.endpoint).map((endpoint) => this.cacheEntries[endpoint]).filter((cache2) => !!cache2 && Array.isArray(cache2.result?.objects));
    if (!candidates.length) return;
    const sorted = candidates.sort((a, b) => {
      const delta = this.getCacheScore(b) - this.getCacheScore(a);
      if (delta) return delta;
      return b.fetchedAt - a.fetchedAt;
    });
    this.log("debug", `pick market disk cache fallback hit: endpoint=${sorted[0].endpoint}, candidates=${sorted.map((cache2) => `${cache2.endpoint} score=${this.getCacheScore(cache2).toFixed(2)} age=${formatAge(Date.now() - cache2.fetchedAt)} objects=${cache2.result.objects.length}`).join(" | ")}`);
    return sorted[0];
  }
  getCacheScore(cache2) {
    const age = Number.isFinite(cache2.fetchedAt) ? Date.now() - cache2.fetchedAt : Infinity;
    let score = this.getRouteScore(cache2.endpoint);
    if (age <= import_koishi3.Time.hour * 12) score += 3;
    else if (age <= import_koishi3.Time.day * 3) score += 1;
    else score -= 1;
    if (cache2.endpoint === this.config.endpoint) score += 0.5;
    return score;
  }
  scheduleDiskCacheWrite(result, meta = this.conditionMeta) {
    if (!meta) return;
    clearTimeout(this.cacheWriteTimer);
    const entry = {
      ...meta,
      endpoint: meta.endpoint,
      fetchedAt: meta.fetchedAt,
      result
    };
    this.cacheEntries[entry.endpoint] = entry;
    const cache2 = {
      version: 2,
      entries: this.pruneCacheEntries(entry.endpoint),
      lastUsed: entry.endpoint
    };
    this.cacheEntries = cache2.entries;
    this.log("debug", `schedule market disk cache write: endpoint=${entry.endpoint}, objects=${result.objects.length}, entries=${Object.keys(cache2.entries).length}, file=${this.cacheFile}, hash=${shortHash(entry.hash) ?? "-"}, size=${formatBytes(entry.size)}, wireSize=${formatBytes(entry.wireSize)}, encoding=${entry.contentEncoding ?? "identity"}`);
    this.cacheWriteTimer = setTimeout(() => {
      this.cacheWriteTimer = void 0;
      void this.writeDiskCache(cache2);
    }, 0);
  }
  pruneCacheEntries(lastUsed) {
    const entries = Object.values(this.cacheEntries).filter((cache2) => !!cache2 && Array.isArray(cache2.result?.objects)).sort((a, b) => {
      if (a.endpoint === lastUsed) return -1;
      if (b.endpoint === lastUsed) return 1;
      if (a.endpoint === this.config.endpoint) return -1;
      if (b.endpoint === this.config.endpoint) return 1;
      const delta = this.getCacheScore(b) - this.getCacheScore(a);
      if (delta) return delta;
      return b.fetchedAt - a.fetchedAt;
    }).slice(0, MAX_CACHE_ENTRIES);
    this.log("debug", `prune market disk cache entries: lastUsed=${lastUsed}, kept=${entries.map((entry) => `${entry.endpoint} score=${this.getCacheScore(entry).toFixed(2)} age=${formatAge(Date.now() - entry.fetchedAt)} objects=${entry.result.objects.length}`).join(" | ")}`);
    return Object.fromEntries(entries.map((entry) => [entry.endpoint, entry]));
  }
  async writeDiskCache(cache2) {
    if (this.disposed || !this.ctx.scope.isActive) return;
    try {
      await import_fs2.promises.mkdir((0, import_path2.dirname)(this.cacheFile), { recursive: true });
      await import_fs2.promises.writeFile(this.cacheFile, JSON.stringify(cache2));
      const endpoints = Object.keys(cache2.entries);
      this.log("debug", `wrote market disk cache store: entries=${endpoints.length}, lastUsed=${cache2.lastUsed ?? "unknown"}, endpoints=${endpoints.join(", ")}`);
    } catch (error) {
      this.log("warn", `failed to write market disk cache: ${formatError(error)}`);
    }
  }
  refreshInBackground(serial, reason = "background") {
    if (this.backgroundTask && this.backgroundSerial === serial) {
      this.log("debug", `skip ${reason} market refresh because background task is already running, serial=${serial}`);
      return false;
    }
    if (this.backgroundTask) {
      this.log("debug", `replace stale background market refresh, oldSerial=${this.backgroundSerial ?? "unknown"}, serial=${serial}, reason=${reason}`);
    }
    this.log("debug", `${reason} market refresh started, serial=${serial}`);
    this.log("info", `${reason} market refresh started: serial=${serial}, endpoint=${this.config.endpoint}, autoRoute=${this.config.autoRoute !== false}`);
    const task = this.refreshIndexInBackground(serial).finally(() => {
      if (this.backgroundTask !== task) return;
      this.backgroundTask = void 0;
      this.backgroundSerial = void 0;
      void this.notifyMarketRefresh();
    });
    this.backgroundTask = task;
    this.backgroundSerial = serial;
    return true;
  }
  notifyMarketRefresh() {
    return this.ctx.get("console")?.refresh("market");
  }
  async refreshIndexInBackground(serial) {
    const start = Date.now();
    this.log("debug", `start background market refresh, serial=${serial}`);
    try {
      const result = await this.fetchIndex(serial);
      if (this.isStale(serial)) return;
      const applyStart = Date.now();
      this.applyIndex(result.result, result.endpoint);
      result.timings.apply = Date.now() - applyStart;
      result.timings.total = Date.now() - start;
      this.updateCacheState(result);
      if (result.source !== "disk-cache") this.scheduleDiskCacheWrite(result.result, this.conditionMeta);
      this._error = null;
      this.cacheMeta = void 0;
      this.payload = void 0;
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        objects: this.scanner.total,
        hash: shortHash(result.hash),
        etag: result.etag,
        lastModified: result.lastModified,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings
      }, "refresh");
      await this.ctx.get("console")?.refresh("market");
      this.log("debug", `background market refresh completed in ${Date.now() - start}ms, endpoint=${this.endpoint}, source=${result.source}, objects=${this.scanner.total}`);
      this.log("info", `background market refresh completed: ${formatSnapshot({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
        fallbackReason: result.fallbackReason,
        candidates: result.candidates,
        objects: this.scanner.total,
        size: result.size,
        wireSize: result.wireSize,
        contentEncoding: result.contentEncoding,
        cachedAt: result.cachedAt,
        validatedAt: result.validatedAt,
        timings: result.timings
      })}`);
    } catch (error) {
      if (this.isStale(serial)) return;
      this._error = error;
      await this.ctx.get("console")?.refresh("market");
      this.log("warn", `background market refresh failed in ${Date.now() - start}ms: ${formatError(error)}`);
    }
  }
  updateDebugInfo(info, phase) {
    const next = {
      ...this.debugInfo,
      ...info,
      fallbackReason: info.fallbackReason,
      timings: {
        ...this.debugInfo?.timings,
        ...info.timings
      },
      routeScores: this.getRouteScores()
    };
    if (phase) next[phase] = { ...info };
    this.debugInfo = next;
    this.log("debug", `market performance: source=${this.debugInfo.source ?? "unknown"}, endpoint=${this.debugInfo.endpoint ?? "unknown"}, preferred=${this.debugInfo.preferredEndpoint ?? "unknown"}, objects=${this.debugInfo.objects ?? 0}, size=${this.debugInfo.size ?? 0}, wireSize=${this.debugInfo.wireSize ?? "unknown"}, encoding=${this.debugInfo.contentEncoding ?? "identity"}, timings=${formatTimings(this.debugInfo.timings)}`);
    this.log("debug", `market route scores: ${formatRouteScores(this.debugInfo.routeScores)}`);
  }
  getDebugInfo(timings) {
    if (this.config.logLevel !== "debug") return;
    if (!timings) return this.debugInfo;
    return {
      ...this.debugInfo,
      timings: {
        ...this.debugInfo?.timings,
        ...timings
      }
    };
  }
  isStale(serial = this.serial) {
    return this.disposed || serial !== this.serial || !this.ctx.scope.isActive;
  }
  log(level, message) {
    if (this.disposed || !this.ctx.scope.isActive) return;
    if (logLevels.indexOf(this.config.logLevel ?? "warn") < logLevels.indexOf(level)) return;
    const logger3 = this.ctx.logger("market");
    if (level === "debug") {
      logger3.info(`[debug] ${message}`);
    } else {
      logger3[level](message);
    }
  }
};
((MarketProvider3) => {
  MarketProvider3.Config = import_koishi3.Schema.object({
    endpoint: import_koishi3.Schema.string().role("link").default(DEFAULT_ENDPOINT),
    timeout: import_koishi3.Schema.number().role("time").default(import_koishi3.Time.second * 30),
    proxyAgent: import_koishi3.Schema.string().role("link"),
    autoRoute: import_koishi3.Schema.boolean().default(true),
    logLevel: import_koishi3.Schema.union(logLevels.map((level) => import_koishi3.Schema.const(level))).default("warn")
  });
})(MarketProvider2 || (MarketProvider2 = {}));
function formatError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function formatStack(error) {
  if (error instanceof Error) return error.stack || error.message;
  return String(error);
}
function shortHash(hash) {
  return hash?.slice(0, 12);
}
function formatTime(value) {
  if (!value) return "-";
  return new Date(value).toISOString();
}
function formatAge(age) {
  if (age == null || !Number.isFinite(age)) return "-";
  if (age < import_koishi3.Time.second) return `${Math.max(0, Math.round(age))}ms`;
  if (age < import_koishi3.Time.minute) return `${Math.round(age / import_koishi3.Time.second)}s`;
  if (age < import_koishi3.Time.hour) return `${Math.round(age / import_koishi3.Time.minute)}m`;
  if (age < import_koishi3.Time.day) return `${Math.round(age / import_koishi3.Time.hour)}h`;
  return `${Math.round(age / import_koishi3.Time.day)}d`;
}
function formatBytes(value) {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}KB`;
  return `${Math.round(value)}B`;
}
function parseContentLength(value) {
  if (!value) return;
  const size = Number(value);
  return Number.isFinite(size) && size >= 0 ? size : void 0;
}
function normalizeWireSize(wireSize, decodedSize) {
  if (!wireSize && decodedSize > 0) return;
  return wireSize;
}
function formatSnapshot(snapshot = {}) {
  return [
    `source=${snapshot.source ?? "unknown"}`,
    `endpoint=${snapshot.endpoint ?? "unknown"}`,
    `preferred=${snapshot.preferredEndpoint ?? "-"}`,
    `fallback=${snapshot.fallbackReason ?? "-"}`,
    `candidates=${snapshot.candidates ?? "-"}`,
    `objects=${snapshot.objects ?? "-"}`,
    `size=${formatBytes(snapshot.size)}`,
    `wireSize=${formatBytes(snapshot.wireSize)}`,
    `encoding=${snapshot.contentEncoding ?? "identity"}`,
    `cachedAt=${formatTime(snapshot.cachedAt)}`,
    `validatedAt=${formatTime(snapshot.validatedAt)}`,
    `timings=${formatTimings(snapshot.timings) || "-"}`
  ].join(", ");
}
function formatRouteScores(routes) {
  if (!routes?.length) return "-";
  return routes.map((route) => [
    route.endpoint,
    `score=${route.score}`,
    `ok=${route.successes ?? 0}`,
    `fail=${route.failures ?? 0}`,
    `avg=${route.averageElapsed == null ? "-" : Math.round(route.averageElapsed) + "ms"}`,
    `cache=${route.cached ? "yes" : "no"}`,
    `cachedAt=${formatTime(route.cachedAt)}`,
    `encoding=${route.contentEncoding ?? "identity"}`
  ].join(" ")).join(" | ");
}
function formatCacheEntries(entries) {
  const values = Object.values(entries).filter((entry) => !!entry);
  if (!values.length) return "-";
  return values.map((entry) => [
    entry.endpoint,
    `objects=${entry.result?.objects?.length ?? "-"}`,
    `cachedAt=${formatTime(entry.fetchedAt)}`,
    `age=${formatAge(Date.now() - entry.fetchedAt)}`,
    `hash=${shortHash(entry.hash) ?? "-"}`,
    `size=${formatBytes(entry.size)}`,
    `wireSize=${formatBytes(entry.wireSize)}`,
    `encoding=${entry.contentEncoding ?? "identity"}`
  ].join(" ")).join(" | ");
}
function normalizeCacheStore(value) {
  if (value?.version === 2 && value.entries && typeof value.entries === "object") {
    const entries = {};
    for (const endpoint in value.entries) {
      const entry2 = normalizeCacheEntry(value.entries[endpoint]);
      if (entry2) entries[entry2.endpoint] = entry2;
    }
    return { version: 2, entries, lastUsed: value.lastUsed };
  }
  const entry = normalizeCacheEntry(value);
  if (entry) {
    return {
      version: 2,
      entries: { [entry.endpoint]: entry },
      lastUsed: entry.endpoint
    };
  }
  return { version: 2, entries: {} };
}
function normalizeCacheEntry(value) {
  const fetchedAt = Number(value?.fetchedAt);
  if (typeof value?.endpoint !== "string") return;
  if (!Number.isFinite(fetchedAt)) return;
  if (!Array.isArray(value.result?.objects)) return;
  return { ...value, fetchedAt };
}
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
async function waitFor(task, timeout) {
  let timer;
  try {
    return await Promise.race([
      task.then(() => true),
      new Promise((resolve4) => {
        timer = setTimeout(() => resolve4(false), timeout);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function formatTimings(timings = {}) {
  return Object.entries(timings).map(([key, value]) => `${key}=${Math.round(value)}ms`).join(", ");
}
var market_default = MarketProvider2;

// src/node/chatluna.ts
var import_tools = require("@langchain/core/tools");
var import_koishi4 = require("koishi");
var import_zod = __toESM(require("zod"));
var TOOL_NAME = "koishi_plugin_market_search";
var CACHE_TTL = import_koishi4.Time.minute * 10;
var DAY = import_koishi4.Time.day;
var intentValues = ["search", "recommend", "recent", "popular", "risk", "compare"];
var statusValues = ["verified", "insecure", "preview", "portable", "deprecated"];
var sortValues = ["relevance", "rating", "downloads", "created", "updated"];
var orderValues = ["asc", "desc"];
var cache = {};
var pending = {};
var searchSchema = import_zod.default.object({
  intent: import_zod.default.enum(intentValues).optional().describe("Search intent. Use recommend for plugin recommendations, recent for newly created plugins, popular for high-download plugins, risk for insecure/deprecated plugins, and compare for comparing named plugins."),
  query: import_zod.default.string().optional().describe("Keyword search. Matches plugin package name, short name, description, and keywords."),
  requirements: import_zod.default.string().optional().describe('Natural language user requirements, for example "\u627E\u4E00\u4E2A\u597D\u7528\u7684 onebot \u9002\u914D\u5668" or "recommend a stable AI plugin".'),
  names: stringList("Plugin package names or short names for exact lookup or comparison. Accepts an array, a single string, or comma-separated names."),
  category: stringList("Category filter, for example adapter, ai, tool, game, webui. Accepts an array, a single string, or comma-separated categories."),
  status: statusList(),
  createdAfter: import_zod.default.string().optional().describe("Only include plugins created on or after this date. Supports YYYY-MM-DD or ISO date."),
  createdBefore: import_zod.default.string().optional().describe("Only include plugins created on or before this date. Supports YYYY-MM-DD or ISO date."),
  updatedAfter: import_zod.default.string().optional().describe("Only include plugins updated on or after this date. Supports YYYY-MM-DD or ISO date."),
  updatedBefore: import_zod.default.string().optional().describe("Only include plugins updated on or before this date. Supports YYYY-MM-DD or ISO date."),
  createdWithinDays: import_zod.default.number().int().positive().optional().describe("Only include plugins created within the last N days."),
  updatedWithinDays: import_zod.default.number().int().positive().optional().describe("Only include plugins updated within the last N days."),
  sort: import_zod.default.enum(sortValues).optional().describe("Sort mode. If omitted, the tool chooses a good default from intent."),
  order: import_zod.default.enum(orderValues).optional().describe("Sort order. Defaults to desc."),
  limit: import_zod.default.number().int().min(1).max(50).optional().describe("Maximum number of results to show, from 1 to 50. Defaults to 10."),
  includeHidden: import_zod.default.boolean().optional().describe("Include ignored or hidden plugins. Defaults to false."),
  includeDeprecated: import_zod.default.boolean().optional().describe("Include deprecated plugins. Defaults to false unless status includes deprecated or intent is risk.")
});
var description = `Search the Koishi plugin market / \u67E5\u8BE2 Koishi \u63D2\u4EF6\u5E02\u573A\u3002

Use this read-only tool whenever the user wants to find, recommend, compare, inspect, or rank Koishi plugins. \u9002\u7528\u573A\u666F\u5305\u62EC\uFF1A\u63D2\u4EF6\u641C\u7D22\u3001\u63D2\u4EF6\u63A8\u8350\u3001\u63D2\u4EF6\u5BF9\u6BD4\u3001\u6700\u8FD1\u65B0\u589E\u3001\u6700\u8FD1\u66F4\u65B0\u3001\u70ED\u95E8\u63D2\u4EF6\u3001\u8BA4\u8BC1\u63D2\u4EF6\u3001\u98CE\u9669/\u4E0D\u5B89\u5168/\u5E9F\u5F03\u72B6\u6001\u67E5\u8BE2\u3002

Prefer calling this tool before answering questions like "\u6709\u6CA1\u6709 onebot \u63D2\u4EF6", "\u63A8\u8350\u4E00\u4E2A AI \u63D2\u4EF6", "\u6700\u8FD1\u65B0\u589E\u4E86\u4EC0\u4E48\u63D2\u4EF6", "\u54EA\u4E9B\u63D2\u4EF6\u6709\u98CE\u9669", "compare these Koishi plugins", or "find a stable adapter".

Return value is JSON. The tool only reads the market registry index. It never installs, uninstalls, updates, edits configuration, or modifies package.json.`;
function applyChatLunaTool(ctx, config = {}) {
  if (!config.chatlunaTool) return;
  const logger3 = ctx.logger("market");
  logger3.debug("ChatLuna market search tool is enabled; waiting for chatluna service");
  ctx.inject(["chatluna"], (ctx2) => {
    const marketTool = createMarketTool(ctx2, config);
    ctx2.effect(() => {
      const chatluna = ctx2.get("chatluna");
      const registerTool = chatluna?.platform?.registerTool;
      if (!registerTool) {
        ctx2.logger("market").warn("ChatLuna platform service is missing, skip market search tool");
        return () => {
        };
      }
      try {
        const dispose = registerTool.call(chatluna.platform, TOOL_NAME, {
          description: marketTool.description,
          selector: () => true,
          meta: {
            source: "extension",
            group: "market",
            tags: ["market", "koishi", "plugin", "search", "recommend"],
            defaultAvailability: {
              enabled: true,
              main: true,
              chatluna: true,
              characterScope: "all"
            }
          },
          createTool: () => marketTool
        });
        ctx2.logger("market").info(`ChatLuna market search tool registered: ${TOOL_NAME}`);
        return () => {
          ctx2.logger("market").debug(`ChatLuna market search tool disposed: ${TOOL_NAME}`);
          dispose?.();
        };
      } catch (error) {
        ctx2.logger("market").warn(`Failed to register ChatLuna market search tool: ${formatError2(error)}`);
        return () => {
        };
      }
    });
  });
}
function createMarketTool(ctx, config) {
  return (0, import_tools.tool)(async (input) => {
    const normalized = normalizeInput(input ?? {});
    try {
      const result = await loadIndex(ctx, config);
      return formatSearchResult(result, normalized);
    } catch (error) {
      return formatLoadError(resolveEndpoint(config), normalized, error);
    }
  }, {
    name: TOOL_NAME,
    description,
    schema: searchSchema
  });
}
async function loadIndex(ctx, config) {
  const endpoint = resolveEndpoint(config);
  const now = Date.now();
  const cached = cache[endpoint];
  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return { index: cached, stale: false };
  }
  try {
    pending[endpoint] ||= fetchIndex(ctx, config);
    const index = await pending[endpoint];
    cache[endpoint] = index;
    return { index, stale: false };
  } catch (error) {
    if (cached) {
      return { index: cached, stale: true, error: formatError2(error) };
    }
    throw error;
  } finally {
    delete pending[endpoint];
  }
}
async function fetchIndex(ctx, config) {
  const endpoint = resolveEndpoint(config);
  const http = ctx.http.extend({
    endpoint,
    timeout: config.search?.timeout ?? import_koishi4.Time.second * 30,
    proxyAgent: config.search?.proxyAgent
  });
  const result = await http.get("");
  return {
    endpoint,
    fetchedAt: Date.now(),
    version: result.version,
    objects: result.objects
  };
}
function formatSearchResult(result, input) {
  const { index } = result;
  const filtered = filterObjects(index.objects, input);
  const sorted = sortObjects(filtered, input);
  const shown = sorted.slice(0, input.limit);
  const items = shown.map((item, index2) => formatItem(item, index2 + 1, input));
  const payload = {
    tool: TOOL_NAME,
    registry: index.endpoint,
    fetchedAt: formatDateTime(index.fetchedAt),
    stale: result.stale,
    error: result.error ?? null,
    intent: input.intent,
    filters: formatFilters(input),
    total: index.objects.length,
    matched: filtered.length,
    returned: items.length,
    summary: buildSummary(result, input, filtered, items),
    results: items,
    nextQueries: buildNextQueries(result, input, filtered.length, items.length)
  };
  return stringifyPayload(payload);
}
function filterObjects(objects, input) {
  const terms = getFilterTerms(input);
  const categories = new Set(input.category.map(normalizeText).filter(Boolean));
  const statuses = input.status;
  const names = new Set(input.names.map(normalizeNameTarget).filter(Boolean));
  const createdAfter = input.createdWithinDays ? Date.now() - input.createdWithinDays * DAY : parseDate(input.createdAfter, false);
  const createdBefore = parseDate(input.createdBefore, true);
  const updatedAfter = input.updatedWithinDays ? Date.now() - input.updatedWithinDays * DAY : parseDate(input.updatedAfter, false);
  const updatedBefore = parseDate(input.updatedBefore, true);
  return objects.filter((item) => {
    if (!input.includeHidden && (item.ignored || item.manifest?.hidden)) return false;
    if (!input.includeDeprecated && isDeprecated(item)) return false;
    if (names.size && !matchesName(item, names)) return false;
    if (categories.size && !categories.has(resolveCategory(item.category))) return false;
    if (statuses.length && !statuses.some((status) => hasStatus(item, status))) return false;
    if (terms.length && !terms.every((term) => relevancePart(item, term) > 0)) return false;
    const createdAt = parseItemDate(item.createdAt);
    const updatedAt = parseItemDate(item.updatedAt);
    if (createdAfter && (!createdAt || createdAt < createdAfter)) return false;
    if (createdBefore && (!createdAt || createdAt > createdBefore)) return false;
    if (updatedAfter && (!updatedAt || updatedAt < updatedAfter)) return false;
    if (updatedBefore && (!updatedAt || updatedAt > updatedBefore)) return false;
    return true;
  });
}
function sortObjects(objects, input) {
  const terms = getQueryTerms(input);
  const order = input.order === "asc" ? 1 : -1;
  return objects.slice().sort((a, b) => {
    const delta = compareObject(a, b, input, terms);
    if (delta) return delta * order;
    return a.package.name.localeCompare(b.package.name);
  });
}
function compareObject(a, b, input, terms) {
  if (input.intent === "risk" && input.sort === "relevance") {
    return riskScore(a) - riskScore(b);
  }
  if (input.intent === "recommend" && input.sort === "relevance") {
    return recommendationScore(a, terms) - recommendationScore(b, terms);
  }
  if (input.sort === "rating") return (a.rating ?? 0) - (b.rating ?? 0);
  if (input.sort === "downloads") return (a.downloads?.lastMonth ?? 0) - (b.downloads?.lastMonth ?? 0);
  if (input.sort === "created") return (parseItemDate(a.createdAt) ?? 0) - (parseItemDate(b.createdAt) ?? 0);
  if (input.sort === "updated") return (parseItemDate(a.updatedAt) ?? 0) - (parseItemDate(b.updatedAt) ?? 0);
  return relevanceScore(a, terms) - relevanceScore(b, terms);
}
function normalizeInput(input) {
  const status = input.status ?? [];
  const intent = inferIntent(input, status);
  const sort = input.sort ?? defaultSort(intent);
  const includeDeprecated = !!input.includeDeprecated || intent === "risk" || status.includes("deprecated");
  return {
    intent,
    query: cleanText(input.query),
    requirements: cleanText(input.requirements),
    names: input.names ?? [],
    category: input.category?.map(resolveCategory).filter(Boolean) ?? [],
    status: intent === "risk" && !status.length ? ["insecure", "deprecated"] : status,
    createdAfter: input.createdAfter,
    createdBefore: input.createdBefore,
    updatedAfter: input.updatedAfter,
    updatedBefore: input.updatedBefore,
    createdWithinDays: input.createdWithinDays,
    updatedWithinDays: input.updatedWithinDays,
    sort,
    order: input.order ?? "desc",
    limit: clamp2(input.limit ?? 10, 1, 50),
    includeHidden: !!input.includeHidden,
    includeDeprecated
  };
}
function inferIntent(input, status) {
  if (input.intent) return input.intent;
  if (input.names?.length) return "compare";
  if (status.some((status2) => status2 === "insecure" || status2 === "deprecated")) return "risk";
  if (input.createdWithinDays || input.createdAfter || input.createdBefore) return "recent";
  if (input.sort === "downloads") return "popular";
  if (input.requirements) return "recommend";
  return "search";
}
function defaultSort(intent) {
  if (intent === "recent") return "created";
  if (intent === "popular") return "downloads";
  return "relevance";
}
function recommendationScore(item, terms) {
  let score = relevanceScore(item, terms);
  score += (item.rating ?? 0) * 4;
  score += Math.log10((item.downloads?.lastMonth ?? 0) + 1) * 8;
  score += recencyScore(item.updatedAt);
  if (item.verified) score += 12;
  if (item.insecure || item.manifest?.insecure) score -= 20;
  if (isDeprecated(item)) score -= 30;
  return score;
}
function relevanceScore(item, terms) {
  if (!terms.length) return item.rating ?? 0;
  return terms.reduce((sum, term) => sum + relevancePart(item, term), 0) + (item.rating ?? 0);
}
function relevancePart(item, term) {
  const name2 = normalizeText(item.package.name);
  const shortname = normalizeText(item.shortname);
  const normalizedName = normalizePackageName(name2);
  const description2 = normalizeText(getDescription(item));
  const keywords = item.package.keywords?.map(normalizeText) ?? [];
  if (shortname === term || normalizedName === term) return 100;
  if (name2 === term) return 95;
  if (shortname.startsWith(term) || normalizedName.startsWith(term)) return 75;
  if (shortname.includes(term) || normalizedName.includes(term)) return 55;
  if (name2.includes(term)) return 45;
  if (keywords.some((keyword) => keyword === term)) return 35;
  if (keywords.some((keyword) => keyword.includes(term))) return 20;
  if (description2.includes(term)) return 10;
  return 0;
}
function riskScore(item) {
  let score = 0;
  if (item.insecure || item.manifest?.insecure) score += 100;
  if (isDeprecated(item)) score += 80;
  if (item.manifest?.preview) score += 20;
  return score;
}
function recencyScore(value) {
  const timestamp = parseItemDate(value);
  if (!timestamp) return 0;
  const days = Math.max(0, (Date.now() - timestamp) / DAY);
  return Math.max(0, 12 - Math.log2(days + 1) * 2);
}
function formatItem(item, rank, input) {
  const pkg = item.package;
  return {
    rank,
    name: pkg.name,
    shortname: item.shortname || normalizePackageName(pkg.name),
    version: pkg.version,
    category: resolveCategory(item.category),
    rating: round(item.rating ?? 0),
    downloadsLastMonth: Math.round(pkgDownloads(item)),
    createdAt: formatDate(item.createdAt),
    updatedAt: formatDate(item.updatedAt),
    statusTags: getStatusTags(item),
    description: truncate(getDescription(item), 220),
    links: getLinks(item),
    reasons: getReasons(item, input)
  };
}
function getReasons(item, input) {
  const reasons = [];
  const terms = getQueryTerms(input);
  if (input.names.length && matchesName(item, new Set(input.names.map(normalizeNameTarget)))) reasons.push("matched requested plugin name");
  if (terms.some((term) => relevancePart(item, term) >= 55)) reasons.push("strong keyword/name match");
  else if (terms.some((term) => relevancePart(item, term) > 0)) reasons.push("matched description or keywords");
  if (input.category.includes(resolveCategory(item.category))) reasons.push(`matched category: ${resolveCategory(item.category)}`);
  if (item.verified) reasons.push("verified plugin");
  if (pkgDownloads(item) >= 1e3) reasons.push("high monthly downloads");
  if (recencyScore(item.updatedAt) >= 8) reasons.push("recently updated");
  if (item.insecure || item.manifest?.insecure) reasons.push("marked insecure");
  if (isDeprecated(item)) reasons.push("marked deprecated");
  if (!reasons.length) reasons.push("included by current filters");
  return reasons;
}
function buildSummary(result, input, filtered, items) {
  const warnings = [];
  if (result.stale) warnings.push(`using stale cache: ${result.error}`);
  const risk = countRisk(filtered);
  if (risk.insecure) warnings.push(`${risk.insecure} matched plugin(s) are marked insecure`);
  if (risk.deprecated) warnings.push(`${risk.deprecated} matched plugin(s) are deprecated`);
  const top = items[0]?.name;
  const text = top ? `${input.intent} matched ${filtered.length} plugin(s); top result is ${top}.` : `${input.intent} matched no plugins. Relax keyword, category, status, or date filters.`;
  return { text, warnings, risk };
}
function buildNextQueries(result, input, matched, returned) {
  const queries = [];
  if (result.stale) queries.push("Retry after checking market.search.endpoint or network connectivity.");
  if (!matched) {
    queries.push("Try a shorter keyword or remove category/status filters.");
    if (input.intent !== "recommend") queries.push("Use intent=recommend with requirements for broader matching.");
  } else if (matched > returned) {
    queries.push("Increase limit or add category/status filters to narrow the result set.");
  }
  if (input.intent !== "popular") queries.push("Use intent=popular to see high-download alternatives.");
  if (input.intent !== "risk") queries.push("Use intent=risk to inspect insecure or deprecated matches.");
  return queries;
}
function countRisk(items) {
  return items.reduce((result, item) => {
    if (item.insecure || item.manifest?.insecure) result.insecure += 1;
    if (isDeprecated(item)) result.deprecated += 1;
    if (item.manifest?.preview) result.preview += 1;
    return result;
  }, { insecure: 0, deprecated: 0, preview: 0 });
}
function getLinks(item) {
  const name2 = item.package.name;
  const links = item.package.links ?? {};
  return {
    npm: cleanLink(links.npm) || `https://www.npmjs.com/package/${name2}`,
    homepage: cleanLink(links.homepage),
    repository: cleanLink(links.repository)
  };
}
function getStatusTags(item) {
  const tags = [];
  if (item.verified) tags.push("verified");
  if (item.insecure || item.manifest?.insecure) tags.push("insecure");
  if (item.manifest?.preview) tags.push("preview");
  if (item.portable) tags.push("portable");
  if (isDeprecated(item)) tags.push("deprecated");
  if (item.workspace) tags.push("workspace");
  if (item.ignored) tags.push("ignored");
  if (item.manifest?.hidden) tags.push("hidden");
  return tags;
}
function hasStatus(item, status) {
  if (status === "verified") return !!item.verified;
  if (status === "insecure") return !!item.insecure || !!item.manifest?.insecure;
  if (status === "preview") return !!item.manifest?.preview;
  if (status === "portable") return !!item.portable;
  if (status === "deprecated") return isDeprecated(item);
}
function isDeprecated(item) {
  return !!(item.deprecated || item.package.deprecated);
}
function matchesName(item, names) {
  const candidates = [
    item.package.name,
    item.shortname,
    normalizePackageName(item.package.name)
  ].map(normalizeNameTarget);
  return candidates.some((name2) => names.has(name2));
}
function getDescription(item) {
  const description2 = item.manifest?.description;
  if (typeof description2 === "string") return cleanText(description2);
  if (description2) {
    return cleanText(description2["zh-CN"] || description2["en-US"] || String(Object.values(description2)[0] ?? ""));
  }
  return cleanText(item.package.description);
}
function formatFilters(input) {
  return {
    query: input.query || null,
    requirements: input.requirements || null,
    names: input.names,
    category: input.category,
    status: input.status,
    createdAfter: input.createdAfter ?? null,
    createdBefore: input.createdBefore ?? null,
    updatedAfter: input.updatedAfter ?? null,
    updatedBefore: input.updatedBefore ?? null,
    createdWithinDays: input.createdWithinDays ?? null,
    updatedWithinDays: input.updatedWithinDays ?? null,
    sort: input.sort,
    order: input.order,
    limit: input.limit,
    includeHidden: input.includeHidden,
    includeDeprecated: input.includeDeprecated
  };
}
function formatLoadError(endpoint, input, error) {
  const payload = {
    tool: TOOL_NAME,
    registry: endpoint,
    fetchedAt: null,
    stale: false,
    error: formatError2(error),
    intent: input.intent,
    filters: formatFilters(input),
    total: 0,
    matched: 0,
    returned: 0,
    summary: {
      text: "Failed to load the Koishi plugin market index.",
      warnings: [formatError2(error)],
      risk: { insecure: 0, deprecated: 0, preview: 0 }
    },
    results: [],
    nextQueries: [
      "Check market.search.endpoint, market.search.timeout, proxyAgent, or current network connectivity.",
      "If a previous call had stale=true, use its cached results until the registry is reachable."
    ]
  };
  return stringifyPayload(payload);
}
function parseDate(value, endOfDay = false) {
  if (!value) return 0;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
    return Date.parse(trimmed + suffix) || 0;
  }
  return Date.parse(trimmed) || 0;
}
function parseItemDate(value) {
  if (!value) return 0;
  return Date.parse(value) || 0;
}
function resolveEndpoint(config) {
  return config.search?.endpoint || DEFAULT_ENDPOINT;
}
function resolveCategory(category) {
  return normalizeText(category) || "other";
}
function normalizePackageName(name2) {
  return name2.replace(/^(koishi-|@koishijs\/)plugin-/, "");
}
function normalizeNameTarget(name2) {
  return normalizePackageName(normalizeText(name2));
}
function normalizeText(value) {
  return (value ?? "").toLowerCase().trim();
}
function getQueryTerms(input) {
  return getTextTerms([input.query, input.requirements].filter(Boolean).join(" "));
}
function getFilterTerms(input) {
  return getTextTerms(input.query);
}
function getTextTerms(value) {
  const text = normalizeText(value);
  const words = text.split(/\s+/).filter(Boolean);
  const tokens = text.match(/[a-z0-9@/_-]+/g) ?? [];
  return unique([...words, ...tokens].map(normalizeNameTarget).filter(Boolean));
}
function cleanText(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
function cleanLink(value) {
  if (!value) return void 0;
  return value.replace(/^git\+/, "").replace(/\.git$/, "");
}
function truncate(value, length) {
  if (value.length <= length) return value;
  return value.slice(0, length - 1).trimEnd() + "...";
}
function formatDateTime(value) {
  return new Date(value).toISOString();
}
function formatDate(value) {
  const timestamp = parseItemDate(value);
  if (!timestamp) return null;
  return new Date(timestamp).toISOString().slice(0, 10);
}
function formatError2(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function pkgDownloads(item) {
  return item.downloads?.lastMonth ?? 0;
}
function round(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}
function clamp2(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
function unique(values) {
  return Array.from(new Set(values));
}
function stringifyPayload(payload) {
  return JSON.stringify(payload, null, 2);
}
function stringList(description2) {
  return import_zod.default.preprocess((value) => normalizeList(value), import_zod.default.array(import_zod.default.string()).optional()).describe(description2);
}
function statusList() {
  return import_zod.default.preprocess((value) => {
    return normalizeList(value)?.map(normalizeStatus);
  }, import_zod.default.array(import_zod.default.enum(statusValues)).optional()).describe("Status filter: verified, insecure, preview, portable, deprecated. Accepts an array, a single string, or comma-separated status values.");
}
function normalizeList(value) {
  if (value == null || value === "") return void 0;
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => {
    if (typeof item !== "string") return item;
    return item.split(/[,，;；、\n]/g).map((part) => part.trim()).filter(Boolean);
  });
}
function normalizeStatus(value) {
  if (typeof value !== "string") return value;
  const status = normalizeText(value);
  const aliases = {
    safe: "verified",
    secure: "verified",
    certified: "verified",
    official: "verified",
    verified: "verified",
    \u8BA4\u8BC1: "verified",
    \u5DF2\u8BA4\u8BC1: "verified",
    unsafe: "insecure",
    risk: "insecure",
    risky: "insecure",
    insecure: "insecure",
    \u4E0D\u5B89\u5168: "insecure",
    \u98CE\u9669: "insecure",
    preview: "preview",
    beta: "preview",
    alpha: "preview",
    \u9884\u89C8: "preview",
    portable: "portable",
    \u53EF\u79FB\u690D: "portable",
    deprecated: "deprecated",
    abandoned: "deprecated",
    \u5E9F\u5F03: "deprecated",
    \u5DF2\u5E9F\u5F03: "deprecated"
  };
  return aliases[status] ?? status;
}

// src/node/index.ts
var name = "market";
var inject = ["http"];
var usage = `
\u5982\u679C\u63D2\u4EF6\u5E02\u573A\u9875\u9762\u63D0\u793A\u300C\u65E0\u6CD5\u8FDE\u63A5\u5230\u63D2\u4EF6\u5E02\u573A\u300D\uFF0C\u5219\u53EF\u4EE5\u9009\u62E9\u4E00\u4E2A Koishi \u793E\u533A\u63D0\u4F9B\u7684\u955C\u50CF\u5730\u5740\uFF0C\u586B\u5165\u4E0B\u65B9\u5BF9\u5E94\u7684\u914D\u7F6E\u9879\u4E2D\u3002

## \u63D2\u4EF6\u5E02\u573A\uFF08\u586B\u5165 search.endpoint\uFF09

- Koishi\uFF08\u5168\u7403\uFF09\uFF1Ahttps://registry.koishi.chat/index.json
- [Gitee \u805A\u5408](https://k.ilharp.cc/4000)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://gitee.com/shangxueink/koishi-registry-aggregator/raw/gh-pages/market.json
- [t4wefan](https://k.ilharp.cc/2611)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://registry.koishi.t4wefan.pub/index.json
- [Lipraty](https://k.ilharp.cc/3530)\uFF08\u5927\u9646\uFF09\uFF1Ahttps://koi.nyan.zone/registry/index.json
- [itzdrli](https://k.ilharp.cc/9975)\uFF08\u5168\u7403\uFF09\uFF1Ahttps://kp.itzdrli.cc
- itzdrli \u5907\u7528\uFF1Ahttps://koishi.itzdrli.cc

\u8981\u6D4F\u89C8\u66F4\u591A\u793E\u533A\u955C\u50CF\uFF0C\u8BF7\u8BBF\u95EE [Koishi \u8BBA\u575B\u4E0A\u7684\u955C\u50CF\u4E00\u89C8](https://k.ilharp.cc/4000)\u3002`;
var Config = import_koishi5.Schema.object({
  registry: installer_default.Config,
  search: market_default.Config,
  chatlunaTool: import_koishi5.Schema.boolean().default(false).description("Enable ChatLuna plugin market query tool.")
}).i18n({
  "zh-CN": require_schema_zh_CN()
});
function getPluginShortname(name2) {
  return name2.replace(/(koishi-|^@koishijs\/)plugin-/, "");
}
function hasPluginConfig(plugins, shortname) {
  for (const key in plugins || {}) {
    if (key.startsWith("$")) continue;
    const [prefix] = key.split(":", 1);
    const name2 = prefix.replace(/^~/, "");
    if (name2 === shortname) return true;
    if (name2 === "group" && hasPluginConfig(plugins[key], shortname)) return true;
  }
  return false;
}
function createDisabledPluginConfig(ctx, shortname) {
  const plugins = ctx.loader.config?.plugins;
  if (!plugins || !ctx.loader.writable) return;
  let ident;
  let key;
  do {
    ident = Math.random().toString(36).slice(2, 8);
    key = `~${shortname}:${ident}`;
  } while (key in plugins);
  plugins[key] = {};
  return key;
}
async function requestPluginRuntime(ctx, name2) {
  await ctx.get("console")?.listeners["config/request-runtime"]?.callback.call(null, name2);
}
async function ensurePluginConfig(ctx, name2) {
  if (!import_registry3.default.isPlugin(name2)) return false;
  await requestPluginRuntime(ctx, name2).catch((error) => ctx.logger("market").warn(error));
  const shortname = getPluginShortname(name2);
  if (hasPluginConfig(ctx.loader.config?.plugins, shortname)) return false;
  const key = createDisabledPluginConfig(ctx, shortname);
  if (!key) return false;
  await ctx.loader.writeConfig();
  ctx.logger("market").info("created disabled default config entry %c for %c", key, name2);
  return true;
}
async function ensurePluginConfigs(ctx, names) {
  let changed = false;
  for (const name2 of names) {
    if (await ensurePluginConfig(ctx, name2)) changed = true;
  }
  if (!changed) return false;
  await Promise.all([
    ctx.get("console")?.refresh("config"),
    ctx.get("console")?.refresh("packages")
  ]);
  return true;
}
async function ensureInstalledPluginConfigs(ctx) {
  const manifest = loadManifest(ctx.baseDir);
  const names = Object.keys(manifest.dependencies ?? {}).filter((name2) => import_registry3.default.isPlugin(name2));
  return ensurePluginConfigs(ctx, names);
}
function apply(ctx, config = {}) {
  if (!ctx.loader?.writable) {
    return ctx.logger("app").warn("koishi-plugin-market-next is only available for json/yaml config file");
  }
  applyChatLunaTool(ctx, config);
  ctx.plugin(installer_default, config.registry ?? {});
  ctx.inject(["installer"], (ctx2) => {
    ctx2.i18n.define("zh-CN", require_message_zh_CN());
    ctx2.command("plugin.install <name>", { authority: 4 }).alias(".i").action(async ({ session }, name2) => {
      if (!name2) return session.text(".expect-name");
      const names = ctx2.installer.resolveName(name2);
      const deps = await ctx2.installer.getDeps();
      name2 = names.find((name3) => deps[name3]);
      if (name2) return session.text(".already-installed");
      const result = await ctx2.installer.findVersion(names);
      if (!result) return session.text(".not-found");
      ctx2.loader.envData.message = {
        ...(0, import_koishi5.pick)(session, ["sid", "channelId", "guildId", "isDirect"]),
        content: session.text(".success")
      };
      await ctx2.installer.install(result, void 0, () => ensurePluginConfigs(ctx2, Object.keys(result)));
      await ensurePluginConfigs(ctx2, Object.keys(result));
      ctx2.loader.envData.message = null;
      return session.text(".success");
    });
    ctx2.command("plugin.uninstall <name>", { authority: 4 }).alias(".r").action(async ({ session }, name2) => {
      if (!name2) return session.text(".expect-name");
      const names = ctx2.installer.resolveName(name2);
      const deps = await ctx2.installer.getDeps();
      name2 = names.find((name3) => deps[name3]);
      if (!name2) return session.text(".not-installed");
      await ctx2.installer.install({ [name2]: null });
      return session.text(".success");
    });
    ctx2.command("plugin.upgrade [name...]", { authority: 4 }).alias(".update", ".up").option("self", "-s, --koishi").action(async ({ session, options }, ...names) => {
      async function getPackages(names2) {
        if (!names2.length) return Object.keys(deps);
        names2 = names2.map((name2) => {
          const names3 = ctx2.installer.resolveName(name2);
          return names3.find((name3) => deps[name3]);
        }).filter(Boolean);
        if (options.self) names2.push("koishi");
        return names2;
      }
      await ctx2.installer.refresh(true);
      const deps = await ctx2.installer.getDeps();
      names = await getPackages(names);
      names = names.filter((name2) => {
        const { latest, resolved, invalid } = deps[name2];
        try {
          return !invalid && (0, import_semver2.gt)(latest, resolved);
        } catch {
        }
      });
      if (!names.length) return session.text(".all-updated");
      const output = names.map((name2) => {
        const { latest, resolved } = deps[name2];
        return `${name2}: ${resolved} -> ${latest}`;
      });
      output.unshift(session.text(".available"));
      output.push(session.text(".prompt"));
      await session.send(output.join("\n"));
      const result = await session.prompt();
      if (!["Y", "y"].includes(result?.trim())) {
        return session.text(".cancelled");
      }
      ctx2.loader.envData.message = {
        ...(0, import_koishi5.pick)(session, ["sid", "channelId", "guildId", "isDirect"]),
        content: session.text(".success")
      };
      await ctx2.installer.install(names.reduce((result2, name2) => {
        result2[name2] = deps[name2].latest;
        return result2;
      }, {}), void 0, () => ensurePluginConfigs(ctx2, names));
      await ensurePluginConfigs(ctx2, names);
      ctx2.loader.envData.message = null;
      return session.text(".success");
    });
  });
  ctx.inject(["console", "installer"], (ctx2) => {
    ctx2.plugin(DependencyProvider);
    ctx2.plugin(RegistryProvider);
    ctx2.plugin(RegistryStatusProvider);
    ctx2.plugin(market_default, config.search ?? {});
    ctx2.console.addEntry({
      dev: (0, import_path3.resolve)(__dirname, "../../client/index.ts"),
      prod: (0, import_path3.resolve)(__dirname, "../../dist")
    });
    ctx2.console.addListener("market/install", async (deps, forced) => {
      const installNames = Object.entries(deps).filter(([, version]) => version).map(([name2]) => name2);
      const code = await ctx2.installer.install(deps, forced, () => ensurePluginConfigs(ctx2, installNames));
      if (!code) {
        await ensurePluginConfigs(ctx2, installNames);
      }
      await Promise.all([
        ctx2.get("console")?.refresh("dependencies"),
        ctx2.get("console")?.refresh("registry"),
        ctx2.get("console")?.refresh("packages"),
        ctx2.get("console")?.refresh("config")
      ]);
      return code;
    }, { authority: 4 });
    ctx2.console.addListener("market/refresh-dependencies", async () => {
      await ctx2.installer.refresh(true);
      await ctx2.get("console")?.refresh("config");
    }, { authority: 4 });
    ctx2.console.addListener("market/package", async (name2) => {
      return ctx2.installer.getRegistry(name2);
    }, { authority: 4 });
    ctx2.console.addListener("market/registry", async (names) => {
      const entries = await (0, import_p_map2.default)(names, async (name2) => {
        const meta = await ctx2.installer.getPackage(name2);
        if (!meta) return;
        return [name2, meta];
      }, { concurrency: ctx2.installer.config.concurrency ?? 4 });
      return Object.fromEntries(entries.filter(Boolean));
    }, { authority: 4 });
    ctx2.console.addListener("market/ensure-config", async (name2) => {
      return ensurePluginConfig(ctx2, name2);
    }, { authority: 4 });
    ctx2.on("ready", async () => {
      await ensureInstalledPluginConfigs(ctx2).catch((error) => ctx2.logger("market").warn(error));
    });
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Config,
  Installer,
  MarketProvider,
  apply,
  inject,
  name,
  usage
});
//# sourceMappingURL=index.js.map
