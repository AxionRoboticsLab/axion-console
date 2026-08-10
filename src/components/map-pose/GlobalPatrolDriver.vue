<script setup>
/**
 * 全局巡检执行：登录后常驻。
 * - 在「实时监控」页时不抢跑（由 PatrolMissionRunner 发 goal，便于跟随画面）
 * - 其它页面时认领 running/waiting 并发目标（定时任务无需跳转）
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getChargePoint, listMaps } from 'src/api/maps'
import { listPatrolRuns, patrolRunAction } from 'src/api/patrol-tasks'
import RosClient from 'components/ros/RosClient'
import { useAuthStore } from 'stores/auth'
import { usePatrolMission } from 'stores/patrol-mission'
import { planPatrolOrder } from 'src/utils/patrol-route'

defineOptions({ name: 'GlobalPatrolDriver' })

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const mission = usePatrolMission()
const ros = RosClient()

const enabled = computed(() => Boolean(auth.isAuthenticated))
const onMonitor = computed(() => {
  const name = route.name
  const path = route.path || ''
  return name === 'robot_monitor' || path.includes('/robot/monitor')
})

let lastAdvanceAt = 0
let startedRunId = null
let claimTimer = null
let returningHome = false
let chargePoint = null
let activeMapId = null

const CHARGE_NEAR_M = 0.35
const CLAIM_POLL_MS = 8000

function stampHeader () {
  const now = Date.now()
  return {
    frame_id: 'map',
    stamp: {
      sec: Math.floor(now / 1000),
      nanosec: (now % 1000) * 1e6
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

function normalizePose (raw) {
  if (!raw) return null
  const pose = raw.pose?.position ? raw.pose : raw
  if (!pose?.position) return null
  return {
    x: Number(pose.position.x) || 0,
    y: Number(pose.position.y) || 0,
    yaw: yawFromQuat(pose.orientation)
  }
}

function quatFromYaw (yaw) {
  return {
    x: 0,
    y: 0,
    z: Math.sin(yaw / 2),
    w: Math.cos(yaw / 2)
  }
}

function publishGoal (point) {
  if (!point?.pose) return
  ros.publish('/goal_pose', {
    header: stampHeader(),
    pose: {
      position: { ...point.pose.position },
      orientation: { ...point.pose.orientation }
    }
  })
}

function chargeAsGoal () {
  const c = chargePoint
  if (!c) return null
  return {
    id: 'charge',
    name: c.name || t('charge_point'),
    pose: {
      position: { x: c.x, y: c.y, z: 0 },
      orientation: quatFromYaw(c.yaw || 0)
    }
  }
}

function nearCharge (xy) {
  const c = chargePoint
  if (!xy || !c) return false
  return Math.hypot(xy.x - c.x, xy.y - c.y) <= CHARGE_NEAR_M
}

async function refreshActiveMap () {
  try {
    const maps = await listMaps()
    const active = (maps || []).find((m) => m.status === 1) || (maps || [])[0]
    activeMapId = active?.id ?? null
  } catch (_) {
    activeMapId = null
  }
}

async function ensureChargePoint () {
  if (mission.charge) {
    chargePoint = mission.charge
    return chargePoint
  }
  const mapId = activeMapId || mission.mapId
  if (!mapId) {
    chargePoint = null
    return null
  }
  try {
    chargePoint = await getChargePoint(mapId)
  } catch (_) {
    chargePoint = null
  }
  return chargePoint
}

function resolveStart () {
  const live = normalizePose(ros.robotPose?.value)
  if (live && Number.isFinite(live.x) && Number.isFinite(live.y)) {
    if (Math.hypot(live.x, live.y) >= 0.2) return live
  }
  if (chargePoint && Number.isFinite(chargePoint.x)) {
    return { x: chargePoint.x, y: chargePoint.y, yaw: chargePoint.yaw || 0 }
  }
  return live || { x: 0, y: 0, yaw: 0 }
}

async function syncRunAction (action, extra = {}) {
  if (!mission.runId || typeof mission.runId !== 'number') return null
  try {
    return await patrolRunAction(mission.runId, action, extra)
  } catch (e) {
    console.warn('[GlobalPatrol] run action failed', action, e)
    return null
  }
}

function takeNextRun (resp) {
  const next = resp?.next_run || resp?.nextRun
  if (!next?.id) return
  try {
    mission.requestFromRun(next, { drive: true })
  } catch (e) {
    console.warn('[GlobalPatrol] claim next failed', e)
  }
}

async function claimOrphanedRunning () {
  if (!enabled.value || onMonitor.value) return
  if (mission.active || mission.pending) return
  await refreshActiveMap()
  if (!activeMapId) return
  try {
    let runs = await listPatrolRuns({ mapId: activeMapId, status: 'running' })
    let orphan = (runs || []).find((r) => r?.id && r.id !== startedRunId)
    if (!orphan) {
      runs = await listPatrolRuns({ mapId: activeMapId, status: 'waiting' })
      const waiting = (runs || [])[0]
      if (waiting?.id) {
        try {
          orphan = await patrolRunAction(waiting.id, 'start')
        } catch (_) {
          orphan = null
        }
      }
    }
    if (!orphan?.id) return
    mission.requestFromRun(orphan, { drive: true })
    Notify.create({
      type: 'info',
      message: t('patrol_task_started_background', { name: orphan.name || orphan.task_name || '' })
    })
  } catch (e) {
    console.warn('[GlobalPatrol] claim failed', e)
  }
}

async function finishMissionOk (msgKey) {
  returningHome = false
  const resp = await syncRunAction('complete', { result_ok: true, progress_index: mission.index })
  mission.complete(true)
  Notify.create({ type: 'positive', message: t(msgKey) })
  takeNextRun(resp)
}

function beginReturnHome () {
  const goal = chargeAsGoal()
  if (!goal) {
    finishMissionOk('patrol_run_done')
    return
  }
  returningHome = true
  mission.setReturning?.(true)
  publishGoal(goal)
  Notify.create({ type: 'info', message: t('patrol_return_charge') })
}

function advance () {
  if (onMonitor.value) return
  if (!mission.active || mission.paused) return
  if (returningHome) {
    finishMissionOk('patrol_return_charge_done')
    return
  }
  const next = mission.index + 1
  if (next >= mission.ordered.length) {
    beginReturnHome()
    return
  }
  mission.setIndex(next)
  void syncRunAction('progress', { progress_index: next })
  const point = mission.ordered[next]
  publishGoal(point)
  Notify.create({
    type: 'info',
    message: t('patrol_run_next', {
      name: point.name,
      i: next + 1,
      n: mission.ordered.length
    })
  })
}

async function tryStartPending () {
  if (!enabled.value || onMonitor.value) return
  if (!mission.pending || !mission.points.length) return
  if (startedRunId === mission.runId) return
  if (!mission.driveLocal && mission.phase === 'idle') {
    mission.driveLocal = true
  }

  await refreshActiveMap()
  await ensureChargePoint()
  const start = resolveStart()

  let ordered
  if (mission.useServerOrder && mission.ordered.length) {
    ordered = mission.ordered
  } else {
    ordered = planPatrolOrder(start, mission.points)
    mission.setOrdered(ordered)
  }

  if (typeof mission.runId === 'number') {
    void syncRunAction('replan', {
      start_x: start.x,
      start_y: start.y,
      start_yaw: start.yaw || 0,
      ordered: ordered.map((p) => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        yaw: p.yaw || 0
      }))
    })
  }

  mission.beginRunning()
  returningHome = false
  startedRunId = mission.runId

  Notify.create({
    type: 'positive',
    message: t(nearCharge(start) ? 'patrol_mission_from_charge' : 'patrol_mission_from_current', {
      name: mission.taskName,
      n: ordered.length
    })
  })

  if (mission.index >= 0 && mission.index < ordered.length) {
    publishGoal(ordered[mission.index])
  } else {
    setTimeout(() => advance(), 280)
  }
}

watch(
  () => [mission.pending, mission.runId, enabled.value, onMonitor.value],
  () => { void tryStartPending() },
  { deep: true, immediate: true }
)

watch(
  () => ros.navState?.value,
  (state, prev) => {
    if (onMonitor.value) return
    if (!mission.active || mission.paused || !mission.driveLocal) return
    const hit = state === 'arrived' || (prev === 'navigating' && state === 'idle')
    if (!hit) return
    const now = Date.now()
    if (now - lastAdvanceAt < 400) return
    lastAdvanceAt = now
    setTimeout(() => advance(), 150)
  }
)

watch(enabled, (on) => {
  if (on) {
    ros.init()
    ros.subscribe('/robot_pose')
    ros.subscribe('/nav_state')
    void claimOrphanedRunning()
  }
}, { immediate: true })

onMounted(() => {
  if (!enabled.value) return
  ros.init()
  ros.subscribe('/robot_pose')
  ros.subscribe('/nav_state')
  void claimOrphanedRunning()
  claimTimer = setInterval(() => { void claimOrphanedRunning() }, CLAIM_POLL_MS)
})

onUnmounted(() => {
  if (claimTimer) {
    clearInterval(claimTimer)
    claimTimer = null
  }
})
</script>

<template>
  <span class="global-patrol-driver" hidden aria-hidden="true"/>
</template>
