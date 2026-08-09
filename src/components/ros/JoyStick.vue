<script setup>
import { getCssVar } from 'quasar'
import { inject, onMounted, onUnmounted, ref } from 'vue'
import { useControlParams } from 'stores/control-params'
import nipplejs from 'nipplejs'
import SliderItem from 'components/setting/SliderItem.vue'

const props = defineProps({
  togglePosition: { type: String, default: 'bottom-right' },
  visibleSwitch: { type: Boolean, default: true }
})

const pad = ref()
const visible = ref(true)

const linearX = ref(0)
const linearY = ref(0)
const angular = ref(0)

const controlParams = useControlParams()

/** 单一左侧手柄：大圆平移 + 上方左右旋 */
function initJoyStick () {
  nipplejs.create({
    zone: pad.value,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    color: getCssVar('negative'),
    size: 148
  }).on('start end', function () {
    linearX.value = 0
    linearY.value = 0
  }).on('move', function (evt, data) {
    linearX.value = data.vector.x * controlParams.linearRatio
    linearY.value = data.vector.y * controlParams.linearRatio
  })
}

const connected = inject('connected')
const publish = inject('publish')
const teleop = inject('teleop', null)
let moving = true
const twist = ref({
  linear: { x: 0, y: 0, z: 0 },
  angular: { x: 0, y: 0, z: 0 }
})

function pubVel (x, y, z) {
  if (!connected.value) return
  if (teleop) {
    teleop.value.vx = x
    teleop.value.vy = y
    teleop.value.wz = z
  }
  if (x || y || z) {
    moving = true
    twist.value.linear.x = x
    twist.value.linear.y = y
    twist.value.angular.z = z
    publish(controlParams.cmdTopic, twist.value)
  } else if (moving) {
    moving = false
    twist.value.linear.x = x
    twist.value.linear.y = y
    twist.value.angular.z = z
    publish(controlParams.cmdTopic, twist.value)
  }
}

function pressMove (dx, dy) {
  linearX.value = dx * controlParams.linearRatio
  linearY.value = dy * controlParams.linearRatio
}

function releaseMove () {
  linearX.value = 0
  linearY.value = 0
}

function pressTurn (dir) {
  angular.value = dir * controlParams.angularRatio
}

function releaseTurn () {
  angular.value = 0
}

function initKeyboardCtrl () {
  if (controlParams.keyboardMove) {
    document.onkeydown = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          linearY.value = controlParams.linearRatio
          break
        case 'KeyS':
        case 'ArrowDown':
          linearY.value = -controlParams.linearRatio
          break
        case 'KeyA':
        case 'ArrowLeft':
          linearX.value = -controlParams.linearRatio
          break
        case 'KeyD':
        case 'ArrowRight':
          linearX.value = controlParams.linearRatio
          break
        case 'KeyJ':
          angular.value = -controlParams.angularRatio
          break
        case 'KeyL':
          angular.value = controlParams.angularRatio
          break
      }
    }
    document.onkeyup = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'KeyS':
        case 'ArrowDown':
        case 'ArrowUp':
          linearY.value = 0
          break
        case 'KeyA':
        case 'KeyD':
        case 'ArrowLeft':
        case 'ArrowRight':
          linearX.value = 0
          break
        case 'KeyJ':
        case 'KeyL':
          angular.value = 0
          break
      }
    }
  } else {
    document.onkeyup = null
    document.onkeydown = null
  }
}

let timer
onMounted(() => {
  initJoyStick()
  initKeyboardCtrl()
  timer = setInterval(() => {
    pubVel(linearX.value, linearY.value, angular.value)
  }, controlParams.refreshInterval)
})

onUnmounted(() => {
  clearInterval(timer)
  document.onkeyup = null
  document.onkeydown = null
})
</script>

<template>
  <div class="joy-unit" v-show="visible">
    <!-- 左旋 / 右旋：在平移圆上方 -->
    <div class="joy-turn">
      <button
        type="button"
        class="joy-key joy-key--turn"
        aria-label="turn-left"
        @pointerdown.prevent="pressTurn(-1)"
        @pointerup.prevent="releaseTurn"
        @pointerleave.prevent="releaseTurn"
        @pointercancel.prevent="releaseTurn"
      >
        <q-icon name="rotate_left" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--turn"
        aria-label="turn-right"
        @pointerdown.prevent="pressTurn(1)"
        @pointerup.prevent="releaseTurn"
        @pointerleave.prevent="releaseTurn"
        @pointercancel.prevent="releaseTurn"
      >
        <q-icon name="rotate_right" size="22px"/>
      </button>
    </div>

    <!-- 平移大圆：方向键在外圈环带内 -->
    <div class="joy-pad">
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--up"
        aria-label="up"
        @pointerdown.prevent="pressMove(0, 1)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_up" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--left"
        aria-label="left"
        @pointerdown.prevent="pressMove(-1, 0)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_left" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--right"
        aria-label="right"
        @pointerdown.prevent="pressMove(1, 0)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_right" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--down"
        aria-label="down"
        @pointerdown.prevent="pressMove(0, -1)"
        @pointerup.prevent="releaseMove"
        @pointerleave.prevent="releaseMove"
        @pointercancel.prevent="releaseMove"
      >
        <q-icon name="keyboard_arrow_down" size="22px"/>
      </button>
      <div ref="pad" class="joy-nipple"/>
    </div>
  </div>

  <q-page-sticky v-show="$q.screen.gt.xs" :position="props.togglePosition" :offset="[15, 15]">
    <q-btn-dropdown v-show="visible" color="primary" :label="$t('joystick_params')" :menu-offset="props.togglePosition === 'bottom-right'?[0,10]:[65,10]">
      <q-card-section>
        <slider-item :label="$t('joystick_linear')" input-label="linear" color="secondary" v-model="controlParams.linearRatio" :min="0.05"
                     :max="Math.max(2, parseFloat(controlParams.linearMax) || 2)"
                     :step="0.05"/>
        <slider-item :label="$t('joystick_angular')" input-label="angular" color="secondary" v-model="controlParams.angularRatio"
                     :min="0.1" :max="3"
                     :step="0.1"/>
        <slider-item :label="$t('joystick_interval')" input-label="interval" v-model="controlParams.refreshInterval" :min="25"
                     :max="100" :step="25"/>
        <q-toggle :label="$t('joystick_keyboard')" v-model="controlParams.keyboardMove" @click="initKeyboardCtrl"/>
      </q-card-section>
    </q-btn-dropdown>
    <q-toggle v-if="props.visibleSwitch" v-model="visible" icon="sports_esports"/>
  </q-page-sticky>
</template>

<style scoped>
.joy-unit {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}

.joy-turn {
  display: flex;
  gap: 0.65rem;
  pointer-events: none;
}

.joy-pad {
  position: relative;
  width: 168px;
  height: 168px;
  border-radius: 50%;
  pointer-events: none;
}

.joy-nipple {
  position: absolute;
  inset: 0;
  pointer-events: auto;
}

.joy-key {
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.22);
  pointer-events: auto;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
}
.joy-key:active {
  background: rgba(255, 255, 255, 0.45);
}

.joy-key--turn {
  width: 2.35rem;
  height: 2.35rem;
  color: rgba(33, 33, 33, 0.8);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16);
}
.joy-key--turn:active {
  background: rgba(25, 118, 210, 0.18);
  color: #1565c0;
}

/* 方向键落在 nipple 外圈环带内（相对 168 圆） */
.joy-key--dir {
  position: absolute;
  width: 2rem;
  height: 2rem;
  z-index: 3;
}
.joy-key--up {
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
}
.joy-key--down {
  left: 50%;
  bottom: 10px;
  transform: translateX(-50%);
}
.joy-key--left {
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
}
.joy-key--right {
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
}

/* nipple 背板略放大，与 168 外圈对齐 */
.joy-nipple :deep(.back) {
  opacity: 0.55;
}
.joy-nipple :deep(.front) {
  opacity: 0.9;
}
</style>
