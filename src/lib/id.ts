export function uid(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 9)
  const time = Date.now().toString(36).slice(-4)
  return `${prefix}_${rand}${time}`
}
