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
    id: 'home',
    title: 'home',
    caption: 'home_description',
    icon: 'home',
    link: '/',
    children: [
      {
        title: 'home',
        caption: 'home_description',
        icon: 'dashboard',
        link: '/'
      }
    ]
  },
  {
    id: 'robot',
    title: 'robot',
    caption: 'robot_description',
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
        title: 'router_amr_nav',
        caption: 'router_amr_nav_description',
        icon: 'near_me',
        link: '/robot/navigation'
      },
      {
        title: 'router_patrol_task',
        caption: 'router_patrol_task_description',
        icon: 'route',
        link: '/robot/patrol-tasks'
      },
      {
        title: 'router_alarms',
        caption: 'router_alarms_description',
        icon: 'notifications_active',
        link: '/robot/alarms'
      }
    ]
  },
  {
    id: 'vms',
    title: 'vms',
    caption: 'vms_description',
    icon: 'inventory_2',
    link: '/vms',
    children: [
      {
        title: 'vms_versions',
        caption: 'vms_versions_description',
        icon: 'new_releases',
        link: '/vms/versions'
      },
      {
        title: 'vms_ci',
        caption: 'vms_ci_description',
        icon: 'cloud_sync',
        link: '/vms/ci'
      },
      {
        title: 'vms_cd',
        caption: 'vms_cd_description',
        icon: 'rocket_launch',
        link: '/vms/cd'
      }
    ]
  },
  {
    id: 'test_center',
    title: 'test_center',
    caption: 'test_center_description',
    icon: 'verified',
    link: '/autotest',
    children: [
      {
        title: 'test_center_runs',
        caption: 'test_center_runs_description',
        icon: 'playlist_add_check',
        link: '/autotest/runs'
      }
    ]
  },
  {
    id: 'user_center',
    title: 'user_center',
    caption: 'user_center_description',
    icon: 'manage_accounts',
    link: '/users',
    children: [
      {
        title: 'user_center_users',
        caption: 'user_center_users_description',
        icon: 'group',
        link: '/users/users'
      },
      {
        title: 'user_center_roles',
        caption: 'user_center_roles_description',
        icon: 'badge',
        link: '/users/roles'
      },
      {
        title: 'user_center_permissions',
        caption: 'user_center_permissions_description',
        icon: 'menu',
        link: '/users/menus'
      }
    ]
  }
]
