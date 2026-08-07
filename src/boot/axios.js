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

let redirectingToLogin = false

function clearAuthSession (store) {
  const auth = store.state.value?.auth
  if (auth) {
    auth.token = null
    auth.user = null
  }
}

function goLogin (router, store, message) {
  clearAuthSession(store)
  if (router.currentRoute.value.path === '/login' || redirectingToLogin) {
    return
  }
  redirectingToLogin = true
  if (message) {
    Notify.create({ type: 'warning', message })
  }
  router.replace({ path: '/login' }).finally(() => {
    redirectingToLogin = false
  })
}

export default boot(({ app, router, store }) => {
  api.interceptors.request.use((config) => {
    const auth = store.state.value?.auth
    const token = auth?.token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      config.headers['X-Token'] = token
    }

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
      const isAuthPublic = url.includes('/auth/login') || url.includes('/auth/register')

      // 后端 401：清会话并跳转登录页（登录/注册接口本身除外）
      if (status === 401 && !isAuthPublic) {
        const body = error?.response?.data
        const msg = body?.msg || body?.detail?.msg
        goLogin(router, store, msg)
      }

      return Promise.reject(error)
    }
  )

  app.config.globalProperties.$axios = axios
  app.config.globalProperties.$api = api
})

export { api }
