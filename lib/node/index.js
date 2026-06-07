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
    const endpoints = this.getRegistryEndpoints();
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
    const result = (0, import_koishi.valueMap)(this.manifest.dependencies, (request) => {
      return { request: request.replace(/^[~^]/, "") };
    });
    await (0, import_p_map.default)(Object.keys(result), async (name2) => {
      try {
        const meta = loadManifest(name2);
        result[name2].resolved = meta.version;
        result[name2].workspace = meta.$workspace;
        if (meta.$workspace) return;
      } catch {
      }
      if (!(0, import_semver.valid)(result[name2].request)) {
        result[name2].invalid = true;
      }
      const versions = await this.getPackage(name2);
      if (versions) result[name2].latest = Object.keys(versions)[0];
    }, { concurrency: this.config.concurrency ?? 4 });
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
  }
  async exec(args) {
    const name2 = this.agent?.name ?? "npm";
    const useJson = name2 === "yarn" && this.agent.version >= "2";
    if (name2 !== "yarn") args.unshift("install");
    return new Promise((resolve4) => {
      if (useJson) args.push("--json");
      const child = (0, import_execa.default)(name2, args, { cwd: this.cwd });
      child.on("exit", (code) => resolve4(code));
      child.on("error", () => resolve4(-1));
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
    for (const key in deps) {
      if (deps[key]) {
        this.manifest.dependencies[key] = deps[key];
      } else {
        delete this.manifest.dependencies[key];
      }
    }
    this.manifest.dependencies = Object.fromEntries(Object.entries(this.manifest.dependencies).sort((a, b) => a[0].localeCompare(b[0])));
    await import_fs.promises.writeFile(filename, JSON.stringify(this.manifest, null, 2) + "\n");
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
  async install(deps, forced) {
    const localDeps = this._getLocalDeps(deps);
    await this.override(deps);
    for (const name2 in deps) {
      const { resolved, workspace } = localDeps[name2] || {};
      if (workspace || deps[name2] && resolved && (0, import_semver.satisfies)(resolved, deps[name2], { includePrerelease: true })) continue;
      forced = true;
      break;
    }
    if (forced) {
      const code = await this._install();
      if (code) return code;
    }
    await this.refresh();
    const newDeps = await this.getDeps();
    for (const name2 in localDeps) {
      const { resolved, workspace } = localDeps[name2];
      if (workspace || !newDeps[name2]) continue;
      if (newDeps[name2].resolved === resolved) continue;
      try {
        if (!(require.resolve(name2) in require.cache)) continue;
      } catch (error) {
        logger.error(error);
      }
      this.ctx.loader.fullReload();
    }
    await this.refreshData();
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
  cacheMeta;
  conditionMeta;
  cacheResult;
  debugInfo;
  backgroundTask;
  cacheWriteTimer;
  flushData;
  async start(refresh = false) {
    const serial = ++this.serial;
    const start = Date.now();
    this.log("debug", `start market refresh=${refresh}, serial=${serial}, endpoint=${this.config.endpoint}, timeout=${this.config.timeout ?? "default"}, autoRoute=${this.config.autoRoute !== false}`);
    this.forceRefresh = refresh;
    this.failed = [];
    this.fullCache = {};
    this.tempCache = {};
    this.debugInfo = void 0;
    let refreshTask;
    if (refresh) {
      this._task = null;
      this._error = null;
      this.log("debug", "refresh requested: reset market task and refresh dependency data");
      refreshTask = this.ctx.installer.refresh(true).catch((error) => this.ctx.logger("market").warn(error));
    }
    try {
      await super.start(refresh);
    } finally {
      this.forceRefresh = false;
    }
    if (this.isStale(serial)) {
      this.log("debug", `skip market refresh result because provider is stale, serial=${serial}`);
      return;
    }
    await refreshTask;
    this.log("debug", `market start completed in ${Date.now() - start}ms, serial=${serial}`);
  }
  async collect() {
    const serial = this.serial;
    const { timeout } = this.config;
    const registry = this.ctx.installer.http;
    const start = Date.now();
    this.failed = [];
    this.log("debug", `collect market index, serial=${serial}, searchEndpoint=${this.config.endpoint}, registryEndpoint=${registry?.config.endpoint}, timeout=${timeout ?? "default"}`);
    this.scanner = new import_registry2.default((url, config) => registry.get(url, config));
    if (this.http) {
      if (!this.forceRefresh && await this.applyDiskCache(serial)) {
        this.refreshInBackground(serial);
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
      if (result.source === "network") this.scheduleDiskCacheWrite(result.result, this.conditionMeta);
      this.cacheMeta = void 0;
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
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
      });
      this.log("debug", `loaded market index from ${this.endpoint}: ${this.scanner.total}/${result.result.objects.length} objects, source=${result.source}, version=${this.scanner.version ?? "legacy"}, elapsed=${Date.now() - start}ms`);
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
  async fetchIndex(serial) {
    const endpoints = this.getEndpoints();
    this.log("debug", `market endpoint candidates: ${endpoints.join(", ")}`);
    if (endpoints.length === 1 || this.config.autoRoute === false) {
      const result = await this.fetchEndpoint(endpoints[0], 0, endpoints.length, serial);
      const { endpoint } = result;
      this.endpoint = endpoint;
      result.preferredEndpoint = endpoints[0];
      return result;
    }
    this.log("debug", `race market endpoints with weighted stagger, count=${endpoints.length}, preferred=${endpoints[0]}, stagger=${ROUTE_STAGGER}ms`);
    return new Promise((resolve4, reject) => {
      let settled = false;
      let failed = 0;
      let lastError;
      const controllers = endpoints.map(() => new AbortController());
      endpoints.forEach((endpoint, index) => {
        const signal = controllers[index].signal;
        this.waitRouteTurn(index, signal).then(() => {
          if (settled) throw new Error("market endpoint race settled before request");
          return this.fetchEndpoint(endpoint, index, endpoints.length, serial, false, signal);
        }).then((data) => {
          if (settled) {
            this.log("debug", `ignore slower market endpoint ${data.endpoint}, elapsed=${data.elapsed}ms`);
            return;
          }
          settled = true;
          controllers.forEach((controller, controllerIndex) => {
            if (controllerIndex !== index) controller.abort(new Error("market endpoint race settled"));
          });
          this.endpoint = data.endpoint;
          if (data.endpoint !== this.config.endpoint) {
            this.log("debug", `fallback market index endpoint: ${data.endpoint}`);
          }
          data.preferredEndpoint = endpoints[0];
          resolve4(data);
        }).catch((error) => {
          if (settled) return;
          lastError = error;
          failed++;
          if (failed < endpoints.length) return;
          this.log("debug", `all market endpoint candidates failed, count=${endpoints.length}`);
          reject(lastError);
        });
      });
    });
  }
  getEndpoints() {
    const endpoints = [this.config.endpoint, ...this.config.autoRoute === false ? [] : FALLBACK_ENDPOINTS].filter((endpoint, index2, array) => !!endpoint && array.indexOf(endpoint) === index2);
    const preferred = this.getPreferredEndpoint();
    if (!preferred) return endpoints;
    const index = endpoints.indexOf(preferred);
    if (index <= 0) return endpoints;
    return [preferred, ...endpoints.slice(0, index), ...endpoints.slice(index + 1)];
  }
  getPreferredEndpoint() {
    return this.conditionMeta?.endpoint || this.cacheMeta?.endpoint;
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
  getConditionalHeaders(endpoint) {
    const meta = this.conditionMeta;
    if (!meta || meta.endpoint !== endpoint || !this.cacheResult) return {};
    const headers = {};
    if (meta.etag) headers["if-none-match"] = meta.etag;
    if (meta.lastModified) headers["if-modified-since"] = meta.lastModified;
    return headers;
  }
  updateCacheState(result) {
    const sameEndpoint = this.conditionMeta?.endpoint === result.endpoint;
    this.cacheResult = result.result;
    this.conditionMeta = {
      endpoint: result.endpoint,
      fetchedAt: result.source === "network" ? Date.now() : result.cachedAt ?? this.conditionMeta?.fetchedAt ?? Date.now(),
      validatedAt: result.validatedAt,
      etag: result.etag ?? (sameEndpoint ? this.conditionMeta?.etag : void 0),
      lastModified: result.lastModified ?? (sameEndpoint ? this.conditionMeta?.lastModified : void 0),
      hash: result.hash ?? this.conditionMeta?.hash,
      size: result.size ?? this.conditionMeta?.size,
      wireSize: result.wireSize ?? this.conditionMeta?.wireSize,
      contentEncoding: result.contentEncoding ?? this.conditionMeta?.contentEncoding
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
      if (response.status === 304) {
        if (!this.cacheResult || !this.conditionMeta) {
          throw new Error(`market index from ${endpoint} returned 304 without cache`);
        }
        const elapsed2 = Date.now() - start;
        const validatedAt = Date.now();
        this.log("debug", `market index not modified from ${endpoint} in ${elapsed2}ms, reuse cache hash=${shortHash(this.conditionMeta.hash) || "unknown"}`);
        return {
          endpoint,
          result: this.cacheResult,
          elapsed: elapsed2,
          candidates: total,
          source: "http-304",
          timings: { request: requestElapsed, total: elapsed2 },
          size: this.conditionMeta.size,
          wireSize: headerWireSize ?? this.conditionMeta.wireSize,
          contentEncoding: contentEncoding ?? this.conditionMeta.contentEncoding,
          hash: this.conditionMeta.hash,
          etag: etag || this.conditionMeta.etag,
          lastModified: lastModified || this.conditionMeta.lastModified,
          cachedAt: this.conditionMeta.fetchedAt,
          validatedAt
        };
      }
      const text = response.data;
      const size = Buffer.byteLength(text);
      const wireSize = normalizeWireSize(headerWireSize, size);
      const hashStart = Date.now();
      const hash = (0, import_crypto.createHash)("sha256").update(text).digest("hex");
      const hashElapsed = Date.now() - hashStart;
      if (this.cacheResult && this.conditionMeta?.hash === hash) {
        const elapsed2 = Date.now() - start;
        const validatedAt = Date.now();
        this.log("debug", `market index hash unchanged from ${endpoint} in ${elapsed2}ms, size=${size}, hash=${shortHash(hash)}`);
        return {
          endpoint,
          result: this.cacheResult,
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
          cachedAt: this.conditionMeta.fetchedAt,
          validatedAt
        };
      }
      const parseStart = Date.now();
      const result = JSON.parse(text);
      const parseElapsed = Date.now() - parseStart;
      if (!Array.isArray(result?.objects)) {
        throw new Error(`invalid market index from ${endpoint}`);
      }
      const elapsed = Date.now() - start;
      this.log("debug", `market index fetched from ${endpoint} in ${elapsed}ms, objects=${result.objects.length}, size=${size}, wireSize=${wireSize ?? "unknown"}, encoding=${contentEncoding ?? "identity"}, hash=${shortHash(hash) || "unknown"}, version=${result.version ?? "legacy"}`);
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
      throw error;
    }
  }
  async get() {
    const start = Date.now();
    await this.prepare();
    if (!this.scanner) {
      this.log("debug", `get market payload without scanner, cached=${!!this.payload}, elapsed=${Date.now() - start}ms`);
      return this.payload ? { ...this.payload, debug: this.getDebugInfo() } : { data: {}, failed: 0, total: 0, progress: 0, debug: this.getDebugInfo() };
    }
    if (this._error) {
      if (this.payload) {
        const error = formatError(this._error);
        this.log("debug", `use cached market payload because current load failed: ${error}`);
        return {
          ...this.payload,
          stale: true,
          error,
          refreshing: false,
          debug: this.getDebugInfo()
        };
      }
      this.log("debug", `get market payload failed without cache, error=${formatError(this._error)}, elapsed=${Date.now() - start}ms`);
      return { data: {}, failed: 0, total: 0, progress: 0, debug: this.getDebugInfo() };
    }
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
      refreshing: !!this.backgroundTask,
      debug: this.getDebugInfo({
        payloadData: dataElapsed,
        payload: Date.now() - payloadStart
      })
    };
    this.payload = payload;
    this.log("debug", `get market payload completed: total=${payload.total}, progress=${payload.progress}, failed=${payload.failed}, stale=${!!payload.stale}, elapsed=${Date.now() - start}ms`);
    return payload;
  }
  applyIndex(result, endpoint) {
    if (!Array.isArray(result?.objects)) {
      throw new Error(`invalid market index from ${endpoint}`);
    }
    this.endpoint = endpoint;
    this.indexMode = "modern";
    this.scanner.objects = result.objects.filter((object) => !object.ignored);
    this.scanner.total = this.scanner.objects.length;
    this.scanner.version = result.version;
  }
  async applyDiskCache(serial) {
    const start = Date.now();
    try {
      const readStart = Date.now();
      const content = await import_fs2.promises.readFile(this.cacheFile, "utf8");
      const readElapsed = Date.now() - readStart;
      const parseStart = Date.now();
      const cache2 = JSON.parse(content);
      const parseElapsed = Date.now() - parseStart;
      if (!this.getEndpoints().includes(cache2.endpoint)) {
        this.log("debug", `skip market disk cache from unrelated endpoint: ${cache2.endpoint}`);
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
      this.updateDebugInfo({
        source: "disk-cache",
        endpoint: cache2.endpoint,
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
      });
      this.log("debug", `loaded market index from disk cache: ${this.scanner.total}/${cache2.result.objects.length} objects, endpoint=${cache2.endpoint}, cachedAt=${new Date(cache2.fetchedAt).toISOString()}, elapsed=${Date.now() - start}ms`);
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
  scheduleDiskCacheWrite(result, meta = this.conditionMeta) {
    if (!meta) return;
    clearTimeout(this.cacheWriteTimer);
    const cache2 = {
      ...meta,
      endpoint: meta.endpoint,
      fetchedAt: meta.fetchedAt,
      result
    };
    this.cacheWriteTimer = setTimeout(() => {
      this.cacheWriteTimer = void 0;
      void this.writeDiskCache(cache2);
    }, 0);
  }
  async writeDiskCache(cache2) {
    if (this.disposed || !this.ctx.scope.isActive) return;
    try {
      await import_fs2.promises.mkdir((0, import_path2.dirname)(this.cacheFile), { recursive: true });
      await import_fs2.promises.writeFile(this.cacheFile, JSON.stringify(cache2));
      this.log("debug", `wrote market disk cache: endpoint=${cache2.endpoint}, objects=${cache2.result.objects.length}, size=${cache2.size ?? 0}, hash=${shortHash(cache2.hash) || "unknown"}`);
    } catch (error) {
      this.log("warn", `failed to write market disk cache: ${formatError(error)}`);
    }
  }
  refreshInBackground(serial) {
    if (this.backgroundTask) return;
    this.backgroundTask = this.refreshIndexInBackground(serial).finally(() => {
      this.backgroundTask = void 0;
    });
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
      if (result.source === "network") this.scheduleDiskCacheWrite(result.result, this.conditionMeta);
      this._error = null;
      this.cacheMeta = void 0;
      this.payload = void 0;
      this.updateDebugInfo({
        source: result.source,
        endpoint: result.endpoint,
        preferredEndpoint: result.preferredEndpoint,
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
      });
      await this.ctx.get("console")?.refresh("market");
      this.log("debug", `background market refresh completed in ${Date.now() - start}ms, endpoint=${this.endpoint}, source=${result.source}, objects=${this.scanner.total}`);
    } catch (error) {
      if (this.isStale(serial)) return;
      this._error = error;
      await this.ctx.get("console")?.refresh("market");
      this.log("warn", `background market refresh failed in ${Date.now() - start}ms: ${formatError(error)}`);
    }
  }
  updateDebugInfo(info) {
    this.debugInfo = {
      ...this.debugInfo,
      ...info,
      timings: {
        ...this.debugInfo?.timings,
        ...info.timings
      }
    };
    this.log("debug", `market performance: source=${this.debugInfo.source ?? "unknown"}, endpoint=${this.debugInfo.endpoint ?? "unknown"}, preferred=${this.debugInfo.preferredEndpoint ?? "unknown"}, objects=${this.debugInfo.objects ?? 0}, size=${this.debugInfo.size ?? 0}, wireSize=${this.debugInfo.wireSize ?? "unknown"}, encoding=${this.debugInfo.contentEncoding ?? "identity"}, timings=${formatTimings(this.debugInfo.timings)}`);
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
    this.ctx.logger("market")[level](message);
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
function shortHash(hash) {
  return hash?.slice(0, 12);
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
var statusValues = ["verified", "insecure", "preview", "portable", "deprecated"];
var sortValues = ["relevance", "rating", "downloads", "created", "updated"];
var orderValues = ["asc", "desc"];
var cache = {};
var pending = {};
var searchSchema = import_zod.default.object({
  query: import_zod.default.string().optional().describe("Keyword search. Matches plugin package name, short name, description, and keywords."),
  category: import_zod.default.array(import_zod.default.string()).optional().describe("Category filter, for example adapter, ai, tool, game, webui. Multiple values match any category."),
  status: import_zod.default.array(import_zod.default.enum(statusValues)).optional().describe("Status filter: verified, insecure, preview, portable, deprecated. Multiple values match any status."),
  createdAfter: import_zod.default.string().optional().describe("Only include plugins created on or after this date. Supports YYYY-MM-DD or ISO date."),
  createdBefore: import_zod.default.string().optional().describe("Only include plugins created on or before this date. Supports YYYY-MM-DD or ISO date."),
  updatedAfter: import_zod.default.string().optional().describe("Only include plugins updated on or after this date. Supports YYYY-MM-DD or ISO date."),
  updatedBefore: import_zod.default.string().optional().describe("Only include plugins updated on or before this date. Supports YYYY-MM-DD or ISO date."),
  createdWithinDays: import_zod.default.number().int().positive().optional().describe("Only include plugins created within the last N days."),
  updatedWithinDays: import_zod.default.number().int().positive().optional().describe("Only include plugins updated within the last N days."),
  sort: import_zod.default.enum(sortValues).default("relevance").describe("Sort mode."),
  order: import_zod.default.enum(orderValues).default("desc").describe("Sort order."),
  limit: import_zod.default.number().int().min(1).max(50).default(10).describe("Maximum number of results to show, from 1 to 50."),
  includeHidden: import_zod.default.boolean().optional().describe("Include ignored or hidden plugins. Defaults to false."),
  includeDeprecated: import_zod.default.boolean().optional().describe("Include deprecated plugins. Defaults to false unless status includes deprecated.")
});
var description = `Search the Koishi plugin market.

Use this read-only tool when the user asks to find Koishi plugins by keyword, category, status, created/updated time range, recent additions, recent updates, downloads, rating, or market metadata.

The tool only reads the market registry index. It does not install, uninstall, update, edit configuration, or modify package.json.`;
function applyChatLunaTool(ctx, config = {}) {
  if (!config.chatlunaTool) return;
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
      return registerTool.call(chatluna.platform, TOOL_NAME, {
        description: marketTool.description,
        selector: () => true,
        meta: {
          source: "extension",
          group: "market",
          tags: ["market", "koishi", "plugin"],
          defaultAvailability: {
            enabled: true,
            main: true,
            chatluna: true,
            characterScope: "all"
          }
        },
        createTool: () => marketTool
      });
    });
  });
}
function createMarketTool(ctx, config) {
  return (0, import_tools.tool)(async (input) => {
    try {
      const result = await loadIndex(ctx, config);
      return formatSearchResult(result, input);
    } catch (error) {
      return formatLoadError(resolveEndpoint(config), error);
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
  const lines = [
    "# Koishi \u63D2\u4EF6\u5E02\u573A\u67E5\u8BE2\u7ED3\u679C",
    "",
    `- Registry: ${index.endpoint}`,
    `- \u7D22\u5F15\u65F6\u95F4: ${formatDateTime(index.fetchedAt)}${result.stale ? "\uFF08\u7F13\u5B58\uFF09" : ""}`,
    `- \u547D\u4E2D\u6570: ${filtered.length}`,
    `- \u5C55\u793A\u6570: ${shown.length}`,
    `- \u7B5B\u9009\u6761\u4EF6: ${formatFilters(input)}`
  ];
  if (result.stale) {
    lines.push(`- \u8B66\u544A: \u83B7\u53D6\u6700\u65B0\u5E02\u573A\u7D22\u5F15\u5931\u8D25\uFF0C\u6B63\u5728\u4F7F\u7528\u65E7\u7F13\u5B58\u3002\u539F\u56E0\uFF1A${result.error}`);
  }
  if (!shown.length) {
    lines.push("", "\u6CA1\u6709\u627E\u5230\u7B26\u5408\u6761\u4EF6\u7684\u63D2\u4EF6\u3002\u53EF\u4EE5\u653E\u5BBD\u5173\u952E\u8BCD\u3001\u65F6\u95F4\u8303\u56F4\u3001\u5206\u7C7B\u6216\u72B6\u6001\u8FC7\u6EE4\u3002");
    return lines.join("\n");
  }
  shown.forEach((item, index2) => {
    lines.push("", formatItem(item, index2 + 1));
  });
  return lines.join("\n");
}
function filterObjects(objects, input) {
  const terms = getQueryTerms(input.query);
  const categories = new Set(input.category?.map(normalizeText).filter(Boolean));
  const statuses = input.status ?? [];
  const includeDeprecated = input.includeDeprecated || statuses.includes("deprecated");
  const createdAfter = input.createdWithinDays ? Date.now() - input.createdWithinDays * DAY : parseDate(input.createdAfter, false);
  const createdBefore = parseDate(input.createdBefore, true);
  const updatedAfter = input.updatedWithinDays ? Date.now() - input.updatedWithinDays * DAY : parseDate(input.updatedAfter, false);
  const updatedBefore = parseDate(input.updatedBefore, true);
  return objects.filter((item) => {
    if (!input.includeHidden && (item.ignored || item.manifest?.hidden)) return false;
    if (!includeDeprecated && isDeprecated(item)) return false;
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
  const terms = getQueryTerms(input.query);
  const order = input.order === "asc" ? 1 : -1;
  return objects.slice().sort((a, b) => {
    const delta = compareObject(a, b, input.sort, terms);
    if (delta) return delta * order;
    return a.package.name.localeCompare(b.package.name);
  });
}
function compareObject(a, b, sort, terms) {
  if (sort === "rating") return (a.rating ?? 0) - (b.rating ?? 0);
  if (sort === "downloads") return (a.downloads?.lastMonth ?? 0) - (b.downloads?.lastMonth ?? 0);
  if (sort === "created") return (parseItemDate(a.createdAt) ?? 0) - (parseItemDate(b.createdAt) ?? 0);
  if (sort === "updated") return (parseItemDate(a.updatedAt) ?? 0) - (parseItemDate(b.updatedAt) ?? 0);
  return relevanceScore(a, terms) - relevanceScore(b, terms);
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
function formatItem(item, index) {
  const pkg = item.package;
  const links = getLinks(item);
  const maintainers = pkg.maintainers?.slice(0, 3).map((user) => user.username || user.name || user.email).filter(Boolean);
  const lines = [
    `## ${index}. ${item.shortname || pkg.name}`,
    `- \u5305\u540D: \`${pkg.name}\``,
    `- \u7248\u672C: \`${pkg.version}\``,
    `- \u5206\u7C7B: ${resolveCategory(item.category)}`,
    `- \u8BC4\u5206: ${formatNumber(item.rating ?? 0)}`,
    `- \u6708\u4E0B\u8F7D: ${formatInteger(item.downloads?.lastMonth ?? 0)}`,
    `- \u521B\u5EFA\u65F6\u95F4: ${formatDate(item.createdAt)}`,
    `- \u66F4\u65B0\u65F6\u95F4: ${formatDate(item.updatedAt)}`,
    `- \u72B6\u6001\u6807\u7B7E: ${getStatusTags(item).join(", ") || "normal"}`
  ];
  if (maintainers?.length) {
    lines.push(`- \u7EF4\u62A4\u8005: ${maintainers.join(", ")}`);
  }
  lines.push(
    `- \u7B80\u4ECB: ${truncate(getDescription(item), 220) || "\u6682\u65E0\u7B80\u4ECB\u3002"}`,
    `- \u94FE\u63A5: ${links.join(" / ")}`
  );
  return lines.join("\n");
}
function getLinks(item) {
  const name2 = item.package.name;
  const links = item.package.links ?? {};
  const result = [`[npm](${links.npm || `https://www.npmjs.com/package/${name2}`})`];
  const homepage = links.homepage || links.repository;
  if (homepage) result.push(`[homepage](${homepage.replace(/^git\+/, "").replace(/\.git$/, "")})`);
  return result;
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
function getDescription(item) {
  const description2 = item.manifest?.description;
  if (typeof description2 === "string") return cleanText(description2);
  if (description2) {
    return cleanText(description2["zh-CN"] || description2["en-US"] || Object.values(description2)[0]);
  }
  return cleanText(item.package.description);
}
function formatFilters(input) {
  const filters = [];
  if (input.query) filters.push(`\u5173\u952E\u8BCD=${input.query}`);
  if (input.category?.length) filters.push(`\u5206\u7C7B=${input.category.join(", ")}`);
  if (input.status?.length) filters.push(`\u72B6\u6001=${input.status.join(", ")}`);
  if (input.createdAfter) filters.push(`\u521B\u5EFA\u665A\u4E8E=${input.createdAfter}`);
  if (input.createdBefore) filters.push(`\u521B\u5EFA\u65E9\u4E8E=${input.createdBefore}`);
  if (input.updatedAfter) filters.push(`\u66F4\u65B0\u665A\u4E8E=${input.updatedAfter}`);
  if (input.updatedBefore) filters.push(`\u66F4\u65B0\u65E9\u4E8E=${input.updatedBefore}`);
  if (input.createdWithinDays) filters.push(`\u6700\u8FD1\u65B0\u589E=${input.createdWithinDays}\u5929`);
  if (input.updatedWithinDays) filters.push(`\u6700\u8FD1\u66F4\u65B0=${input.updatedWithinDays}\u5929`);
  if (input.includeHidden) filters.push("\u5305\u542B\u9690\u85CF");
  if (input.includeDeprecated) filters.push("\u5305\u542B\u5E9F\u5F03");
  filters.push(`\u6392\u5E8F=${input.sort}/${input.order}`, `\u9650\u5236=${input.limit}`);
  return filters.join("; ");
}
function formatLoadError(endpoint, error) {
  return [
    "# Koishi \u63D2\u4EF6\u5E02\u573A\u67E5\u8BE2\u5931\u8D25",
    "",
    `- Registry: ${endpoint}`,
    `- \u539F\u56E0: ${formatError2(error)}`,
    "",
    "\u8BF7\u68C0\u67E5 market.search.endpoint\u3001market.search.timeout \u914D\u7F6E\u6216\u5F53\u524D\u7F51\u7EDC\u8FDE\u63A5\u3002\u6B64\u5DE5\u5177\u53EA\u8BFB\u67E5\u8BE2\u5E02\u573A\u7D22\u5F15\uFF0C\u4E0D\u4F1A\u4FEE\u6539\u672C\u5730\u914D\u7F6E\u3002"
  ].join("\n");
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
function normalizeText(value) {
  return (value ?? "").toLowerCase().trim();
}
function getQueryTerms(query) {
  return normalizeText(query).split(/\s+/).filter(Boolean);
}
function cleanText(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
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
  if (!timestamp) return "unknown";
  return new Date(timestamp).toISOString().slice(0, 10);
}
function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}
function formatInteger(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("en-US") : "0";
}
function formatError2(error) {
  if (error instanceof Error) return error.message;
  return String(error);
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
      await ctx2.installer.install(result);
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
      }, {}));
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
      const code = await ctx2.installer.install(deps, forced);
      await Promise.all([
        ctx2.get("console")?.refresh("dependencies"),
        ctx2.get("console")?.refresh("registry"),
        ctx2.get("console")?.refresh("packages")
      ]);
      return code;
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
      await ctx2.get("console")?.listeners["config/request-runtime"]?.callback.call(null, name2);
      await Promise.all([
        ctx2.get("console")?.refresh("packages"),
        ctx2.get("console")?.refresh("config")
      ]);
    }, { authority: 4 });
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
