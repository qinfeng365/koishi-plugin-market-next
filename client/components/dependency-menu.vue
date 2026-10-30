<template>
  <!-- Uses Element Plus dropdown classes so it looks like the el-dropdown it replaces. -->
  <!-- Element Plus 2.8 ignores an empty virtual-ref and keeps the old element, so a closed menu
       points at this span instead of the last card. -->
  <span ref="idle" hidden></span>
  <el-popover
    :visible="dependencyMenu.open"
    :virtual-ref="dependencyMenu.anchor ?? idle"
    virtual-triggering
    placement="bottom-end"
    width="auto"
    :persistent="false"
    popper-class="el-dropdown__popper dep-menu-popper"
    @after-leave="!dependencyMenu.open && Object.assign(dependencyMenu, cleared)"
  >
    <ul ref="list" class="el-dropdown-menu" role="menu">
      <template v-for="item in dependencyMenu.items()" :key="item.command">
        <li v-if="item.danger" role="separator" class="el-dropdown-menu__item--divided"></li>
        <li
          :class="['el-dropdown-menu__item', 'dep-menu-item', { 'dep-menu-danger': item.danger }]"
          role="menuitem"
          @click="choose(item.command)"
        >
          <k-icon :name="item.icon"></k-icon>
          <span>{{ item.label }}</span>
        </li>
      </template>
    </ul>
  </el-popover>
</template>

<script lang="ts" setup>

import { onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
import { dependencyMenu } from './utils'

const list = ref<HTMLElement>()
const idle = ref<HTMLElement>()

// Drops the closed card's element and callbacks, after the fade-out or when the page goes away.
const cleared = { anchor: undefined, items: () => [], select: () => {} }

// The popover is controlled, so clicks outside it and Escape have to close it here.
// Clicks on the anchor are left alone because its button toggles the menu itself.
function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (list.value?.closest('.el-popper')?.contains(target) || dependencyMenu.anchor?.contains(target)) return
  dependencyMenu.open = false
}

function onEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') dependencyMenu.open = false
}

function choose(command: string) {
  dependencyMenu.open = false
  dependencyMenu.select(command)
}

function listen(enabled: boolean) {
  const method = enabled ? 'addEventListener' : 'removeEventListener'
  document[method]('pointerdown', onPointerDown, true)
  document[method]('keydown', onEscape, true)
}

watch(() => dependencyMenu.open, listen)

// A card can lose all its actions while its menu is open, which also removes the anchor.
watch(() => dependencyMenu.items().length, (length) => {
  if (!length) dependencyMenu.open = false
})

// The page is gone at once, so there is no fade-out to wait for. On unmount the watcher on
// `open` is already stopped, so the listeners are removed here as well.
function teardown() {
  Object.assign(dependencyMenu, { open: false, ...cleared })
  listen(false)
}
onDeactivated(teardown)
onBeforeUnmount(teardown)

</script>

<style lang="scss">

.dep-menu-popper.el-popover.el-popper {
  padding: 0;
  min-width: 0;
}

.dep-menu-item.el-dropdown-menu__item {
  gap: 0.625rem;
  min-width: 9rem;

  .k-icon {
    width: 1rem;
    height: 1rem;
    color: var(--fg3);
  }
}

.dep-menu-danger.el-dropdown-menu__item:not(.is-disabled) {
  color: var(--danger);

  .k-icon {
    color: inherit;
  }

  &:hover, &:focus {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 10%, transparent);
  }
}

</style>
