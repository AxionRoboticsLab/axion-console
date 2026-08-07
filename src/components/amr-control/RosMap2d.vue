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
  rosClient.loadMapRaw.value = mapManager.processMapRaw
  if (visualization.laserScanEnable) rosClient.loadLaserScan.value = mapManager.processLaserScan
  if (visualization.pathEnable) rosClient.loadPath.value = mapManager.processPath
  if (visualization.trajectoryEnable) rosClient.loadTrajectory.value = mapManager.processTrajectory
  if (visualization.costMapTopic) rosClient.loadCostMap.value = mapManager.processCostMap

  // 本地积分：摇杆 → 箭头，不依赖 /robot_pose 经 rosbridge 回传
  teleopLastMs = performance.now()
  teleopTimer = setInterval(() => {
    if (!teleop || pageMode.value === 'navigation') return
    const now = performance.now()
    const dt = Math.min(0.1, (now - teleopLastMs) / 1000)
    teleopLastMs = now
    const t = teleop.value
    if (!t.vx && !t.vy && !t.wz) return
    const c = Math.cos(t.yaw)
    const s = Math.sin(t.yaw)
    t.x += (c * t.vx - s * t.vy) * dt
    t.y += (s * t.vx + c * t.vy) * dt
    t.yaw += t.wz * dt
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

const robotPose = inject('robotPose')
watch(robotPose, value => {
  if (pageMode.value === 'navigation' || !value) return
  // PoseStamped: .pose；PoseWithCovarianceStamped: .pose.pose
  const pose = value.pose?.position ? value.pose : value.pose?.pose
  if (!pose) return
  // 有遥控输入时以本地积分为准，避免回传延迟/丢包把箭头拽回去
  if (teleop && (teleop.value.vx || teleop.value.vy || teleop.value.wz)) return
  mapManager.updateRobotPose(pose)
}, { deep: true })

watch(mapState, value => {
  if (value === 'mapping' || value === 'idle') {
    resetTeleopPose()
  }
})

const pageMode = ref('default')
provide('pageMode', pageMode)

const focusing = ref(mapManager.focusing)
const robotRelocate = ref()

</script>

<template>
  <q-page-sticky position="top">
    <q-scroll-area style="height: 3.5rem; width: 100vw" class="q-pa-sm">
      <div class="no-wrap flex q-gutter-x-sm justify-center">
        <template v-if="pageMode !== 'navigation'">
          <q-btn key="no-focus" no-wrap v-if="focusing"  rounded outline :label="$t('amr2d_no_focus')"
                 @click="mapManager.focusing = false; focusing = false" color="negative" icon="navigation"/>
          <q-btn key="focusing" no-wrap v-else rounded :label="$t('amr2d_focus')"
                 @click="mapManager.focusing = true; focusing = true" color="primary" icon="navigation"/>
        </template>

        <transition-group
          appear
          enter-active-class="animated zoomIn"
          leave-active-class="animated zoomOut"
        >
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
        </transition-group>
      </div>
    </q-scroll-area>
  </q-page-sticky>
  <canvas ref="pixiContainer" class="map-canvas"/>
  <RobotRelocate ref="robotRelocate"/>
  <pose-manager/>
</template>

<style scoped>
.map-canvas {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
  touch-action: none;
  user-select: none;
  display: block;
}
</style>
