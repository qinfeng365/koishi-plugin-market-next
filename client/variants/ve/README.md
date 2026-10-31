# VE 弹窗来源

`confirm.vue`、`install.vue`、`install-progress.vue` 的模板与样式直接恢复自
`89830e07` 的 `client/components/`，不是根据截图重写。
`version-select.scss` 也来自该提交。

- 原模板与原样式仅为隔离两套入口增加 `ve-` 类名、动画名前缀。
- 业务脚本使用当前主线抽取的 `client/composables/use-*.ts`，不恢复旧配置读写。
- `dialogs.scss` 是后续轻量视觉调整层：主题表面、边界、间距、对齐、按钮层级及手机尺寸。
- 共享滚动条样式覆盖这些 VE 类名；标准弹窗的外观不受影响。
- `scripts/ui-layout.test.mjs` 保留原模板和样式的指纹检查，覆盖层单独验证隔离。

本目录目前只替换上述三类全局弹窗。插件包、最近操作和环境版本等弹窗仍共用当前实现。
