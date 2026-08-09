import { defineStore } from 'pinia'

/**
 * 巡检任务执行会话：任务页发起 → 导航页规划/画线/连跑。
 */
export const usePatrolMission = defineStore('patrol-mission', {
  state: () => ({
    /** 有待导航页接管的执行请求 */
    pending: false,
    active: false,
    paused: false,
    taskId: null,
    taskName: '',
    taskType: 'once',
    runId: null,
    /** 任务原始点位（未排序） */
    points: [],
    /** 规划后顺序 */
    ordered: [],
    index: -1,
    startedAt: null,
    /** planning | running | returning | paused | done | cancelled */
    phase: 'idle',
    returning: false
  }),

  getters: {
    currentPoint (state) {
      if (state.index < 0 || state.index >= state.ordered.length) return null
      return state.ordered[state.index]
    },
    progressLabel (state) {
      if (!state.active || !state.ordered.length) return ''
      return `${Math.max(0, state.index + 1)}/${state.ordered.length}`
    }
  },

  actions: {
    /**
     * 任务页点击「执行」
     * @param {{ id, name, type, points: Array }} payload points 需含 id/name/pose 或 x,y,yaw
     */
    requestExecute (payload) {
      const points = (payload.points || []).map((p) => normalizePoint(p)).filter(Boolean)
      if (!points.length) {
        throw new Error('empty_points')
      }
      this.pending = true
      this.active = false
      this.paused = false
      this.taskId = payload.id ?? null
      this.taskName = payload.name || ''
      this.taskType = payload.type || 'once'
      this.runId = Date.now()
      this.points = points
      this.ordered = []
      this.index = -1
      this.startedAt = new Date().toISOString().slice(0, 19).replace('T', ' ')
      this.phase = 'planning'
    },

    setOrdered (ordered) {
      this.ordered = (ordered || []).map((p) => normalizePoint(p)).filter(Boolean)
    },

    beginRunning () {
      this.pending = false
      this.active = true
      this.paused = false
      this.returning = false
      this.phase = 'running'
      this.index = -1
    },

    setIndex (i) {
      this.index = i
    },

    setReturning (v) {
      this.returning = Boolean(v)
      if (this.returning) this.phase = 'returning'
    },

    pause () {
      if (!this.active) return
      this.paused = true
      this.phase = 'paused'
    },

    resume () {
      if (!this.active) return
      this.paused = false
      this.phase = 'running'
    },

    complete (ok = true) {
      this.active = false
      this.pending = false
      this.paused = false
      this.returning = false
      this.phase = ok ? 'done' : 'cancelled'
    },

    cancel () {
      this.complete(false)
    },

    clear () {
      this.pending = false
      this.active = false
      this.paused = false
      this.taskId = null
      this.taskName = ''
      this.taskType = 'once'
      this.runId = null
      this.points = []
      this.ordered = []
      this.index = -1
      this.startedAt = null
      this.phase = 'idle'
      this.returning = false
    }
  }
})

function normalizePoint (p) {
  if (!p) return null
  if (p.pose?.position) {
    return {
      id: p.id,
      name: p.name || String(p.id),
      x: Number(p.pose.position.x) || 0,
      y: Number(p.pose.position.y) || 0,
      yaw: yawFromQuat(p.pose.orientation),
      pose: p.pose
    }
  }
  const x = Number(p.x)
  const y = Number(p.y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const yaw = Number(p.yaw) || 0
  return {
    id: p.id,
    name: p.name || String(p.id),
    x,
    y,
    yaw,
    pose: {
      position: { x, y, z: 0 },
      orientation: {
        x: 0,
        y: 0,
        z: Math.sin(yaw / 2),
        w: Math.cos(yaw / 2)
      }
    }
  }
}

function yawFromQuat (q) {
  if (!q) return 0
  return Math.atan2(
    2 * ((q.w || 0) * (q.z || 0) + (q.x || 0) * (q.y || 0)),
    1 - 2 * ((q.y || 0) ** 2 + (q.z || 0) ** 2)
  )
}
