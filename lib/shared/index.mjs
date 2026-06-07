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
      logger.warn(error);
      this._error = error;
      this._task = null;
    });
  }
};
export {
  MarketProvider
};
//# sourceMappingURL=index.mjs.map
