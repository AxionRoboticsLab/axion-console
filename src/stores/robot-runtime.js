import { defineStore } from 'pinia'

const STORAGE_KEY = 'axion.robot.runtime.v1'
const TICK_MS = 60_000

function loadPersisted () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (_) {
    return null
  }
}

function clampBattery (n) {
  return Math.max(0, Math.min(100, Math.round(n)))
}

/**
 * 机器人运行态（前端 mock）：电量、充电、机型信息。
 * 在充电点附近 → 充电中，每分钟 +1%；否则每分钟 -1%。
 */
export const useRobotRuntime = defineStore('robot-runtime', {
  state: () => {
    const saved = loadPersisted()
    return {
      model: 'Demo-v1',
      version: 'v0.1.0',
      sn: 'AX-DEMO-0001',
      battery: saved?.battery != null ? clampBattery(saved.battery) : 100,
      charging: false,
      nearCharge: false,
      online: true,
      /** idle | navigating | patrol | paused | offline */
      workState: 'idle',
      lastTickAt: saved?.lastTickAt || Date.now(),
      _timer: null
    }
  },

  getters: {
    batteryLabel (state) {
      return `${state.battery}%`
    },
    chargeStatusLabel (state) {
      if (state.charging || state.nearCharge) return 'charging'
      return 'discharging'
    },
    batteryIcon (state) {
      if (state.charging || state.nearCharge) return 'battery_charging_full'
      if (state.battery >= 85) return 'battery_full'
      if (state.battery >= 40) return 'battery_std'
      if (state.battery >= 15) return 'battery_alert'
      return 'battery_alert'
    },
    batteryColor (state) {
      if (state.charging || state.nearCharge) return 'positive'
      if (state.battery <= 15) return 'negative'
      if (state.battery <= 30) return 'warning'
      return 'white'
    }
  },

  actions: {
    persist () {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          battery: this.battery,
          lastTickAt: this.lastTickAt
        }))
      } catch (_) { /* ignore */ }
    },

    /** 根据距上次 tick 的分钟数补算电量（切页/刷新也生效） */
    catchUpTicks () {
      const now = Date.now()
      const elapsed = now - (this.lastTickAt || now)
      const mins = Math.floor(elapsed / TICK_MS)
      if (mins <= 0) return
      const delta = (this.charging || this.nearCharge) ? mins : -mins
      this.battery = clampBattery(this.battery + delta)
      this.lastTickAt += mins * TICK_MS
      this.persist()
    },

    tickOnce () {
      this.catchUpTicks()
      const now = Date.now()
      if (now - this.lastTickAt < TICK_MS - 500) return
      const delta = (this.charging || this.nearCharge) ? 1 : -1
      this.battery = clampBattery(this.battery + delta)
      this.lastTickAt = now
      this.persist()
    },

    setNearCharge (near) {
      const v = Boolean(near)
      if (this.nearCharge === v && this.charging === v) return
      this.catchUpTicks()
      this.nearCharge = v
      this.charging = v
    },

    setWorkState (s) {
      this.workState = s || 'idle'
    },

    setOnline (v) {
      this.online = Boolean(v)
      if (!this.online) this.workState = 'offline'
    },

    startTicker () {
      if (this._timer) return
      this.catchUpTicks()
      this._timer = setInterval(() => this.tickOnce(), TICK_MS)
    },

    stopTicker () {
      if (this._timer) {
        clearInterval(this._timer)
        this._timer = null
      }
    },

    /** mock 关机 */
    shutdown () {
      this.online = false
      this.workState = 'offline'
      this.charging = false
    },

    /** mock 重启 */
    reboot () {
      this.online = true
      this.workState = 'idle'
      this.battery = clampBattery(this.battery)
      this.lastTickAt = Date.now()
      this.persist()
    }
  }
})
