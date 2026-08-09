<script setup>
/**
 * 重定位 → /initialpose；去这里 → /goal_pose（axion-nav mock / 后续 Nav2）
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { computed, inject, ref, watch } from 'vue'

const { t } = useI18n()
const pageMode = inject('pageMode')
const robotPose = inject('robotPose')
const mapManager = inject('mapManager')
const publish = inject('publish')

/** pageMode: relocate | goto */
const mode = computed(() => pageMode.value)
const active = computed(() => mode.value === 'relocate' || mode.value === 'goto')

const step = ref('position') // position | direction | done
const clicked = ref(false)
const tempPose = ref({
  position: { x: 0, y: 0, z: 0 },
  orientation: { x: 0, y: 0, z: 0, w: 1 }
})

const hint = computed(() => {
  if (mode.value === 'relocate') {
    return step.value === 'position'
      ? t('nav_hint_relocate_pos')
      : t('nav_hint_relocate_dir')
  }
  if (mode.value === 'goto') {
    return step.value === 'position'
      ? t('nav_hint_goto_pos')
      : t('nav_hint_goto_dir')
  }
  return ''
})

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

function publishInitialPose (pose) {
  const covariance = Array(36).fill(0)
  covariance[0] = 0.25
  covariance[7] = 0.25
  covariance[35] = 0.07
  publish('/initialpose', {
    header: stampHeader(),
    pose: {
      pose: {
        position: { ...pose.position },
        orientation: { ...pose.orientation }
      },
      covariance
    }
  })
}

function publishGoalPose (pose) {
  publish('/goal_pose', {
    header: stampHeader(),
    pose: {
      position: { ...pose.position },
      orientation: { ...pose.orientation }
    }
  })
}

function resetInteraction () {
  step.value = 'position'
  clicked.value = false
  mapManager.changeLocation = false
  mapManager.changeDirection = false
  mapManager.drawPath = false
  mapManager.drawPathEnd?.()
}

function begin () {
  resetInteraction()
  const src = robotPose?.value?.pose || mapManager.pose
  if (src?.position) {
    tempPose.value = {
      position: { ...src.position },
      orientation: { ...(src.orientation || { x: 0, y: 0, z: 0, w: 1 }) }
    }
  }
  mapManager.changeLocation = true
  mapManager.changeDirection = false
}

function end () {
  resetInteraction()
  if (mode.value !== 'goto') {
    mapManager.removeTarget?.()
  }
}

watch(active, (on) => {
  if (on) begin()
  else end()
})

watch(mode, (m, prev) => {
  if ((m === 'relocate' || m === 'goto') && m !== prev) begin()
})

mapManager.changePose = (pos) => {
  if (!active.value || step.value !== 'position') return
  tempPose.value.position.x = pos.x
  tempPose.value.position.y = pos.y
  if (mode.value === 'relocate') {
    mapManager.updateRobotPose(tempPose.value)
  } else {
    mapManager.updateTargetPose(tempPose.value)
  }
  clicked.value = true
  step.value = 'direction'
  mapManager.changeLocation = false
  mapManager.changeDirection = true
}

mapManager.changeTheta = (pos) => {
  if (!active.value || step.value !== 'direction') return
  // 与地图箭头一致：yaw=0 朝 +Y（上），atan2(dx, dy)
  const dx = pos.x - tempPose.value.position.x
  const dy = pos.y - tempPose.value.position.y
  const theta = Math.atan2(dx, dy)
  tempPose.value.orientation = {
    x: 0,
    y: 0,
    z: Math.sin(theta / 2),
    w: Math.cos(theta / 2)
  }
  if (mode.value === 'relocate') {
    mapManager.updateRobotPose(tempPose.value)
  } else {
    mapManager.updateTargetPose(tempPose.value)
  }
  clicked.value = true
  step.value = 'done'
  mapManager.changeLocation = false
  mapManager.changeDirection = false
}

function confirm () {
  if (!clicked.value || step.value === 'position') {
    Notify.create({ type: 'warning', message: t('nav_need_click_map') })
    return
  }
  if (mode.value === 'relocate') {
    mapManager.updateRobotPose(tempPose.value)
    try {
      publishInitialPose(tempPose.value)
      Notify.create({ type: 'positive', message: t('nav_relocate_done') })
    } catch (e) {
      console.warn('[RobotRelocate] initialpose failed', e)
      Notify.create({ type: 'negative', message: t('nav_publish_failed') })
    }
  } else {
    mapManager.updateTargetPose(tempPose.value)
    try {
      publishGoalPose(tempPose.value)
      Notify.create({ type: 'positive', message: t('nav_goto_done') })
    } catch (e) {
      console.warn('[RobotRelocate] goal_pose failed', e)
      Notify.create({ type: 'negative', message: t('nav_publish_failed') })
    }
  }
  pageMode.value = 'default'
}

function cancel () {
  clicked.value = false
  pageMode.value = 'default'
  mapManager.removeTarget?.()
  resetInteraction()
}

defineExpose({ cancel, confirm })
</script>

<template>
  <q-dialog seamless :model-value="active" position="bottom" persistent>
    <div class="q-pa-sm nav-tool-bar">
      <div class="text-center text-body2 text-grey-9 q-mb-xs">{{ hint }}</div>
      <div class="flex justify-center q-gutter-sm">
        <q-btn rounded color="secondary" :label="$t('cancel')" @click="cancel"/>
        <q-btn
          rounded
          color="primary"
          :label="$t('ok')"
          :disable="step === 'position'"
          class="text-bold"
          @click="confirm"
        />
      </div>
    </div>
  </q-dialog>
</template>

<style scoped>
.nav-tool-bar {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  min-width: min(92vw, 28rem);
}
</style>
