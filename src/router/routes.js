/**
 * App routes. Login is outside MainLayout; everything else requires auth.
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
      { path: 'robot/amr', name: 'robot_amr', component: () => import('pages/AmrControl.vue') },
      { path: 'robot/joystick', name: 'robot_joystick', component: () => import('pages/JoystickPage.vue') },
      { path: 'robot/service', name: 'robot_service', component: () => import('pages/RosService.vue') },
      { path: 'robot/param', name: 'robot_param', component: () => import('pages/RosParam.vue') },
      { path: 'robot/setting', name: 'robot_setting', component: () => import('pages/SettingPage.vue') },

      // ---- VMS ----
      { path: 'vms', redirect: '/vms/versions' },
      { path: 'vms/versions', name: 'vms_versions', component: () => import('pages/vms/VersionsPage.vue') },
      { path: 'vms/ci', name: 'vms_ci', component: () => import('pages/vms/CiPage.vue') },
      { path: 'vms/cd', name: 'vms_cd', component: () => import('pages/vms/CdPage.vue') },

      // ---- Autotest ----
      { path: 'autotest', redirect: '/autotest/runs' },
      { path: 'autotest/runs', name: 'autotest_runs', component: () => import('pages/autotest/RunsPage.vue') },

      // ---- Users ----
      { path: 'users', redirect: '/users/list' },
      { path: 'users/list', name: 'users_list', component: () => import('pages/users/UsersPage.vue') },
      { path: 'users/roles', name: 'users_roles', component: () => import('pages/users/RolesPage.vue') },
      { path: 'users/menus', name: 'users_menus', component: () => import('pages/users/MenusPage.vue') },
      { path: 'users/permissions', redirect: '/users/menus' }
    ]
  },
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue')
  }
]

export default routes
