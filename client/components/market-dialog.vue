<!--
  Attributes such as v-model, width and extra classes fall through to el-dialog,
  so el-dialog has to stay the only root node (a comment there would break that).
-->
<template>
  <el-dialog class="market-dialog">
    <template v-if="$slots.header" #header="scope">
      <slot name="header" v-bind="scope"></slot>
    </template>
    <el-scrollbar class="market-dialog-scroll" view-class="market-dialog-body">
      <slot></slot>
    </el-scrollbar>
    <template v-if="$slots.footer" #footer>
      <slot name="footer"></slot>
    </template>
  </el-dialog>
</template>
