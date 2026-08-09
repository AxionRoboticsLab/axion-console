<script setup>
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

/** 中心区拖拽平移；外圈方向键不与 nipple 抢事件 */
function initJoyStick () {
  nipplejs.create({
    zone: pad.value,
    mode: 'static',
    position: { left: '50%', top: '50%' },
    // 中心浅灰，与外圈白环一体
    color: '#BDBDBD',
    size: 52
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
    twist.value.linear.x = 0
    twist.value.linear.y = 0
    twist.value.angular.z = 0
    publish(controlParams.cmdTopic, twist.value)
  }
}

function applyVel () {
  pubVel(linearX.value, linearY.value, angular.value)
}

function pressMove (dx, dy) {
  linearX.value = dx * controlParams.linearRatio
  linearY.value = dy * controlParams.linearRatio
  applyVel()
}

function releaseMove () {
  linearX.value = 0
  linearY.value = 0
  applyVel()
}

function pressTurn (dir) {
  angular.value = dir * controlParams.angularRatio
  applyVel()
}

function releaseTurn () {
  angular.value = 0
  applyVel()
}

function initKeyboardCtrl () {
  if (controlParams.keyboardMove) {
    document.onkeydown = (e) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          linearY.value = controlParams.linearRatio
          applyVel()
          break
        case 'KeyS':
        case 'ArrowDown':
          linearY.value = -controlParams.linearRatio
          applyVel()
          break
        case 'KeyA':
        case 'ArrowLeft':
          linearX.value = -controlParams.linearRatio
          applyVel()
          break
        case 'KeyD':
        case 'ArrowRight':
          linearX.value = controlParams.linearRatio
          applyVel()
          break
        case 'KeyJ':
          angular.value = -controlParams.angularRatio
          applyVel()
          break
        case 'KeyL':
          angular.value = controlParams.angularRatio
          applyVel()
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
          applyVel()
          break
        case 'KeyA':
        case 'KeyD':
        case 'ArrowLeft':
        case 'ArrowRight':
          linearX.value = 0
          applyVel()
          break
        case 'KeyJ':
        case 'KeyL':
          angular.value = 0
          applyVel()
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
  timer = setInterval(applyVel, controlParams.refreshInterval)
})

onUnmounted(() => {
  clearInterval(timer)
  document.onkeyup = null
  document.onkeydown = null
})
</script>

<template>
  <div class="joy-unit" v-show="visible">
    <div class="joy-turn">
      <button
        type="button"
        class="joy-key joy-key--turn"
        aria-label="turn-left"
        @pointerdown.prevent.stop="pressTurn(-1)"
        @pointerup.prevent.stop="releaseTurn"
        @pointerleave.prevent.stop="releaseTurn"
        @pointercancel.prevent.stop="releaseTurn"
      >
        <q-icon name="rotate_left" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--turn"
        aria-label="turn-right"
        @pointerdown.prevent.stop="pressTurn(1)"
        @pointerup.prevent.stop="releaseTurn"
        @pointerleave.prevent.stop="releaseTurn"
        @pointercancel.prevent.stop="releaseTurn"
      >
        <q-icon name="rotate_right" size="22px"/>
      </button>
    </div>

    <div class="joy-pad">
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--up"
        aria-label="up"
        @pointerdown.prevent.stop="pressMove(0, 1)"
        @pointerup.prevent.stop="releaseMove"
        @pointerleave.prevent.stop="releaseMove"
        @pointercancel.prevent.stop="releaseMove"
      >
        <q-icon name="keyboard_arrow_up" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--left"
        aria-label="left"
        @pointerdown.prevent.stop="pressMove(-1, 0)"
        @pointerup.prevent.stop="releaseMove"
        @pointerleave.prevent.stop="releaseMove"
        @pointercancel.prevent.stop="releaseMove"
      >
        <q-icon name="keyboard_arrow_left" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--right"
        aria-label="right"
        @pointerdown.prevent.stop="pressMove(1, 0)"
        @pointerup.prevent.stop="releaseMove"
        @pointerleave.prevent.stop="releaseMove"
        @pointercancel.prevent.stop="releaseMove"
      >
        <q-icon name="keyboard_arrow_right" size="22px"/>
      </button>
      <button
        type="button"
        class="joy-key joy-key--dir joy-key--down"
        aria-label="down"
        @pointerdown.prevent.stop="pressMove(0, -1)"
        @pointerup.prevent.stop="releaseMove"
        @pointerleave.prevent.stop="releaseMove"
        @pointercancel.prevent.stop="releaseMove"
      >
        <q-icon name="keyboard_arrow_down" size="22px"/>
      </button>
      <!-- 仅中心可拖，外圈白环上直接放方向箭头 -->
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
  /* 相对左下角略向右上挪 */
  left: 2.75rem;
  bottom: 2.4rem;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  pointer-events: none;
}

.joy-turn {
  display: flex;
  gap: 2.75rem;
  pointer-events: none;
}

/* 整体略小；灰心更小、白环更窄，比例更紧凑 */
.joy-pad {
  position: relative;
  width: 138px;
  height: 138px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(
    circle at center,
    #D0D0D0 0 24%,
    #ffffff 25% 100%
  );
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
}

/* 中心拖拽区（与灰心接近） */
.joy-nipple {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 30%;
  height: 30%;
  transform: translate(-50%, -50%);
  pointer-events: auto;
  z-index: 1;
}

.joy-key {
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  cursor: pointer;
  -webkit-user-select: none;
  user-select: none;
  touch-action: none;
  background: transparent;
  padding: 0;
}

.joy-key--turn {
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 50%;
  color: rgba(33, 33, 33, 0.85);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.16);
}
.joy-key--turn:active {
  background: rgba(25, 118, 210, 0.18);
  color: #1565c0;
}

/* 无白色小圆包裹，箭头嵌在白环上 */
.joy-key--dir {
  position: absolute;
  width: 1.9rem;
  height: 1.9rem;
  z-index: 4;
  border-radius: 0;
  color: #424242;
  background: transparent;
  box-shadow: none;
}
.joy-key--dir:active {
  color: #1565c0;
}

.joy-key--up {
  left: 50%;
  top: 5px;
  transform: translateX(-50%);
}
.joy-key--down {
  left: 50%;
  bottom: 5px;
  transform: translateX(-50%);
}
.joy-key--left {
  left: 5px;
  top: 50%;
  transform: translateY(-50%);
}
.joy-key--right {
  right: 5px;
  top: 50%;
  transform: translateY(-50%);
}

/* 隐藏 nipple 自带背板色块，只用灰中心前钮 */
.joy-nipple :deep(.back) {
  background: transparent !important;
  opacity: 0 !important;
}
.joy-nipple :deep(.front) {
  background: #BDBDBD !important;
  opacity: 0.95;
}
</style>
