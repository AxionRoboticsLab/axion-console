export default function (type) {
  switch (type) {
    case 'modules':
      return moduleLinks
    case 'basic':
      return moduleLinks.find((m) => m.id === 'robot')?.children || []
    default:
      return []
  }
}

const moduleLinks = [
  {
    id: 'robot',
    title: 'nav_robot',
    caption: 'nav_robot_description',
    icon: 'smart_toy',
    link: '/robot',
    children: [
      {
        title: 'router_amr_2d',
        caption: 'router_amr_2d_description',
        icon: 'map',
        link: '/robot/amr'
      },
      {
        title: 'router_joystick',
        caption: 'router_joystick_description',
        icon: 'sports_esports',
        link: '/robot/joystick'
      },
      {
        title: 'router_service',
        caption: 'router_service_description',
        icon: 'settings_phone',
        link: '/robot/service'
      },
      {
        title: 'router_param',
        caption: 'router_param_description',
        icon: 'tune',
        link: '/robot/param'
      },
      {
        title: 'router_setting',
        caption: 'router_setting_description',
        icon: 'settings',
        link: '/robot/setting'
      }
    ]
  },
  {
    id: 'vms',
    title: 'nav_vms',
    caption: 'nav_vms_description',
    icon: 'inventory_2',
    link: '/vms',
    children: [
      {
        title: 'nav_vms_versions',
        caption: 'nav_vms_versions_description',
        icon: 'new_releases',
        link: '/vms/versions'
      },
      {
        title: 'nav_vms_ci',
        caption: 'nav_vms_ci_description',
        icon: 'cloud_sync',
        link: '/vms/ci'
      },
      {
        title: 'nav_vms_cd',
        caption: 'nav_vms_cd_description',
        icon: 'rocket_launch',
        link: '/vms/cd'
      }
    ]
  },
  {
    id: 'autotest',
    title: 'nav_autotest',
    caption: 'nav_autotest_description',
    icon: 'verified',
    link: '/autotest',
    children: [
      {
        title: 'nav_autotest_runs',
        caption: 'nav_autotest_runs_description',
        icon: 'playlist_add_check',
        link: '/autotest/runs'
      }
    ]
  },
  {
    id: 'users',
    title: 'nav_users',
    caption: 'nav_users_description',
    icon: 'manage_accounts',
    link: '/users',
    children: [
      {
        title: 'nav_users_list',
        caption: 'nav_users_list_description',
        icon: 'group',
        link: '/users/list'
      },
      {
        title: 'nav_users_roles',
        caption: 'nav_users_roles_description',
        icon: 'badge',
        link: '/users/roles'
      },
      {
        title: 'nav_users_permissions',
        caption: 'nav_users_permissions_description',
        icon: 'admin_panel_settings',
        link: '/users/permissions'
      }
    ]
  }
]
