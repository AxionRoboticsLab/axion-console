<script setup>
/**
 * 建图 / 导航共用：ROS 连接 + 地图画布 + 摇杆
 */
import JoyStick from 'components/ros/JoyStick.vue'
import RosClient from 'components/ros/RosClient'
import { computed, onMounted, onUnmounted, provide, ref } from 'vue'
import RosMap2d from 'components/amr-control/RosMap2d.vue'

const props = defineProps({
  /** 'mapping' | 'navigation' */
  workspace: {
    type: String,
    default: 'mapping',
    validator: (v) => ['mapping', 'navigation'].includes(v)
  }
})

const rosClient = RosClient()
provide('rosClient', rosClient)

const teleop = ref({
  x: 0,
  y: 0,
  yaw: 0,
  vx: 0,
  vy: 0,
  wz: 0
})
provide('teleop', teleop)

function resetTeleopPose () {
  teleop.value.x = 0
  teleop.value.y = 0
  teleop.value.yaw = 0
  teleop.value.vx = 0
  teleop.value.vy = 0
  teleop.value.wz = 0
}
provide('resetTeleopPose', resetTeleopPose)

/** 导航页：manual | auto（仅前端） */
const navMode = ref(props.workspace === 'navigation' ? 'auto' : 'manual')
provide('navMode', navMode)

/** 与 RosMap2d 共用：是否允许画 /map；棋盘出现后才为 true */
const mapBoardVisible = ref(props.workspace === 'navigation')
provide('mapBoardVisible', mapBoardVisible)
/** 已收到 OccupancyGrid 并画出棋盘 */
const mapReady = ref(false)
provide('mapReady', mapReady)

const showJoystick = computed(() => {
  if (!mapReady.value) return false
  if (props.workspace === 'mapping') return true
  return navMode.value === 'manual'
})

const visible = computed(() => rosClient.mapState && rosClient.mapState.value === 'terminating')

onMounted(() => {
  rosClient.init()
})

onUnmounted(() => {
  rosClient.close()
})
</script>

<template>
  <div class="amr-page">
    <ros-map2d :workspace="props.workspace"/>
    <joy-stick v-if="showJoystick"/>
    <q-inner-loading
      :showing="visible"
      :label="$t('amr2d_wait')"
      label-class="text-teal"
      size="5rem"
      color="teal"
      label-style="font-size: 3em"
    />
  </div>
</template>

<style scoped>
.amr-page {
  position: relative;
  height: calc(100vh - var(--app-header-height));
  max-height: calc(100vh - var(--app-header-height));
  overflow: hidden;
  box-sizing: border-box;
}
</style>
