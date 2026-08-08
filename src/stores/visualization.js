import { defineStore } from 'pinia'

export const useVisualization = defineStore('visualization', {
  state: () => ({
    // Nav2 通车前默认关闭：旧默认 /move_base/NavfnROS/plan 不存在，会刷 rosbridge 报错
    pathEnable: false,
    pathTopic: '/plan',
    trajectoryEnable: false,
    trajectoryTopic: '/robot_path',
    laserScanEnable: false,
    laserScanTopic: '/scan',
    costMapEnable: false,
    costMapTopic: '/local_costmap/costmap'
  }),
  persist: {
    enabled: true,
    strategies: [
      {
        key: 'visualization',
        storage: localStorage,
        paths: [
          'pathEnable',
          'pathTopic',
          'trajectoryEnable',
          'trajectoryTopic',
          'laserScanEnable',
          'laserScanTopic',
          'costMapEnable',
          'costMapTopic'
        ]
      }
    ]
  }
})
