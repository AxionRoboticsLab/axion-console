<script setup>
/**
 * 2D建图 / 实时监控共用：ROS 连接 + 左侧手柄 + 地图画布
 */
import JoyStick from 'components/ros/JoyStick.vue'
import RosClient from 'components/ros/RosClient'
import { computed, onMounted, provide, ref } from 'vue'
import RosMap2d from 'components/amr-control/RosMap2d.vue'

const props = defineProps({
  /** 'mapping' | 'monitor' */
  workspace: {
    type: String,
    default: 'mapping',
    validator: (v) => ['mapping', 'monitor'].includes(v)
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

/** 实时监控：manual | auto（仅前端） */
const navMode = ref(props.workspace === 'monitor' ? 'auto' : 'manual')
provide('navMode', navMode)

const mapBoardVisible = ref(props.workspace === 'monitor')
provide('mapBoardVisible', mapBoardVisible)
const mapReady = ref(false)
provide('mapReady', mapReady)

const showJoystick = computed(() => {
  if (!mapReady.value) return false
  if (props.workspace === 'mapping') return true
  return navMode.value === 'manual'
})

const visible = computed(() => rosClient.mapState && rosClient.mapState.value === 'terminating')

onMounted(() => {
  // 全局单例：切页不 close，登出时 releaseRosConnection
  rosClient.init()
})
</script>

<template>
  <div class="amr-page">
    <ros-map2d :workspace="props.workspace">
      <template #rail-joy>
        <joy-stick v-if="showJoystick" variant="rail"/>
      </template>
    </ros-map2d>
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
  background: #fff;
}
</style>
