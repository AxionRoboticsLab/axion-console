<script setup>

import { inject, provide, onMounted, onUnmounted, ref, watch } from 'vue'

import RosMapPixi from 'components/amr-control/RosMapPixi'
import RobotRelocate from 'components/amr-control/RobotRelocate.vue'
import MapSelector from 'components/amr-control/MapSelector.vue'
import MapCreate from 'components/amr-control/MapCreate.vue'
import PoseManager from 'components/map-pose/PoseManager.vue'
import { useControlParams } from 'stores/control-params'
import { useVisualization } from 'stores/visualization'
import TerminateProcess from 'components/amr-control/TerminateProcess.vue'

const rosClient = inject('rosClient')
const connected = inject('connected')
const mapState = inject('mapState')
const visualization = useVisualization()
const controlParam = useControlParams()

/** 是否允许把 /map 画到画布上（只有开始建图或载入后） */
const mapBoardVisible = ref(false)
provide('mapBoardVisible', mapBoardVisible)
/** 载入地图后 state 仍是 idle，避免被 idle 监听清空栅格 */
const keepMapOnIdle = ref(false)
provide('keepMapOnIdle', keepMapOnIdle)

watch(connected, value => {
  if (value) {
    rosClient.subscribe(controlParam.mapTopic)
    rosClient.subscribe('/robot_pose')
    rosClient.subscribe('/map_state')
    rosClient.advertise('/map_command')
    if (visualization.pathEnable) rosClient.subscribe(visualization.pathTopic)
    if (visualization.laserScanEnable) rosClient.subscribe(visualization.laserScanTopic)
    if (visualization.trajectoryEnable) rosClient.subscribe(visualization.trajectoryTopic)
    if (visualization.costMapEnable) rosClient.subscribe(visualization.costMapTopic)
  }
}, { immediate: true })

const mapManager = RosMapPixi()
provide('mapManager', mapManager)
const pixiContainer = ref(null)
const teleop = inject('teleop', null)
const resetTeleopPose = inject('resetTeleopPose', () => {})

let teleopTimer = null
let teleopLastMs = 0

onMounted(() => {
  mapManager.init({ canvas: pixiContainer.value })
  rosClient.loadMapRaw.value = (data) => {
    // 未建图且未载入时忽略后端残留 /map，避免「一进来就有建图板」
    if (!mapBoardVisible.value && mapState.value === 'idle') return
    const first = !mapManager.map
    mapManager.processMapRaw(data)
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
  if (visualization.pathEnable) rosClient.loadPath.value = mapManager.processPath
  if (visualization.trajectoryEnable) rosClient.loadTrajectory.value = mapManager.processTrajectory
  if (visualization.costMapTopic) rosClient.loadCostMap.value = mapManager.processCostMap

  teleopLastMs = performance.now()
  teleopTimer = setInterval(() => {
    if (!teleop || pageMode.value === 'navigation') return
    if (!mapBoardVisible.value) return
    const now = performance.now()
    const dt = Math.min(0.1, (now - teleopLastMs) / 1000)
    teleopLastMs = now
    const t = teleop.value
    if (!t.vx && !t.vy && !t.wz) return

    // 屏幕/地图系平移：摇杆方向 = 画板方向（不受航向耦合）
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

// 建图板显示期间以本地摇杆积分为准，不应用 /robot_pose：
// 松手后再同步后端位姿会被 teleop_scale 放大后的坐标拽出画板。

watch(mapState, value => {
  if (value === 'mapping') {
    keepMapOnIdle.value = false
    mapBoardVisible.value = true
    resetTeleopPose()
    // 箭头默认落在画板几何中心
    const c = mapManager.mapCenter?.() || { x: 0, y: 0 }
    if (teleop) {
      teleop.value.x = c.x
      teleop.value.y = c.y
      teleop.value.yaw = 0
    }
    mapManager.placeRobotAtMapCenter?.()
    mapManager.centerOnMap?.()
  } else if (value === 'idle') {
    if (keepMapOnIdle.value) {
      mapBoardVisible.value = true
      return
    }
    mapBoardVisible.value = false
    mapManager.clearMap?.()
    resetTeleopPose()
  } else if (value === 'terminating') {
    keepMapOnIdle.value = false
    resetTeleopPose()
  }
})

const pageMode = ref('default')
provide('pageMode', pageMode)

const focusing = ref(mapManager.focusing)
const robotRelocate = ref()

</script>

<template>
  <div class="amr-toolbar">
    <div class="no-wrap flex q-gutter-x-sm justify-center items-center q-pa-sm">
      <template v-if="pageMode !== 'navigation'">
        <q-btn key="no-focus" no-wrap v-if="focusing" rounded outline :label="$t('amr2d_no_focus')"
               @click="mapManager.focusing = false; focusing = false" color="negative" icon="navigation"/>
        <q-btn key="focusing" no-wrap v-else rounded :label="$t('amr2d_focus')"
               @click="mapManager.focusing = true; focusing = true" color="primary" icon="navigation"/>
      </template>

      <q-btn key="navigation" no-wrap v-if="!controlParam.requireMapState || mapState === 'navigation' && pageMode !== 'mapPose'" rounded
             :label="pageMode === 'navigation'?$t('ok'):$t('amr2d_navigation_relocate')" color="primary"
             icon="label_important_outline"
             @click="pageMode === 'navigation'?(pageMode = 'default'):(pageMode='navigation')"/>
      <q-btn key="navigation-cancel" no-wrap v-if="pageMode==='navigation'" :label="$t('cancel')" rounded color="secondary"
             @click="robotRelocate.cancel()"/>
      <map-create v-if="pageMode === 'default'" key="map-create"/>
      <map-selector v-if="pageMode === 'default' && mapState === 'idle'" key="map-selector"/>
      <terminate-process v-if="pageMode === 'default'" key="terminate-process"/>
      <q-btn key="map-pose" no-wrap v-if="mapState === 'navigation'  && pageMode !== 'navigation'" rounded
             :label="$t('mapPose')" color="accent"
             :outline="pageMode === 'mapPose'" icon="grain"
             @click="pageMode === 'mapPose'?(pageMode = 'default'):(pageMode='mapPose')"/>
    </div>
  </div>
  <canvas ref="pixiContainer" class="map-canvas"/>
  <RobotRelocate ref="robotRelocate"/>
  <pose-manager/>
</template>

<style scoped>
.amr-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3.5rem;
  z-index: 40;
  pointer-events: none;
}
.amr-toolbar :deep(.q-btn),
.amr-toolbar :deep(.q-btn-dropdown) {
  pointer-events: auto;
}
.map-canvas {
  position: absolute;
  top: 3.5rem;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100% !important;
  height: calc(100% - 3.5rem) !important;
  touch-action: none;
  user-select: none;
  display: block;
  z-index: 1;
}
</style>
