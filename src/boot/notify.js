import { Notify } from 'quasar'

// 全局提示：右上角，避免挡住底部地图工具栏
Notify.setDefaults({
  position: 'top-right',
  timeout: 2500,
  textColor: 'white',
  actions: [{ icon: 'close', color: 'white', round: true, dense: true }]
})
