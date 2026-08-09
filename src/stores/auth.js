import { defineStore } from 'pinia'
import { api } from 'boot/axios'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null,
    user: null,
    menus: [],
    buttonCodes: []
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    displayName: (state) => state.user?.name || state.user?.username || '',
    avatarUrl: (state) => state.user?.avatar_url || '',
    isSuperUser: (state) => state.user?.super_user === 1
  },

  actions: {
    _applyPayload (payload) {
      this.token = payload.access_token || payload['X-Token'] || this.token || null
      this.user = {
        id: payload.id,
        username: payload.username,
        name: payload.name,
        avatar_url: payload.avatar_url || '',
        super_user: payload.super_user,
        state: payload.state
      }
      this.menus = payload.menus || []
      this.buttonCodes = payload.button_codes || []
    },

    async login (username, password) {
      const { data: body } = await api.post('/auth/login', { username, password })
      if (body.code !== 0) {
        const err = new Error(body.msg || 'login failed')
        err.code = body.code
        err.response = { data: body }
        throw err
      }
      const payload = body.data || {}
      this._applyPayload(payload)
      return payload
    },

    async fetchMe () {
      if (!this.token) return null
      const { data: body } = await api.get('/auth/me')
      if (body.code !== 0) {
        throw new Error(body.msg || 'fetch me failed')
      }
      const payload = body.data || {}
      this._applyPayload({ ...payload, access_token: this.token })
      return payload
    },

    hasButton (code) {
      // 未配置 code：不设权限门槛（查询/取消等）
      if (!code) return true
      // 仅认登录/me 下发的 button_codes（来自菜单管理配置 + 角色授权并集）
      // 未配置或未授权 → 无权限，不展示
      return (this.buttonCodes || []).includes(code)
    },

    async logout () {
      try {
        if (this.token) {
          await api.post('/auth/logout')
        }
      } catch (_) {
        // ignore
      } finally {
        this.clearSession()
        // 登出才释放 rosbridge；切页保持连接
        try {
          const { releaseRosConnection } = await import('components/ros/RosClient')
          releaseRosConnection()
        } catch (_) {
          // ignore
        }
      }
    },

    clearSession () {
      this.token = null
      this.user = null
      this.menus = []
      this.buttonCodes = []
    }
  },

  persist: {
    enabled: true,
    strategies: [
      {
        key: 'axion-auth',
        storage: localStorage,
        paths: ['token', 'user', 'menus', 'buttonCodes']
      }
    ]
  }
})
