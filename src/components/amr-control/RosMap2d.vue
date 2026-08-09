<script setup>

import { computed, inject, provide, onMounted, onUnmounted, ref, watch, useSlots } from 'vue'

import RosMapPixi from 'components/amr-control/RosMapPixi'
import RobotRelocate from 'components/amr-control/RobotRelocate.vue'
import MapSelector from 'components/amr-control/MapSelector.vue'
import MapCreate from 'components/amr-control/MapCreate.vue'
import PoseManager from 'components/map-pose/PoseManager.vue'
import PatrolMissionRunner from 'components/map-pose/PatrolMissionRunner.vue'
import { getActiveMap } from 'src/api/maps'
import { useControlParams } from 'stores/control-params'
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

const isMappingWorkspace = computed(() => props.workspace === 'mapping')
const isMonitorWorkspace = computed(() => props.workspace === 'monitor')
provide('workspace', computed(() => props.workspace))

const rosClient = inject('rosClient')
const connected = inject('connected')
const mapState = inject('mapState')
const visualization = useVisualization()
const controlParam = useControlParams()

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
  if (value) {
    rosClient.subscribe(controlParam.mapTopic)
    rosClient.subscribe('/robot_pose')
    rosClient.subscribe('/map_state')
    rosClient.advertise('/map_command')
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
      mapManager.placeRobotAtMapCenter?.()
      const c = mapManager.mapCenter?.() || { x: 0, y: 0 }
      if (teleop) {
        teleop.value.x = c.x
        teleop.value.y = c.y
        teleop.value.yaw = 0
        teleop.value.vx = 0
        teleop.value.vy = 0
        teleop.value.wz = 0
      }
      mapManager.centerOnMap?.()
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
  }, 50)
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
}, { deep: true })

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
              @click="mapManager.focusing = false; focusing = false"
            />
            <q-btn
              v-else
              class="amr-rail__btn"
              rounded outline no-wrap
              :label="$t('amr2d_focus')"
              color="grey-7"
              icon="navigation"
              @click="mapManager.focusing = true; focusing = true"
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
</style>
