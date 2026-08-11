import { defineStore } from 'pinia'

function clampBattery (n) {
  return Math.max(0, Math.min(100, Math.round(Number(n) || 0)))
}

/**
 * 机器人运行态：由 ROS `/robot_status` 推送驱动（mock_nav 默认 1Hz）。
 */
export const useRobotRuntime = defineStore('robot-runtime', {
  state: () => ({
    model: 'Demo-v1',
    version: 'v0.1.0',
    sn: 'AX-DEMO-0001',
    battery: 100,
    charging: false,
    nearCharge: false,
    online: false,
    /** idle | navigating | patrol | paused | offline */
    workState: 'idle',
    navState: 'idle',
    /** 急停（来自 /robot_status.estop 或本地下发后的乐观更新） */
    estop: false,
    locOk: true,
    edgeHit: false,
    /** 最近一次收到 /robot_status 的时间 */
    lastStatusAt: 0,
    source: 'idle'
  }),

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
    /**
     * 应用 /robot_status JSON（std_msgs/String.data）
     */
    applyStatus (raw) {
      let data = raw
      if (typeof raw === 'string') {
        try {
          data = JSON.parse(raw)
        } catch (_) {
          return
        }
      }
      if (!data || typeof data !== 'object') return

      if (data.battery != null) this.battery = clampBattery(data.battery)
      if (data.charging != null) {
        this.charging = Boolean(data.charging)
        this.nearCharge = this.charging
      }
      if (data.model) this.model = String(data.model)
      if (data.version) this.version = String(data.version)
      if (data.sn) this.sn = String(data.sn)
      if (data.online != null) this.online = Boolean(data.online)
      else this.online = true
      if (data.work_state) this.workState = String(data.work_state)
      if (data.nav_state) this.navState = String(data.nav_state)
      if (data.estop != null) this.estop = Boolean(data.estop)
      if (data.loc_ok != null) this.locOk = Boolean(data.loc_ok)
      if (data.edge_hit != null) this.edgeHit = Boolean(data.edge_hit)
      this.lastStatusAt = Date.now()
      this.source = 'ros'
    },

    setEstop (v) {
      this.estop = Boolean(v)
    },

    /** 本地巡检态覆盖（不改电量，电量以 topic 为准） */
    setWorkState (s) {
      if (!s) return
      // 有 ROS 推送时保留 navigating；巡检会话可标为 patrol/paused
      if (s === 'patrol' || s === 'paused' || s === 'offline') {
        this.workState = s
      } else if (!this.lastStatusAt || Date.now() - this.lastStatusAt > 5000) {
        this.workState = s
      }
    },

    setOnline (v) {
      this.online = Boolean(v)
      if (!this.online) this.workState = 'offline'
    },

    setNearCharge (near) {
      // 仅作 UI 兜底；有 topic 时以 charging 字段为准
      this.nearCharge = Boolean(near)
      if (!this.lastStatusAt || Date.now() - this.lastStatusAt > 3000) {
        this.charging = this.nearCharge
      }
    },

    /** @deprecated 电量由 /robot_status 驱动，保留空实现避免旧调用报错 */
    startTicker () {},
    stopTicker () {},

    shutdown () {
      this.online = false
      this.workState = 'offline'
      this.charging = false
    },

    reboot () {
      this.online = true
      this.workState = 'idle'
    }
  }
})
