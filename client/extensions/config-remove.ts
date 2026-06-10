import { ref } from 'vue'

export interface ConfigTreeNode {
  id: string
  name: string
  path: string
  label?: string
  children?: ConfigTreeNode[]
  parent?: ConfigTreeNode
}

const coreDeps = ['@koishijs/plugin-console', '@koishijs/plugin-config', '@koishijs/plugin-server']

export const configRemoveTarget = ref<ConfigTreeNode>()

export function requestConfigRemove(target?: ConfigTreeNode) {
  if (!target) return
  configRemoveTarget.value = target
}

export function isProtectedConfigNode(target?: ConfigTreeNode): boolean {
  if (!target) return false
  if (coreDeps.includes('@koishijs/plugin-' + target.name)) return true
  return target.children?.some(isProtectedConfigNode) ?? false
}

