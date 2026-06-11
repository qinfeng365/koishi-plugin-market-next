import { ref } from 'vue'
import type { ConfigTreeNode } from './config-remove'

export const bundleGroupUninstallTarget = ref<ConfigTreeNode>()

export function requestBundleGroupUninstall(target?: ConfigTreeNode) {
  if (!target) return
  bundleGroupUninstallTarget.value = target
}
