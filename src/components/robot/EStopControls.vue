<script setup>
/**
 * 急停 / 解除急停（一组按钮）。急停只影响运动，与告警事件解耦。
 */
import { computed, inject } from 'vue'
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useRobotRuntime } from 'stores/robot-runtime'

defineOptions({ name: 'EStopControls' })

const { t } = useI18n()
const runtime = useRobotRuntime()
const publish = inject('publish', null)

const estopActive = computed(() => Boolean(runtime.estop))

function publishEstop (active) {
  if (typeof publish !== 'function') {
    Notify.create({ type: 'warning', message: t('robot_estop_ros_needed') })
    return
  }
  try {
    publish('/estop', { data: Boolean(active) })
    runtime.setEstop(Boolean(active))
    Notify.create({
      type: active ? 'negative' : 'positive',
      message: t(active ? 'robot_estop_on_toast' : 'robot_estop_off_toast')
    })
  } catch (e) {
    console.warn('[EStop] publish failed', e)
    Notify.create({ type: 'negative', message: e.message || t('robot_estop_failed') })
  }
}
</script>

<template>
  <div class="estop-controls column q-gutter-y-xs">
    <div class="text-caption text-grey-7 q-px-xs">{{ t('robot_estop_group') }}</div>
    <q-btn
      class="estop-controls__btn"
      rounded
      no-wrap
      unelevated
      color="negative"
      icon="emergency"
      :label="t('robot_estop')"
      :disable="estopActive"
      @click="publishEstop(true)"
    />
    <q-btn
      class="estop-controls__btn"
      rounded
      no-wrap
      :outline="!estopActive"
      :unelevated="estopActive"
      color="positive"
      icon="play_circle"
      :label="t('robot_estop_clear')"
      :disable="!estopActive"
      @click="publishEstop(false)"
    />
  </div>
</template>

<style scoped>
.estop-controls__btn {
  width: 100%;
  justify-content: flex-start;
  font-size: 0.78rem;
  padding: 0.35rem 0.55rem;
}
</style>
