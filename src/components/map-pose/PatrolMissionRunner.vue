<script setup>
/**
 * 巡检执行：从当前位姿（或充电点附近）规划 → 连跑 goal → 结束后自动返航充电。
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { getChargePoint } from 'src/api/maps'
import { listPatrolRuns, patrolRunAction } from 'src/api/patrol-tasks'
import { usePatrolMission } from 'stores/patrol-mission'
import { buildTourPolyline, planPatrolOrder } from 'src/utils/patrol-route'

const { t } = useI18n()
const mission = usePatrolMission()
const mapManager = inject('mapManager')
const robotPose = inject('robotPose')
const publish = inject('publish')
const navMode = inject('navMode', ref('auto'))
const navState = inject('navState', ref('idle'))
const pageMode = inject('pageMode', ref('default'))
const focusingUi = inject('focusingUi', null)
const syncRobotToMapCenter = inject('syncRobotToMapCenter', null)
const syncRobotToDefaultStart = inject('syncRobotToDefaultStart', null)
const syncRobotToPose = inject('syncRobotToPose', null)
const mapReady = inject('mapReady', ref(false))
const loadedMapId = inject('loadedMapId', ref(null))

let lastAdvanceAt = 0
let startedRunId = null
let claimTimer = null
/** 巡检点跑完后正在返回充电点 */
const returningHome = ref(false)
const chargePoint = ref(null)

const CHARGE_NEAR_M = 0.35
/** 认领调度器提升为 running、但前端尚未接管的任务 */
const CLAIM_POLL_MS = 12000

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

function chargeAsGoal () {
  const c = chargePoint.value
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
  const c = chargePoint.value
  if (!xy || !c) return false
  return Math.hypot(xy.x - c.x, xy.y - c.y) <= CHARGE_NEAR_M
}

/** mock 仍停在 (0,0) 且地图中心远离原点 → 不可信 */
function isPoseTrusted (p) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false
  const c = mapManager?.mapCenter?.()
  if (!c) return true
  const nearOrigin = Math.hypot(p.x, p.y) < 0.2
  const centerFar = Math.hypot(c.x, c.y) > 0.5
  return !(nearOrigin && centerFar)
}

/** 位姿不可信时：优先充电点，否则地图中心（并纠正 mock） */
async function placeAtDefaultStart () {
  if (typeof syncRobotToDefaultStart === 'function') {
    const p = await syncRobotToDefaultStart({ publishInitial: true })
    if (p) return { x: p.x, y: p.y, yaw: p.yaw || 0 }
  }
  // 同步兜底：已缓存的充电点 / 地图中心
  const c = chargePoint.value
  if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) {
    if (typeof syncRobotToPose === 'function') {
      const p = syncRobotToPose({ x: c.x, y: c.y, yaw: c.yaw || 0 }, { publishInitial: true })
      if (p) return { x: p.x, y: p.y, yaw: p.yaw || 0 }
    }
    return { x: c.x, y: c.y, yaw: c.yaw || 0 }
  }
  if (typeof syncRobotToMapCenter === 'function') {
    const p = syncRobotToMapCenter({ publishInitial: true })
    if (p) return { x: p.x, y: p.y, yaw: p.yaw || 0 }
  }
  const mid = mapManager?.mapCenter?.()
  return mid ? { x: mid.x, y: mid.y, yaw: 0 } : null
}

/**
 * 执行起点 = 当前真实位姿；仅当 mock 未对齐时落到充电点（无则中心）
 */
async function resolveStart () {
  const live = normalizePose(robotPose?.value) || normalizePose(mapManager?.pose)
  if (isPoseTrusted(live)) {
    return { x: live.x, y: live.y, yaw: live.yaw || 0 }
  }
  return placeAtDefaultStart()
}

function publishGoal (point) {
  if (!point?.pose) return
  publish('/goal_pose', {
    header: stampHeader(),
    pose: {
      position: { ...point.pose.position },
      orientation: { ...point.pose.orientation }
    }
  })
  mapManager?.updateTargetPose?.(point.pose)
}

function enterAutoFollow () {
  if (navMode) navMode.value = 'auto'
  if (pageMode) pageMode.value = 'default'
  mapManager.focusing = true
  if (focusingUi) focusingUi.value = true
  // 跟随前先铺满全图，避免局部放大看不到巡检路线全貌
  mapManager.zoomToFit?.()
}

function drawTour (start, ordered) {
  const poly = buildTourPolyline(start, ordered)
  const charge = chargePoint.value
  if (charge) {
    poly.push({ x: charge.x, y: charge.y })
  }
  mapManager?.drawPatrolTour?.(poly)
  mapManager?.loadPoseList?.(ordered.map((p) => ({
    id: p.id,
    name: p.name,
    pose: p.pose
  })))
  if (charge) {
    mapManager?.drawChargeMarker?.({
      ...charge,
      name: charge.name || t('charge_point')
    })
  }
}

async function ensureChargePoint () {
  if (mission.charge) {
    chargePoint.value = mission.charge
    return chargePoint.value
  }
  const mapId = loadedMapId?.value
  if (!mapId) {
    chargePoint.value = null
    return null
  }
  try {
    chargePoint.value = await getChargePoint(mapId)
  } catch (e) {
    console.warn('[PatrolMission] getChargePoint failed', e)
    chargePoint.value = null
  }
  return chargePoint.value
}

async function syncRunAction (action, extra = {}) {
  if (!mission.runId || typeof mission.runId !== 'number') return null
  try {
    return await patrolRunAction(mission.runId, action, extra)
  } catch (e) {
    console.warn('[PatrolMission] run action failed', action, e)
    return null
  }
}

function takeNextRun (resp) {
  const next = resp?.next_run || resp?.nextRun
  if (!next?.id) return
  try {
    mission.requestFromRun(next)
  } catch (e) {
    console.warn('[PatrolMission] claim next run failed', e)
  }
}

/**
 * 定时任务到点入池后，后端可能已将 waiting→running；
 * 若当前无本地会话，则认领并开跑（调度接力 / 页面重开）。
 */
async function claimOrphanedRunning () {
  if (mission.active || mission.pending) return
  const mapId = loadedMapId?.value
  if (!mapId) return
  try {
    const runs = await listPatrolRuns({ mapId, status: 'running' })
    const orphan = (runs || []).find((r) => r?.id && r.id !== startedRunId)
    if (!orphan) return
    mission.requestFromRun(orphan)
    Notify.create({
      type: 'info',
      message: t('patrol_task_execute_jump', { name: orphan.name || orphan.task_name || '' })
    })
  } catch (e) {
    console.warn('[PatrolMission] claim orphaned run failed', e)
  }
}

function restoreMapAfterMission () {
  if (focusingUi) focusingUi.value = false
  mapManager?.clearPatrolTour?.()
  mapManager?.clearNavPlan?.()
  mapManager?.restoreMapOverview?.()
}

async function finishMissionOk (msgKey) {
  returningHome.value = false
  const resp = await syncRunAction('complete', { result_ok: true, progress_index: mission.index })
  mission.complete(true)
  mapManager?.clearPatrolTour?.()
  mapManager?.clearNavPlan?.()
  Notify.create({ type: 'positive', message: t(msgKey) })
  takeNextRun(resp)
  if (!mission.pending) restoreMapAfterMission()
}

function beginReturnHome () {
  const goal = chargeAsGoal()
  if (!goal) {
    finishMissionOk('patrol_run_done')
    return
  }
  returningHome.value = true
  mission.setReturning?.(true)
  publishGoal(goal)
  Notify.create({
    type: 'info',
    message: t('patrol_return_charge')
  })
}

function advance () {
  if (!mission.active || mission.paused) return

  if (returningHome.value) {
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
  if (!mission.pending || !mission.points.length) return
  if (startedRunId === mission.runId) return
  if (!mapReady?.value && !mapManager?.mapInfo) return

  enterAutoFollow()
  await ensureChargePoint()

  const start = await resolveStart()
  if (!start) return

  let ordered
  if (mission.useServerOrder && mission.ordered.length) {
    ordered = mission.ordered
  } else {
    ordered = planPatrolOrder(start, mission.points)
    mission.setOrdered(ordered)
  }

  // 用真实位姿回写规划（便于任务结果核对）
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

  drawTour(start, ordered)
  mission.beginRunning()
  returningHome.value = false
  startedRunId = mission.runId

  const fromCharge = nearCharge(start)
  Notify.create({
    type: 'positive',
    message: t(fromCharge ? 'patrol_mission_from_charge' : 'patrol_mission_from_current', {
      name: mission.taskName,
      n: ordered.length
    })
  })

  // 恢复：继续当前目标点；新建：从第一个点开始
  if (mission.index >= 0 && mission.index < ordered.length) {
    publishGoal(ordered[mission.index])
  } else {
    setTimeout(() => advance(), 280)
  }
}

async function resumeActiveUi () {
  if (!mission.active || !mission.ordered.length) return
  enterAutoFollow()
  await ensureChargePoint()
  const live = resolveStart() || { x: 0, y: 0 }
  drawTour(live, mission.ordered)
  startedRunId = mission.runId
}

async function pauseMission () {
  mission.pause()
  await syncRunAction('pause')
}

async function resumeMission () {
  mission.resume()
  await syncRunAction('resume')
}

async function stopMission () {
  returningHome.value = false
  const resp = await syncRunAction('cancel')
  mission.cancel()
  mapManager?.clearPatrolTour?.()
  mapManager?.clearNavPlan?.()
  Notify.create({ type: 'info', message: t('patrol_run_stopped') })
  takeNextRun(resp)
  if (!mission.pending) restoreMapAfterMission()
}

// 任务结果页取消等：会话结束后也恢复全图格栅
watch(
  () => mission.active,
  (active, was) => {
    if (was && !active && !mission.pending) {
      restoreMapAfterMission()
    }
  }
)

watch(
  () => [mission.pending, mission.runId, mapReady?.value, loadedMapId?.value],
  () => { tryStartPending() },
  { deep: true, immediate: true }
)

watch(navState, (state, prev) => {
  if (!mission.active || mission.paused) return
  const hit = state === 'arrived' || (prev === 'navigating' && state === 'idle')
  if (!hit) return
  const now = Date.now()
  if (now - lastAdvanceAt < 400) return
  lastAdvanceAt = now
  setTimeout(() => advance(), 150)
})

watch(() => loadedMapId?.value, () => {
  ensureChargePoint().then((c) => {
    if (c) mapManager?.drawChargeMarker?.(c)
    else mapManager?.clearChargeMarker?.()
  })
})

onMounted(() => {
  resumeActiveUi()
  tryStartPending()
  void claimOrphanedRunning()
  claimTimer = setInterval(() => { void claimOrphanedRunning() }, CLAIM_POLL_MS)
  ensureChargePoint().then((c) => {
    if (c) mapManager?.drawChargeMarker?.(c)
  })
})

onUnmounted(() => {
  lastAdvanceAt = 0
  if (claimTimer) {
    clearInterval(claimTimer)
    claimTimer = null
  }
})

defineExpose({ stopMission, tryStartPending, ensureChargePoint })
</script>

<template>
  <div v-if="mission.active" class="patrol-mission-bar row items-center q-gutter-sm">
    <q-icon name="route" color="white" size="20px"/>
    <div class="col text-white">
      <div class="text-subtitle2">{{ mission.taskName || $t('patrol_task_title') }}</div>
      <div class="text-caption">
        <template v-if="returningHome">
          {{ $t('patrol_return_charge') }}
        </template>
        <template v-else>
          {{ $t('patrol_run_progress', { i: Math.max(1, mission.index + 1), n: mission.ordered.length }) }}
        </template>
        <span v-if="mission.paused"> · {{ $t('patrol_task_status_paused') }}</span>
      </div>
    </div>
    <q-btn
      v-if="!mission.paused"
      dense unelevated color="warning" text-color="dark"
      icon="pause" :label="$t('patrol_task_pause')"
      @click="pauseMission"
    />
    <q-btn
      v-else
      dense unelevated color="positive"
      icon="play_arrow" :label="$t('patrol_task_resume')"
      @click="resumeMission"
    />
    <q-btn
      dense unelevated color="negative"
      icon="stop" :label="$t('patrol_run_stop')"
      @click="stopMission"
    />
  </div>
</template>

<style scoped>
.patrol-mission-bar {
  position: absolute;
  top: 0.65rem;
  left: 0.65rem;
  z-index: 20;
  max-width: min(26rem, calc(100% - 1.5rem));
  padding: 0.5rem 0.75rem;
  border-radius: 10px;
  background: rgba(0, 105, 92, 0.92);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}
</style>
