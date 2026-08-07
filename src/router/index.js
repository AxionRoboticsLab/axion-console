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

    if (!isPublic && !auth.isAuthenticated) {
      next({ path: '/login', query: { redirect: to.fullPath } })
      return
    }
    if (to.path === '/login' && auth.isAuthenticated) {
      next({ path: '/' })
      return
    }
    next()
  })

  return Router
})
