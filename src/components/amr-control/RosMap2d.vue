<script setup>

import { computed, inject, provide, onMounted, onUnmounted, ref, watch, useSlots } from 'vue'

import RosMapPixi from 'components/amr-control/RosMapPixi'
import RobotRelocate from 'components/amr-control/RobotRelocate.vue'
import MapSelector from 'components/amr-control/MapSelector.vue'
import MapCreate from 'components/amr-control/MapCreate.vue'
import PoseManager from 'components/map-pose/PoseManager.vue'
import PatrolMissionRunner from 'components/map-pose/PatrolMissionRunner.vue'
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

watch(connected, value => {
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
  }
}, { immediate: true })

const mapManager = RosMapPixi()
provide('mapManager', mapManager)
const pixiContainer = ref(null)
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

onMounted(() => {
  mapManager.init({ canvas: pixiContainer.value, railWidth: 184 })
  rosClient.loadMapRaw.value = (data) => {
    if (!mapBoardVisible.value && mapState.value === 'idle') return
    const first = !mapManager.map
    mapManager.processMapRaw(data)
    mapReady.value = true
    if (first) {
      const c = mapManager.mapCenter?.() || { x: 0, y: 0 }
      if (teleop) {
        teleop.value.x = c.x
        teleop.value.y = c.y
        teleop.value.yaw = 0
      }
      mapManager.placeRobotAtMapCenter?.()
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
    mapManager.clearMap?.()
    resetTeleopPose()
  } else if (value === 'terminating') {
    keepMapOnIdle.value = false
    mapReady.value = false
    loadedMapName.value = ''
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
    <!-- 整页即黑色格栅容器；右侧叠控件（不另开页面侧栏） -->
    <div class="amr-map-host">
      <canvas ref="pixiContainer" class="map-canvas"/>

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
                rounded no-wrap
                :label="$t('amr2d_focus')"
                color="primary"
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
  background: #2e2e2e;
  overflow: hidden;
}

.amr-map-host {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
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

/* 叠在画布右侧黑色区内，不是页面独立侧栏 */
.amr-rail {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 11.5rem;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 0.65rem 0.55rem 0.75rem;
  background: transparent;
  z-index: 30;
  overflow: hidden;
  pointer-events: none;
}

.amr-rail__top {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-height: 0;
  overflow: auto;
  pointer-events: none;
}

.amr-rail__modes {
  width: 100%;
  pointer-events: auto;
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
  pointer-events: auto;
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
  pointer-events: none;
}
.amr-rail__joy :deep(.joy-unit) {
  pointer-events: none;
}
.amr-rail__joy :deep(.joy-key),
.amr-rail__joy :deep(.joy-nipple) {
  pointer-events: auto;
}
</style>
