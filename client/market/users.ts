import type { SearchObject, User } from '@koishijs/registry'

const usersCache = new WeakMap<SearchObject, User[]>()

export function getUsers(data: SearchObject) {
  const cached = usersCache.get(data)
  if (cached) return cached
  const result: Record<string, User> = {}
  for (const user of data.package.contributors ?? []) {
    const key = getUserKey(user)
    if (!key) continue
    result[key] ||= user
  }
  const users = !data.package.maintainers.some(user => result[getUserKey(user)])
    ? data.package.maintainers.map(user => ({
      ...user,
      name: user.name || user.username,
    }))
    : Object.values(result)
  usersCache.set(data, users)
  return users
}

export function getUserKey(user: User) {
  return user.email || user.username || user.name
}
