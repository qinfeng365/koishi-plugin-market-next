<template>
  <div class="dialog-list-row bundle-member bundle-all">
    <span>{{ t('bundle.members.all') }}</span>
    <!-- The column name is the checkbox's own label, shown above the box, so it is clickable too. -->
    <el-checkbox
      v-for="column in columns"
      :key="column.label"
      class="bundle-column"
      :model-value="isAll(column)"
      :indeterminate="!isAll(column) && column.members.some(column.get)"
      :disabled="!targetsOf(column).length && !column.members.some(column.get)"
      @change="setAll(column, !!$event)"
    >
      {{ column.label }}
    </el-checkbox>
  </div>
</template>

<script lang="ts">

// A column of a bundle member table. Checking its select-all only checks `targets` (all of `members`
// when left out), the members a bulk click can safely change. Unchecking clears every member in
// `members`, the ones that have the option at all. The box shows checked when all targets are, and
// half-checked when any member is checked otherwise.
export interface BundleColumn<T> {
  label: string
  members: T[]
  targets?: T[]
  get: (member: T) => boolean
  set: (member: T, value: boolean) => void
}

</script>

<script lang="ts" setup generic="T">

import { useMarketNextI18n } from '../i18n'

type Column = BundleColumn<T>

defineProps<{
  columns: Column[]
}>()

const { t } = useMarketNextI18n()

function targetsOf(column: Column) {
  return column.targets ?? column.members
}

function isAll(column: Column) {
  return !!targetsOf(column).length && targetsOf(column).every(column.get)
}

// With no targets, a half-checked box can only have members outside them checked, so clicking it
// clears them instead.
function setAll(column: Column, value: boolean) {
  const check = value && !!targetsOf(column).length
  for (const member of check ? targetsOf(column) : column.members) column.set(member, check)
}

</script>
