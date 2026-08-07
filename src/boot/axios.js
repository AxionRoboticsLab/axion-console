import { boot } from 'quasar/wrappers'
import axios from 'axios'
import { Notify } from 'quasar'

/**
 * Production nginx: /api/rcs/ → edge-agent :5100/api/
 * Dev: Vite proxy mirrors the same path (quasar.config.js).
 */
const api = axios.create({
  baseURL: '/api/rcs',
  timeout: 15000
})

export default boot(({ app, router, store }) => {
  api.interceptors.request.use((config) => {
    const auth = store.state.value?.auth
    const token = auth?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      config.headers['X-Token'] = token
    }
    return config
  })

  api.interceptors.response.use(
    (res) => res,
    async (error) => {
      const status = error?.response?.status
      const url = String(error?.config?.url || '')
      if (status === 401 && !url.includes('/auth/login')) {
        const auth = store.state.value?.auth
        if (auth) {
          auth.token = null
          auth.user = null
        }
        if (router.currentRoute.value.path !== '/login') {
          Notify.create({ type: 'warning', message: '请重新登录' })
          router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } })
        }
      }
      return Promise.reject(error)
    }
  )

  app.config.globalProperties.$axios = axios
  app.config.globalProperties.$api = api
})

export { api }
