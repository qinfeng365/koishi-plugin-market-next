# VE 入口

只负责两件事：把 `/dependencies` 和 `/market` 换成 VE 组件，其余保持标准实现。

- `dependencies.vue`、`package.vue`：依赖管理页与卡片，样式全部收在 `.deps-ui-ve` 下。
- `market.vue`：标准市场页的薄包装，只加 `.market-ui-ve` 覆盖层。
- 安装、确认、安装进度三个全局弹窗直接复用 `client/components/` 里的 `market-dialog` 实现，
  不在这里保留副本；改弹窗只需要改共享组件和 `client/styles/dialog.scss`。
