import { defineStore } from 'pinia'

export const useVisualization = defineStore('visualization', {
  state: () => ({
    // axion-nav mock 发布 /plan；旧 localStorage 若仍关 path，可在可视化设置打开
    pathEnable: true,
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
