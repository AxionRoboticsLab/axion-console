<script setup>

import { computed, inject, provide, onMounted, onUnmounted, ref, watch } from 'vue'

import RosMapPixi from 'components/amr-control/RosMapPixi'
import RobotRelocate from 'components/amr-control/RobotRelocate.vue'
import MapSelector from 'components/amr-control/MapSelector.vue'
import MapCreate from 'components/amr-control/MapCreate.vue'
import PoseManager from 'components/map-pose/PoseManager.vue'
import { useControlParams } from 'stores/control-params'
import { useVisualization } from 'stores/visualization'
import TerminateProcess from 'components/amr-control/TerminateProcess.vue'

const props = defineProps({
  /** 'mapping' 建图页 | 'navigation' 导航页 */
  workspace: {
    type: String,
    default: 'mapping',
    validator: (v) => ['mapping', 'navigation'].includes(v)
  }
})

const isMappingWorkspace = computed(() => props.workspace === 'mapping')
const isNavigationWorkspace = computed(() => props.workspace === 'navigation')
provide('workspace', computed(() => props.workspace))

const rosClient = inject('rosClient')
const connected = inject('connected')
const mapState = inject('mapState')
const visualization = useVisualization()
const controlParam = useControlParams()

/** 是否允许把 /map 画到画布上（只有开始建图或载入后） */
const mapBoardVisible = ref(props.workspace === 'navigation')
provide('mapBoardVisible', mapBoardVisible)
/** 载入地图后 state 仍是 idle，避免被 idle 监听清空栅格 */
const keepMapOnIdle = ref(props.workspace === 'navigation')
provide('keepMapOnIdle', keepMapOnIdle)
/** 当前已加载的逻辑地图名（导航页切换地图时用于二次确认） */
const loadedMapName = ref('')
provide('loadedMapName', loadedMapName)

watch(connected, value => {
  if (value) {
    rosClient.subscribe(controlParam.mapTopic)
    rosClient.subscribe('/robot_pose')
    rosClient.subscribe('/map_state')
    rosClient.subscribe('/map_file_list')
    rosClient.advertise('/map_command')
    // 勿订阅尚未存在的 move_base 旧话题，否则 rosbridge 刷 ERROR
    const pathTopic = visualization.pathTopic || ''
    if (visualization.pathEnable && pathTopic && !pathTopic.includes('move_base')) {
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
    // 建图页：本地积分驱动箭头；导航页交给 /robot_pose（后续接定位）
    if (!isMappingWorkspace.value) return
    if (!teleop || toolMode.value === 'relocate' || toolMode.value === 'goto') return
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
    if (isNavigationWorkspace.value) return
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
    if (keepMapOnIdle.value || isNavigationWorkspace.value) {
      mapBoardVisible.value = true
      return
    }
    mapBoardVisible.value = false
    loadedMapName.value = ''
    mapManager.clearMap?.()
    resetTeleopPose()
  } else if (value === 'terminating') {
    keepMapOnIdle.value = false
    loadedMapName.value = ''
    resetTeleopPose()
  }
})

/**
 * 工具子模式：
 * default | relocate（重定位）| goto（去这里）| mapPose（收藏的导航点）
 */
const toolMode = ref('default')
provide('pageMode', toolMode)

const focusing = ref(mapManager.focusing)
const robotRelocate = ref()
const mapEditMode = computed(() => toolMode.value === 'relocate' || toolMode.value === 'goto')

function setTool (mode) {
  toolMode.value = toolMode.value === mode ? 'default' : mode
}

</script>

<template>
  <div class="amr-toolbar">
    <div class="no-wrap flex q-gutter-x-sm justify-center items-center q-pa-sm">
      <template v-if="!mapEditMode">
        <q-btn key="no-focus" no-wrap v-if="focusing" rounded outline :label="$t('amr2d_no_focus')"
               @click="mapManager.focusing = false; focusing = false" color="negative" icon="navigation"/>
        <q-btn key="focusing" no-wrap v-else rounded :label="$t('amr2d_focus')"
               @click="mapManager.focusing = true; focusing = true" color="primary" icon="navigation"/>
      </template>

      <!-- 建图页：创建 / 保存 / 加载 / 取消 -->
      <template v-if="isMappingWorkspace">
        <map-create v-if="toolMode === 'default'" key="map-create"/>
        <map-selector v-if="toolMode === 'default' && mapState === 'idle'" key="map-selector"/>
        <terminate-process v-if="toolMode === 'default'" key="terminate-process"/>
      </template>

      <!-- 导航页：三件事拆开 —— 重定位 / 去这里 / 导航点 -->
      <template v-else>
        <map-selector v-if="!mapEditMode" key="nav-map-selector"/>
        <q-btn
          key="nav-relocate"
          no-wrap
          rounded
          :outline="toolMode !== 'relocate'"
          :label="$t('nav_relocate')"
          color="accent"
          icon="my_location"
          @click="setTool('relocate')"
        />
        <q-btn
          key="nav-goto"
          no-wrap
          rounded
          :outline="toolMode !== 'goto'"
          :label="$t('nav_goto')"
          color="primary"
          icon="place"
          @click="setTool('goto')"
        />
        <q-btn
          key="map-pose"
          no-wrap
          rounded
          v-if="!mapEditMode"
          :outline="toolMode !== 'mapPose'"
          :label="$t('mapPose')"
          color="secondary"
          icon="flag"
          @click="setTool('mapPose')"
        />
      </template>
    </div>
  </div>
  <canvas ref="pixiContainer" class="map-canvas"/>
  <RobotRelocate v-if="isNavigationWorkspace" ref="robotRelocate"/>
  <pose-manager v-if="isNavigationWorkspace && toolMode === 'mapPose'"/>
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
