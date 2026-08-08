/**
 * App routes. Login is outside MainLayout; everything else requires auth.
 * Pages are modular by domain: robot / vms / autotest / users
 */

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('pages/LoginPage.vue'),
    meta: { public: true }
  },
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      { path: '', name: 'main', component: () => import('pages/IndexPage.vue') },

      // ---- Robot ----
      { path: 'robot', redirect: '/robot/amr' },
      { path: 'robot/amr', name: 'robot_amr', component: () => import('pages/robot/amr.vue') },
      { path: 'robot/navigation', name: 'robot_navigation', component: () => import('pages/robot/navigation.vue') },
      { path: 'robot/joystick', name: 'robot_joystick', component: () => import('pages/robot/joystick.vue') },
      { path: 'robot/service', name: 'robot_service', component: () => import('pages/robot/service.vue') },
      { path: 'robot/param', name: 'robot_param', component: () => import('pages/robot/param.vue') },
      { path: 'robot/setting', name: 'robot_setting', component: () => import('pages/robot/setting.vue') },

      // ---- VMS ----
      { path: 'vms', redirect: '/vms/versions' },
      { path: 'vms/versions', name: 'vms_versions', component: () => import('pages/vms/versions.vue') },
      { path: 'vms/ci', name: 'vms_ci', component: () => import('pages/vms/ci.vue') },
      { path: 'vms/cd', name: 'vms_cd', component: () => import('pages/vms/cd.vue') },

      // ---- Autotest ----
      { path: 'autotest', redirect: '/autotest/runs' },
      { path: 'autotest/runs', name: 'autotest_runs', component: () => import('pages/autotest/runs.vue') },

      // ---- Users ----
      { path: 'users', redirect: '/users/users' },
      { path: 'users/users', name: 'users_users', component: () => import('pages/users/users.vue') },
      { path: 'users/roles', name: 'users_roles', component: () => import('pages/users/roles.vue') },
      { path: 'users/menus', name: 'users_menus', component: () => import('pages/users/menus.vue') },
      // legacy redirects
      { path: 'users/list', redirect: '/users/users' },
      { path: 'users/permissions', redirect: '/users/menus' }
    ]
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
