import { Notify } from 'quasar'

// 全局提示：右上角、顶栏下方（偏移见 app.scss --app-notify-top）
Notify.setDefaults({
  position: 'top-right',
  timeout: 2500,
  textColor: 'white',
  actions: [{ icon: 'close', color: 'white', round: true, dense: true }]
})
