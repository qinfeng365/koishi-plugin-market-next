// src/shared/index.ts
import { Logger } from "koishi";
import { DataService } from "@koishijs/console";

// src/shared/bundle.ts
import { validRange } from "semver";
var BUNDLE_KEYWORD = "market:package";
var BUNDLE_PACKAGE_RE = /^(?:@[0-9a-z-]+\/)?koishi-plugin-pa-[0-9a-z-]+$/;
var PLUGIN_PACKAGE_RE = /^(?:@[^/]+\/)?koishi-plugin-[0-9a-z-]+$|^@koishijs\/plugin-[0-9a-z-]+$/;
var SENSITIVE_RE = /(command|script|exec|shell|path|file|token|secret|password|sql|url|webhook|endpoint)/i;
function isBundlePackageName(name = "") {
  return name === name.toLowerCase() && BUNDLE_PACKAGE_RE.test(name);
}
function hasBundleKeyword(keywords) {
  return !!keywords?.some((keyword) => keyword.toLowerCase() === BUNDLE_KEYWORD);
}
function isBundleLike(meta) {
  return isBundlePackageName(meta.name) || hasBundleKeyword(meta.keywords) || !!parseBundleManifest(meta.koishi?.bundle);
}
function parseBundleManifest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const members = Array.isArray(value.members) ? value.members.map(parseBundleMember).filter(Boolean) : [];
  return {
    label: typeof value.label === "string" ? value.label : void 0,
    description: typeof value.description === "string" ? value.description : void 0,
    members
  };
}
function parseBundleMember(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  return {
    package: typeof value.package === "string" ? value.package : "",
    plugin: typeof value.plugin === "string" ? value.plugin : "",
    version: typeof value.version === "string" ? value.version : "",
    required: value.required === true,
    config: value.config && typeof value.config === "object" && !Array.isArray(value.config) ? value.config : void 0
  };
}
function validateBundleManifest(packageName, bundle, options = {}) {
  const errors = [];
  const warnings = [];
  const normalizedName = packageName.toLowerCase();
  if (packageName !== normalizedName) errors.push("package name must be lowercase");
  if (isBundlePackageName(packageName) || options.keyword || bundle) {
    if (!isBundlePackageName(packageName)) errors.push("bundle package name must be koishi-plugin-pa-* or @scope/koishi-plugin-pa-*");
  }
  if (!bundle) {
    errors.push("missing koishi.bundle");
    return { valid: false, errors, warnings };
  }
  if (!bundle.members.length) errors.push("koishi.bundle.members must not be empty");
  if (!options.keyword) warnings.push(`missing keyword "${BUNDLE_KEYWORD}"`);
  const seen = /* @__PURE__ */ new Set();
  const seenPackages = /* @__PURE__ */ new Set();
  const seenPlugins = /* @__PURE__ */ new Set();
  for (const [index, member] of bundle.members.entries()) {
    const prefix = `members[${index}]`;
    const normalizedPackage = member.package.toLowerCase();
    if (!member.package) errors.push(`${prefix}.package is required`);
    else if (member.package !== normalizedPackage) errors.push(`${prefix}.package must be lowercase`);
    else if (!PLUGIN_PACKAGE_RE.test(member.package)) errors.push(`${prefix}.package is not a valid Koishi plugin package name`);
    else if (normalizedPackage === packageName.toLowerCase()) errors.push(`${prefix}.package must not reference the bundle package itself`);
    if (!member.plugin) errors.push(`${prefix}.plugin is required`);
    else if (!/^(?:@[^/]+\/)?[0-9a-z][0-9a-z-]*(?:\/[0-9a-z][0-9a-z-]*)?$/.test(member.plugin)) {
      warnings.push(`${prefix}.plugin should use lowercase package-like keys to avoid config conflicts`);
    }
    if (!member.version) errors.push(`${prefix}.version is required`);
    else if (!validRange(member.version.trim())) errors.push(`${prefix}.version is not a valid semver range`);
    const key = `${member.package}
${member.plugin}`;
    if (seen.has(key)) errors.push(`${prefix} duplicates another member`);
    seen.add(key);
    if (member.package) {
      if (seenPackages.has(normalizedPackage)) warnings.push(`${prefix}.package is listed more than once`);
      seenPackages.add(normalizedPackage);
    }
    if (member.plugin) {
      const normalizedPlugin = member.plugin.toLowerCase();
      if (seenPlugins.has(normalizedPlugin)) warnings.push(`${prefix}.plugin may conflict with another member`);
      seenPlugins.add(normalizedPlugin);
    }
  }
  return { valid: !errors.length, errors, warnings };
}
function getPluginShortname(name) {
  return name.replace(/(koishi-|^@koishijs\/)plugin-/, "");
}
function normalizeBundleIdent(value) {
  return value.toLowerCase().replace(/^@/, "").replace(/[^0-9a-z]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "bundle";
}
function getBundleGroupIdent(packageName) {
  return `pa-${normalizeBundleIdent(getPluginShortname(packageName))}`;
}
function getBundleMemberIdent(packageName, member) {
  return `pa-${normalizeBundleIdent(getPluginShortname(packageName))}-${normalizeBundleIdent(getPluginShortname(member.plugin || member.package))}`;
}
function scanSensitiveConfig(value, path = "") {
  const result = [];
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key;
    if (SENSITIVE_RE.test(key)) result.push(next);
    result.push(...scanSensitiveConfig(child, next));
  }
  return result;
}

// src/shared/index.ts
var logger = new Logger("market");
var MarketProvider = class extends DataService {
  _task;
  _timestamp = 0;
  _error;
  constructor(ctx) {
    super(ctx, "market", { authority: 4 });
    ctx.console.addListener("market/refresh", async () => {
      await this.start(true);
    }, { authority: 4 });
  }
  async start(refresh = false) {
    this._task = null;
    this._error = null;
    this._timestamp = Date.now();
    await this.refresh();
  }
  async prepare() {
    return this._task ||= this.collect().catch((error) => {
      if (error?.message !== "market provider disposed") logger.warn(error);
      this._error = error;
      this._task = null;
    });
  }
};
export {
  BUNDLE_KEYWORD,
  BUNDLE_PACKAGE_RE,
  MarketProvider,
  PLUGIN_PACKAGE_RE,
  getBundleGroupIdent,
  getBundleMemberIdent,
  getPluginShortname,
  hasBundleKeyword,
  isBundleLike,
  isBundlePackageName,
  normalizeBundleIdent,
  parseBundleManifest,
  scanSensitiveConfig,
  validateBundleManifest
};
//# sourceMappingURL=index.mjs.map
