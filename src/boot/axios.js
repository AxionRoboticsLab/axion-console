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

function resolveLocale (store) {
  try {
    const params = store.state.value?.counter
    if (params?.locale) return params.locale
  } catch (_) { /* ignore */ }
  try {
    const raw = localStorage.getItem('control-params')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.locale) return parsed.locale
    }
  } catch (_) { /* ignore */ }
  return 'zh-CN'
}

export default boot(({ app, router, store }) => {
  api.interceptors.request.use((config) => {
    const auth = store.state.value?.auth
    const token = auth?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      config.headers['X-Token'] = token
    }

    // 与后端约定：X-Locale 优先，Accept-Language 兼容
    const loc = resolveLocale(store)
    config.headers['X-Locale'] = loc
    config.headers['Accept-Language'] = loc
    return config
  })

  api.interceptors.response.use(
    (res) => res,
    async (error) => {
      const status = error?.response?.status
      const url = String(error?.config?.url || '')
      if (status === 401 && !url.includes('/auth/login') && !url.includes('/auth/register')) {
        const auth = store.state.value?.auth
        if (auth) {
          auth.token = null
          auth.user = null
        }
        if (router.currentRoute.value.path !== '/login') {
          const body = error?.response?.data
          Notify.create({
            type: 'warning',
            message: body?.msg || body?.detail?.msg || '请重新登录'
          })
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
