<script setup>

import { computed, inject, provide, onMounted, onUnmounted, ref, watch, useSlots } from 'vue'

import RosMapPixi from 'components/amr-control/RosMapPixi'
import RobotRelocate from 'components/amr-control/RobotRelocate.vue'
import MapSelector from 'components/amr-control/MapSelector.vue'
import MapCreate from 'components/amr-control/MapCreate.vue'
import PoseManager from 'components/map-pose/PoseManager.vue'
import PatrolMissionRunner from 'components/map-pose/PatrolMissionRunner.vue'
import { getActiveMap, getChargePoint, setChargePoint } from 'src/api/maps'
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useControlParams } from 'stores/control-params'
import { useRobotRuntime } from 'stores/robot-runtime'
import { usePatrolMission } from 'stores/patrol-mission'
import { useVisualization } from 'stores/visualization'
import TerminateProcess from 'components/amr-control/TerminateProcess.vue'

const props = defineProps({
  /** 'mapping' 建图页 | 'monitor' 实时监控 */
  workspace: {
    type: String,
    default: 'mapping',
    validator: (v) => ['mapping', 'monitor'].includes(v)
  }
})

const slots = useSlots()
const { t } = useI18n()
const $q = useQuasar()

const isMappingWorkspace = computed(() => props.workspace === 'mapping')
const isMonitorWorkspace = computed(() => props.workspace === 'monitor')
provide('workspace', computed(() => props.workspace))

const rosClient = inject('rosClient')
const connected = inject('connected')
const mapState = inject('mapState')
const visualization = useVisualization()
const controlParam = useControlParams()
const robotRuntime = useRobotRuntime()
const patrolMission = usePatrolMission()
const chargePose = ref(null)
const CHARGE_NEAR_M = 0.35

const mapBoardVisible = inject('mapBoardVisible', ref(props.workspace === 'monitor'))
const mapReady = inject('mapReady', ref(false))
const keepMapOnIdle = ref(props.workspace === 'monitor')
provide('keepMapOnIdle', keepMapOnIdle)
const loadedMapName = ref('')
const loadedMapId = ref(null)
provide('loadedMapName', loadedMapName)
provide('loadedMapId', loadedMapId)

const navMode = inject('navMode', ref('auto'))

const mapManager = RosMapPixi()
provide('mapManager', mapManager)
const pixiContainer = ref(null)

/**
 * 刷新后从 DB 恢复「当前地图」(status=1)：
 * - 写入 loadedMapId/Name，巡检点/导航才能用
 * - rosbridge 已连时下发 load，拉齐栅格
 */
async function restoreActiveMapFromDb ({ publishLoad = true } = {}) {
  if (!isMonitorWorkspace.value) return null
  try {
    const active = await getActiveMap()
    if (!active?.id || !active.map_name) return null

    const same =
      loadedMapId.value === active.id &&
      loadedMapName.value === active.map_name
    loadedMapId.value = active.id
    loadedMapName.value = active.map_name
    keepMapOnIdle.value = true
    mapBoardVisible.value = true

    if (!publishLoad || !connected.value) return active
    // 已有同名栅格则不必重复 load
    if (same && mapManager.map) return active

    rosClient.advertise('/map_command')
    rosClient.publish('/map_command', { data: 'load ' + active.map_name })
    return active
  } catch (e) {
    console.warn('[RosMap2d] restoreActiveMapFromDb failed', e)
    return null
  }
}

watch(connected, async value => {
  robotRuntime.setOnline(Boolean(value))
  if (value) {
    rosClient.subscribe(controlParam.mapTopic)
    rosClient.subscribe('/robot_pose')
    rosClient.subscribe('/robot_status')
    rosClient.subscribe('/map_state')
    rosClient.advertise('/map_command')
    rosClient.advertise('/charge_pose')
    if (isMonitorWorkspace.value) {
      rosClient.subscribe('/nav_state')
    }
    const pathTopic = visualization.pathTopic || '/plan'
    if (pathTopic && !pathTopic.includes('move_base')) {
      rosClient.subscribe(pathTopic)
    }
    if (visualization.laserScanEnable) rosClient.subscribe(visualization.laserScanTopic)
    if (visualization.trajectoryEnable) rosClient.subscribe(visualization.trajectoryTopic)
    if (visualization.costMapEnable) rosClient.subscribe(visualization.costMapTopic)
    await restoreActiveMapFromDb({ publishLoad: true })
  }
}, { immediate: true })
const teleop = inject('teleop', null)
const robotPose = inject('robotPose', null)
const resetTeleopPose = inject('resetTeleopPose', () => {})

let teleopTimer = null
let teleopLastMs = 0

const localTeleopDrive = computed(() => {
  if (isMappingWorkspace.value) return true
  return isMonitorWorkspace.value && navMode.value === 'manual'
})

function yawFromQuat (q) {
  if (!q) return 0
  return Math.atan2(
    2 * ((q.w || 0) * (q.z || 0) + (q.x || 0) * (q.y || 0)),
    1 - 2 * ((q.y || 0) ** 2 + (q.z || 0) ** 2)
  )
}

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

/**
 * 将机器人放到指定位姿，并同步 mock_nav /initialpose（避免停在默认 (0,0)）
 */
function syncRobotToPose (xyYaw, { publishInitial = true } = {}) {
  if (!xyYaw || !Number.isFinite(xyYaw.x) || !Number.isFinite(xyYaw.y)) return null
  const yaw = Number(xyYaw.yaw) || 0
  const pose = mapManager.placeRobotAt?.(xyYaw.x, xyYaw.y, yaw) || {
    position: { x: xyYaw.x, y: xyYaw.y, z: 0 },
    orientation: {
      x: 0,
      y: 0,
      z: Math.sin(yaw / 2),
      w: Math.cos(yaw / 2)
    }
  }
  const x = pose.position.x
  const y = pose.position.y
  if (teleop) {
    teleop.value.x = x
    teleop.value.y = y
    teleop.value.yaw = yaw
    teleop.value.vx = 0
    teleop.value.vy = 0
    teleop.value.wz = 0
  }
  if (publishInitial && connected.value) {
    const covariance = Array(36).fill(0)
    covariance[0] = 0.25
    covariance[7] = 0.25
    covariance[35] = 0.07
    rosClient.advertise('/initialpose')
    rosClient.publish('/initialpose', {
      header: stampHeader(),
      pose: {
        pose: {
          position: { x, y, z: 0 },
          orientation: { ...pose.orientation }
        },
        covariance
      }
    })
  }
  return { x, y, yaw }
}

/** 兼容旧调用：强制到地图中心 */
function syncRobotToMapCenter (opts) {
  const c = mapManager.mapCenter?.()
  if (!c) return null
  return syncRobotToPose({ x: c.x, y: c.y, yaw: 0 }, opts)
}

/**
 * 默认起点：有充电点 → 充电点；否则地图中心
 */
async function syncRobotToDefaultStart ({ publishInitial = true } = {}) {
  const mapId = loadedMapId.value
  if (mapId) {
    try {
      const charge = await getChargePoint(mapId)
      if (charge && Number.isFinite(charge.x) && Number.isFinite(charge.y)) {
        mapManager.drawChargeMarker?.(charge)
        return syncRobotToPose(
          { x: charge.x, y: charge.y, yaw: charge.yaw || 0 },
          { publishInitial }
        )
      }
    } catch (_) { /* ignore */ }
  }
  return syncRobotToMapCenter({ publishInitial })
}

provide('syncRobotToMapCenter', syncRobotToMapCenter)
provide('syncRobotToDefaultStart', syncRobotToDefaultStart)
provide('syncRobotToPose', syncRobotToPose)

onMounted(async () => {
  await mapManager.init({ canvas: pixiContainer.value })
  mapManager.layoutViewport?.()
  // 先同步 DB 当前地图，避免栅格已在但提示「请先加载地图」
  await restoreActiveMapFromDb({ publishLoad: Boolean(connected.value) })
  rosClient.loadMapRaw.value = (data) => {
    if (!mapBoardVisible.value && mapState.value === 'idle') return
    const first = !mapManager.map
    mapManager.processMapRaw(data)
    mapReady.value = true
    if (first) {
      // 等箭头创建后再放到充电点（或中心），避免与 createRobot 抢位姿
      void (async () => {
        for (let i = 0; i < 40 && !mapManager.robot; i++) {
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        await syncRobotToDefaultStart({ publishInitial: true })
        mapManager.zoomToFit?.()
        await refreshChargeMarker()
      })()
    }
  }
  if (visualization.laserScanEnable) rosClient.loadLaserScan.value = mapManager.processLaserScan
  rosClient.loadPath.value = mapManager.processPath
  if (visualization.trajectoryEnable) rosClient.loadTrajectory.value = mapManager.processTrajectory
  if (visualization.costMapTopic) rosClient.loadCostMap.value = mapManager.processCostMap

  teleopLastMs = performance.now()
  teleopTimer = setInterval(() => {
    if (!localTeleopDrive.value) return
    if (!teleop || toolMode.value === 'relocate' || toolMode.value === 'goto') return
    if (!mapBoardVisible.value) return
    const now = performance.now()
    const dt = Math.min(0.1, (now - teleopLastMs) / 1000)
    teleopLastMs = now
    const t = teleop.value
    if (!t.vx && !t.vy && !t.wz) return

    t.x += t.vx * dt
    t.y += t.vy * dt
    t.yaw += t.wz * dt

    const clamped = mapManager.clampWorld?.(t.x, t.y) || { x: t.x, y: t.y }
    t.x = clamped.x
    t.y = clamped.y
    mapManager.updateRobotPose({
      position: { x: t.x, y: t.y, z: 0 },
      orientation: {
        x: 0,
        y: 0,
        z: Math.sin(t.yaw * 0.5),
        w: Math.cos(t.yaw * 0.5)
      }
    })
    syncChargeStateFromPose(t.x, t.y)
  }, 50)

  if (isMonitorWorkspace.value && patrolMission.consumeFollowOnEnter()) {
    navMode.value = 'auto'
    void (async () => {
      for (let i = 0; i < 60 && !mapReady.value; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      setFocusing(true)
    })()
  }
})

onUnmounted(() => {
  if (teleopTimer) clearInterval(teleopTimer)
  // 切页不断开 ROS；清空本页回调，避免打到已销毁画布
  const noop = () => {}
  if (rosClient.loadMapRaw) rosClient.loadMapRaw.value = noop
  if (rosClient.loadLaserScan) rosClient.loadLaserScan.value = noop
  if (rosClient.loadPath) rosClient.loadPath.value = noop
  if (rosClient.loadTrajectory) rosClient.loadTrajectory.value = noop
  if (rosClient.loadCostMap) rosClient.loadCostMap.value = noop
})

function syncChargeStateFromPose (x, y) {
  const c = chargePose.value
  if (!c || !Number.isFinite(x) || !Number.isFinite(y)) {
    robotRuntime.setNearCharge(false)
    return
  }
  const near = Math.hypot(x - c.x, y - c.y) <= CHARGE_NEAR_M
  robotRuntime.setNearCharge(near)
}

watch(robotPose, (msg) => {
  if (!isMonitorWorkspace.value) return
  if (toolMode.value === 'relocate' || toolMode.value === 'goto') return
  const pose = msg?.pose
  if (!pose?.position || !pose?.orientation) return
  if (navMode.value !== 'manual') {
    mapManager.updateRobotPose(pose)
    if (teleop) {
      teleop.value.x = pose.position.x
      teleop.value.y = pose.position.y
      teleop.value.yaw = yawFromQuat(pose.orientation)
    }
  }
  mapManager.redrawNavPlanProgress?.({
    x: pose.position.x,
    y: pose.position.y
  })
  syncChargeStateFromPose(pose.position.x, pose.position.y)
}, { deep: true })

watch(
  () => [patrolMission.active, patrolMission.paused, patrolMission.phase],
  () => {
    if (!patrolMission.active) {
      if (robotRuntime.workState === 'patrol' || robotRuntime.workState === 'paused') {
        robotRuntime.setWorkState(robotRuntime.online ? 'idle' : 'offline')
      }
      return
    }
    robotRuntime.setWorkState(patrolMission.paused ? 'paused' : 'patrol')
  }
)

watch(mapState, value => {
  if (value === 'mapping') {
    if (isMonitorWorkspace.value) return
    keepMapOnIdle.value = false
    mapBoardVisible.value = true
    resetTeleopPose()
    const c = mapManager.mapCenter?.() || { x: 0, y: 0 }
    if (teleop) {
      teleop.value.x = c.x
      teleop.value.y = c.y
      teleop.value.yaw = 0
    }
    mapManager.placeRobotAtMapCenter?.()
    mapManager.centerOnMap?.()
  } else if (value === 'idle') {
    if (keepMapOnIdle.value || isMonitorWorkspace.value) {
      mapBoardVisible.value = true
      return
    }
    mapBoardVisible.value = false
    mapReady.value = false
    loadedMapName.value = ''
    loadedMapId.value = null
    mapManager.clearMap?.()
    resetTeleopPose()
  } else if (value === 'terminating') {
    keepMapOnIdle.value = false
    mapReady.value = false
    loadedMapName.value = ''
    loadedMapId.value = null
    resetTeleopPose()
  }
})

const toolMode = ref('default')
provide('pageMode', toolMode)

const focusing = ref(mapManager.focusing)
provide('focusingUi', focusing)
const robotRelocate = ref()
const mapEditMode = computed(() => toolMode.value === 'relocate' || toolMode.value === 'goto')

function zoomIn () { mapManager.zoomBy?.(1.2) }
function zoomOut () { mapManager.zoomBy?.(1 / 1.2) }
function zoomFit () {
  mapManager.zoomToFit?.()
}
function setFocusing (on) {
  mapManager.focusing = on
  focusing.value = on
  if (on) {
    // 开启跟随时先回到可看全貌的缩放，再居中机器人
    mapManager.zoomToFit?.()
  }
}

function setTool (mode) {
  if (isMonitorWorkspace.value && navMode.value === 'manual' &&
    (mode === 'relocate' || mode === 'goto' || mode === 'patrol')) {
    return
  }
  toolMode.value = toolMode.value === mode ? 'default' : mode
}

function setNavMode (mode) {
  navMode.value = mode
  toolMode.value = 'default'
}

const isAutoNav = computed(() => navMode.value === 'auto')
const hasRailJoy = computed(() => Boolean(slots['rail-joy']))

/** 把充电点同步给 mock_nav（/charge_pose），用于 /robot_status.charging */
function publishChargePose (pt) {
  if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !connected.value) return
  const yaw = Number(pt.yaw) || 0
  rosClient.advertise('/charge_pose')
  rosClient.publish('/charge_pose', {
    header: stampHeader(),
    pose: {
      position: { x: pt.x, y: pt.y, z: 0 },
      orientation: {
        x: 0,
        y: 0,
        z: Math.sin(yaw / 2),
        w: Math.cos(yaw / 2)
      }
    }
  })
}

async function refreshChargeMarker () {
  const id = loadedMapId.value
  if (!id) {
    chargePose.value = null
    mapManager.clearChargeMarker?.()
    robotRuntime.setNearCharge(false)
    return
  }
  try {
    const pt = await getChargePoint(id)
    if (pt) {
      chargePose.value = { x: pt.x, y: pt.y, yaw: pt.yaw || 0 }
      mapManager.drawChargeMarker?.({ ...pt, name: pt.name || t('charge_point') })
      publishChargePose(chargePose.value)
      const live = mapManager.pose?.position || robotPose?.value?.pose?.position
      if (live) syncChargeStateFromPose(live.x, live.y)
    } else {
      chargePose.value = null
      mapManager.clearChargeMarker?.()
      robotRuntime.setNearCharge(false)
    }
  } catch (_) {
    chargePose.value = null
    mapManager.clearChargeMarker?.()
    robotRuntime.setNearCharge(false)
  }
}

async function applyChargeAtRobot (mapId, x, y, yaw) {
  try {
    const pt = await setChargePoint(mapId, { x, y, yaw, name: 'charge' })
    chargePose.value = { x: pt.x, y: pt.y, yaw: pt.yaw || 0 }
    mapManager.drawChargeMarker?.({ ...pt, name: pt.name || t('charge_point') })
    publishChargePose(chargePose.value)
    syncChargeStateFromPose(x, y)
    Notify.create({ type: 'positive', message: t('charge_point_set') })
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
  }
}

/** 充电点：无则直接设当前位置；已有则弹框确认是否改到当前位置 */
async function setChargeAtRobot () {
  const mapId = loadedMapId.value
  if (!mapId) {
    Notify.create({ type: 'warning', message: t('patrol_need_map') })
    return
  }
  const pose = mapManager.pose || robotPose?.value?.pose
  const c = mapManager.mapCenter?.()
  const x = pose?.position?.x ?? teleop?.value?.x ?? c?.x
  const y = pose?.position?.y ?? teleop?.value?.y ?? c?.y
  const yaw = pose?.orientation
    ? yawFromQuat(pose.orientation)
    : (teleop?.value?.yaw || 0)
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    Notify.create({ type: 'warning', message: t('patrol_no_robot') })
    return
  }

  let existing = null
  try {
    existing = await getChargePoint(mapId)
  } catch (_) {
    existing = null
  }

  if (existing) {
    $q.dialog({
      title: t('charge_point_change_title'),
      message: t('charge_point_change_confirm'),
      cancel: { label: t('cancel'), flat: true, color: 'secondary' },
      ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
      persistent: true
    }).onOk(() => { applyChargeAtRobot(mapId, x, y, yaw) })
    return
  }

  await applyChargeAtRobot(mapId, x, y, yaw)
}

watch(loadedMapId, () => { refreshChargeMarker() })

// 重连后把充电点再推给 mock_nav
watch(connected, (ok) => {
  if (ok && chargePose.value) publishChargePose(chargePose.value)
})

</script>

<template>
  <div class="amr-layout">
    <!-- 左侧：按钮 + 手柄 -->
    <aside class="amr-rail">
      <div class="amr-rail__top">
        <div v-if="isMonitorWorkspace" class="amr-rail__modes">
          <q-btn-toggle
            dense
            unelevated
            toggle-color="primary"
            :options="[
              { label: $t('nav_mode_manual'), value: 'manual' },
              { label: $t('nav_mode_auto'), value: 'auto' }
            ]"
            :model-value="navMode"
            @update:model-value="setNavMode"
          />
        </div>

        <div class="amr-rail__tools column q-gutter-y-sm">
          <template v-if="!mapEditMode">
            <q-btn
              v-if="focusing"
              class="amr-rail__btn"
              rounded outline no-wrap
              :label="$t('amr2d_no_focus')"
              color="negative"
              icon="navigation"
              @click="setFocusing(false)"
            />
            <q-btn
              v-else
              class="amr-rail__btn"
              rounded outline no-wrap
              :label="$t('amr2d_focus')"
              color="grey-7"
              icon="navigation"
              @click="setFocusing(true)"
            />
          </template>

          <template v-if="isMappingWorkspace">
            <map-create v-if="toolMode === 'default'" key="map-create"/>
            <map-selector v-if="toolMode === 'default' && mapState === 'idle'" key="map-selector"/>
            <terminate-process v-if="toolMode === 'default'" key="terminate-process"/>
          </template>

          <template v-else>
            <map-selector v-if="!mapEditMode" key="nav-map-selector"/>
            <template v-if="isAutoNav">
              <q-btn
                class="amr-rail__btn"
                rounded no-wrap
                :outline="toolMode !== 'relocate'"
                :label="$t('nav_relocate')"
                color="accent"
                icon="my_location"
                @click="setTool('relocate')"
              />
              <q-btn
                class="amr-rail__btn"
                rounded no-wrap
                :outline="toolMode !== 'goto'"
                :label="$t('nav_goto')"
                color="primary"
                icon="place"
                @click="setTool('goto')"
              />
              <q-btn
                v-if="!mapEditMode"
                class="amr-rail__btn"
                rounded no-wrap
                :outline="toolMode !== 'patrol'"
                :label="$t('patrol')"
                color="secondary"
                icon="flag"
                @click="setTool('patrol')"
              />
              <q-btn
                v-if="!mapEditMode && loadedMapId"
                class="amr-rail__btn"
                rounded outline no-wrap
                :label="$t('charge_point_set_btn')"
                color="orange-8"
                icon="battery_charging_full"
                @click="setChargeAtRobot"
              />
            </template>
          </template>
        </div>
      </div>

      <div v-if="hasRailJoy" class="amr-rail__joy">
        <slot name="rail-joy"/>
      </div>
    </aside>

    <!-- 右侧：白底地图容器（固定视口，缩放不溢出） -->
    <div class="amr-map-host">
      <canvas ref="pixiContainer" class="map-canvas"/>
      <div class="amr-zoom-bar column q-gutter-xs">
        <q-btn dense round unelevated color="white" text-color="grey-9" icon="add" :title="t('amr2d_zoom_in')" @click="zoomIn"/>
        <q-btn dense round unelevated color="white" text-color="grey-9" icon="remove" :title="t('amr2d_zoom_out')" @click="zoomOut"/>
        <q-btn dense round unelevated color="white" text-color="grey-9" icon="fit_screen" :title="t('amr2d_zoom_fit')" @click="zoomFit"/>
      </div>
      <RobotRelocate v-if="isMonitorWorkspace" ref="robotRelocate"/>
      <pose-manager v-if="isMonitorWorkspace && toolMode === 'patrol'"/>
      <patrol-mission-runner v-if="isMonitorWorkspace"/>
    </div>
  </div>
</template>

<style scoped>
.amr-layout {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: row;
  background: #fff;
  overflow: hidden;
}

.amr-rail {
  flex: 0 0 11.5rem;
  width: 11.5rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.75rem 0.6rem;
  background: #fff;
  border-right: 1px solid rgba(0, 0, 0, 0.06);
  z-index: 30;
  overflow: hidden;
}

.amr-rail__top {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-height: 0;
  overflow: auto;
}

.amr-rail__modes {
  width: 100%;
}
.amr-rail__modes :deep(.q-btn-toggle) {
  width: 100%;
  flex-wrap: nowrap;
}
.amr-rail__modes :deep(.q-btn) {
  flex: 1;
  font-size: 0.75rem;
  padding: 0.25rem 0.2rem;
}

.amr-rail__tools {
  width: 100%;
}
.amr-rail__tools :deep(.q-btn),
.amr-rail__btn {
  width: 100%;
  justify-content: flex-start;
}

.amr-rail__joy {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding-top: 0.5rem;
  margin-top: auto;
}

.amr-map-host {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: #fff;
}

.map-canvas {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  touch-action: none;
  user-select: none;
  display: block;
  z-index: 1;
}

.amr-zoom-bar {
  position: absolute;
  right: 0.85rem;
  bottom: 5.5rem;
  z-index: 25;
  padding: 0.35rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}
.amr-zoom-bar :deep(.q-btn) {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
</style>
