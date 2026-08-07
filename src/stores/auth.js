import { defineStore } from 'pinia'
import { api } from 'boot/axios'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null,
    user: null
  }),

  getters: {
    isAuthenticated: (state) => Boolean(state.token),
    displayName: (state) => state.user?.name || state.user?.username || '',
    avatarUrl: (state) => state.user?.avatar_url || ''
  },

  actions: {
    async login (username, password) {
      const { data: body } = await api.post('/auth/login', { username, password })
      if (body.code !== 0) {
        const err = new Error(body.msg || 'login failed')
        err.code = body.code
        err.response = { data: body }
        throw err
      }
      const payload = body.data || {}
      this.token = payload.access_token || payload['X-Token'] || null
      this.user = {
        id: payload.id,
        username: payload.username,
        name: payload.name,
        avatar_url: payload.avatar_url || '',
        super_user: payload.super_user,
        state: payload.state
      }
      return payload
    },

    async logout () {
      try {
        if (this.token) {
          await api.post('/auth/logout')
        }
      } catch (_) {
        // ignore
      } finally {
        this.token = null
        this.user = null
      }
    },

    clearSession () {
      this.token = null
      this.user = null
    }
  },

  persist: {
    enabled: true,
    strategies: [
      {
        key: 'axion-auth',
        storage: localStorage,
        paths: ['token', 'user']
      }
    ]
  }
})
