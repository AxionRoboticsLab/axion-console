import { useAuthStore } from 'stores/auth'

/**
 * 按钮权限：仅当菜单管理配置了该按钮，且用户角色拥有该权限时为 true。
 * 未传 code 视为无权限门槛（如查询/取消）。
 */
export function usePermission () {
  const auth = useAuthStore()

  function hasButton (code) {
    return auth.hasButton(code)
  }

  return { hasButton, auth }
}

/**
 * v-permission="'user_create'"
 * 无权限时移除节点（不展示）。
 */
export function permissionDirective () {
  return {
    mounted (el, binding) {
      const auth = useAuthStore()
      const code = binding.value
      if (code && !auth.hasButton(code)) {
        el.parentNode && el.parentNode.removeChild(el)
      }
    },
    updated (el, binding) {
      const auth = useAuthStore()
      const code = binding.value
      if (code && !auth.hasButton(code)) {
        if (el.parentNode) el.parentNode.removeChild(el)
        else el.style.display = 'none'
      }
    }
  }
}
