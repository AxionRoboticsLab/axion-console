<script setup>
/**
 * 巡检执行：从当前位姿（或充电点附近）规划 → 连跑 goal → 结束后自动返航充电。
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { getChargePoint } from 'src/api/maps'
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
const mapReady = inject('mapReady', ref(false))
const loadedMapId = inject('loadedMapId', ref(null))

let lastAdvanceAt = 0
let startedRunId = null
/** 巡检点跑完后正在返回充电点 */
const returningHome = ref(false)
const chargePoint = ref(null)

const CHARGE_NEAR_M = 0.35

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

function startAtMapCenter () {
  if (typeof syncRobotToMapCenter === 'function') {
    const c = syncRobotToMapCenter({ publishInitial: true })
    if (c) return { x: c.x, y: c.y, yaw: 0 }
  }
  return null
}

/** 优先当前位姿；不在充电点就从当前位置出发 */
function resolveStart () {
  const live = normalizePose(robotPose?.value) || normalizePose(mapManager?.pose)
  if (isPoseTrusted(live)) {
    return { x: live.x, y: live.y, yaw: live.yaw || 0 }
  }
  // 位姿未同步时落到地图中心，避免用 mock 默认 (0,0) 画错线
  return startAtMapCenter() || mapManager?.mapCenter?.() || null
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
    mapManager?.drawChargeMarker?.(charge)
  }
}

async function ensureChargePoint () {
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

function finishMissionOk (msgKey) {
  returningHome.value = false
  mission.complete(true)
  mapManager?.clearPatrolTour?.()
  mapManager?.clearNavPlan?.()
  Notify.create({ type: 'positive', message: t(msgKey) })
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

  const start = resolveStart()
  if (!start) return

  const ordered = planPatrolOrder(start, mission.points)
  mission.setOrdered(ordered)
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

  setTimeout(() => advance(), 280)
}

async function resumeActiveUi () {
  if (!mission.active || !mission.ordered.length) return
  enterAutoFollow()
  await ensureChargePoint()
  const live = resolveStart() || { x: 0, y: 0 }
  drawTour(live, mission.ordered)
  startedRunId = mission.runId
}

function stopMission () {
  returningHome.value = false
  mission.cancel()
  mapManager?.clearPatrolTour?.()
  mapManager?.clearNavPlan?.()
  Notify.create({ type: 'info', message: t('patrol_run_stopped') })
}

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
  ensureChargePoint().then((c) => {
    if (c) mapManager?.drawChargeMarker?.(c)
  })
})

onUnmounted(() => {
  lastAdvanceAt = 0
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
        <span v-if="mission.paused"> · {{ $t('patrol_task_status_waiting') }}</span>
      </div>
    </div>
    <q-btn
      v-if="!mission.paused"
      dense unelevated color="warning" text-color="dark"
      icon="pause" :label="$t('patrol_task_pause')"
      @click="mission.pause()"
    />
    <q-btn
      v-else
      dense unelevated color="positive"
      icon="play_arrow" :label="$t('patrol_task_execute')"
      @click="mission.resume()"
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
