/**
 * 业务标识名（map_name / 巡检点名等）公共约束。
 * 与 axion-edge-agent app/core/naming.py、axion-slam is_valid_map_name 一致。
 * 3–20 字符；字母开头；仅字母、数字、下划线。
 */
export const IDENTITY_NAME_MIN = 3
export const IDENTITY_NAME_MAX = 20
export const IDENTITY_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/

export function isValidIdentityName (name) {
  return IDENTITY_NAME_RE.test(String(name || '').trim())
}

export function normalizeIdentityName (name) {
  return String(name || '').trim()
}
