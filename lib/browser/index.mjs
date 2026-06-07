// src/browser/index.ts
import { Schema } from "koishi";

// src/shared/index.ts
import { Logger, Time } from "koishi";
import { DataService } from "@koishijs/console";
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
    ctx.on("console/connection", async (client) => {
      if (!ctx.console.clients[client.id]) return;
      if (Date.now() - this._timestamp <= Time.hour * 12) return;
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
      if (error?.message !== "market provider disposed") logger.warn(error);
      this._error = error;
      this._task = null;
    });
  }
};

// src/browser/market.ts
var MarketProvider2 = class extends MarketProvider {
  async collect() {
    return this.ctx.loader.market;
  }
  async get() {
    const market = await this.prepare();
    if (!market) return { data: {}, failed: 0, total: 0, progress: 0 };
    return {
      data: Object.fromEntries(market.objects.map((item) => [item.package.name, item])),
      failed: 0,
      total: market.objects.length,
      progress: market.objects.length
    };
  }
};

// src/browser/index.ts
var filter = false;
var name = "market";
var inject = ["console"];
var Config = Schema.object({});
function apply(ctx, config) {
  ctx.plugin(MarketProvider2);
  ctx.console.addEntry(process.env.KOISHI_BASE ? [
    process.env.KOISHI_BASE + "/dist/index.js",
    process.env.KOISHI_BASE + "/dist/index.css"
  ] : [
    // @ts-ignore
    import.meta.url.replace(/\/src\/[^/]+\/[^/]+$/, "/client/index.ts")
  ]);
}
export {
  Config,
  MarketProvider2 as MarketProvider,
  apply,
  filter,
  inject,
  name
};
//# sourceMappingURL=index.mjs.map
