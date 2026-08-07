import { route } from 'quasar/wrappers'
import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from 'vue-router'
import routes from './routes'
import { useAuthStore } from 'stores/auth'

export default route(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : (process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory)

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE)
  })

  Router.beforeEach((to, from, next) => {
    const auth = useAuthStore()
    const isPublic = to.meta.public === true || to.name === 'login'

    // 未登录访问业务页 → 登录页
    if (!isPublic && !auth.isAuthenticated) {
      next({ path: '/login' })
      return
    }
    // 已登录访问登录页 → 首页
    if (to.path === '/login' && auth.isAuthenticated) {
      next({ path: '/' })
      return
    }
    next()
  })

  return Router
})
