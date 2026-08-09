<script setup>
/**
 * 导航页挂载：接管巡检任务「执行」——规划排序、画完整路线、自动模式+跟随、连跑 goal。
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject, onMounted, onUnmounted, ref, watch } from 'vue'
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

let lastAdvanceAt = 0
let startedRunId = null

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

function normalizePose (raw) {
  if (!raw) return null
  const pose = raw.pose?.position ? raw.pose : raw
  if (!pose?.position) return null
  return {
    x: Number(pose.position.x) || 0,
    y: Number(pose.position.y) || 0
  }
}

function currentStart () {
  return normalizePose(robotPose?.value) ||
    normalizePose(mapManager?.pose) ||
    { x: 0, y: 0 }
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
  mapManager?.drawPatrolTour?.(poly)
  mapManager?.loadPoseList?.(ordered.map((p) => ({
    id: p.id,
    name: p.name,
    pose: p.pose
  })))
}

function advance () {
  if (!mission.active || mission.paused) return
  const next = mission.index + 1
  if (next >= mission.ordered.length) {
    Notify.create({ type: 'positive', message: t('patrol_run_done') })
    mapManager?.clearPatrolTour?.()
    mapManager?.clearNavPlan?.()
    mission.complete(true)
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

function hasRobotPose () {
  return Boolean(
    normalizePose(robotPose?.value) ||
    normalizePose(mapManager?.pose)
  )
}

function tryStartPending () {
  if (!mission.pending || !mission.points.length) return
  if (startedRunId === mission.runId) return
  // 等位姿就绪再规划，避免用 (0,0) 算错顺序
  if (!hasRobotPose()) return

  enterAutoFollow()
  const start = currentStart()
  const ordered = planPatrolOrder(start, mission.points)
  mission.setOrdered(ordered)
  drawTour(start, ordered)
  mission.beginRunning()
  startedRunId = mission.runId

  Notify.create({
    type: 'positive',
    message: t('patrol_mission_planned', {
      name: mission.taskName,
      n: ordered.length
    })
  })

  setTimeout(() => advance(), 200)
}

function resumeActiveUi () {
  if (!mission.active || !mission.ordered.length) return
  enterAutoFollow()
  const start = currentStart()
  drawTour(start, mission.ordered)
  startedRunId = mission.runId
}

function stopMission () {
  mission.cancel()
  mapManager?.clearPatrolTour?.()
  mapManager?.clearNavPlan?.()
  Notify.create({ type: 'info', message: t('patrol_run_stopped') })
}

watch(
  () => [mission.pending, mission.runId, robotPose?.value],
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

onMounted(() => {
  resumeActiveUi()
  tryStartPending()
})

onUnmounted(() => {
  lastAdvanceAt = 0
})

defineExpose({ stopMission, tryStartPending })
</script>

<template>
  <div v-if="mission.active" class="patrol-mission-bar row items-center q-gutter-sm">
    <q-icon name="route" color="white" size="20px"/>
    <div class="col text-white">
      <div class="text-subtitle2">{{ mission.taskName || $t('patrol_task_title') }}</div>
      <div class="text-caption">
        {{ $t('patrol_run_progress', { i: Math.max(1, mission.index + 1), n: mission.ordered.length }) }}
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
