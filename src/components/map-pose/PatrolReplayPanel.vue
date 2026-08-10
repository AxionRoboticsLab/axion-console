<script setup>
/**
 * 执行报告内的录包回放区。
 * 有 video url 则播文件；否则按规划点位做演示时间轴回放（模拟 rosbag）。
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  report: { type: Object, default: null }
})

const { t } = useI18n()
const playing = ref(false)
const cursor = ref(0)
let timer = null

const playback = computed(() => props.report?.playback || {})
const videoUrl = computed(() => playback.value.url || '')
const waypoints = computed(() => {
  const route = props.report?.route || []
  const pts = route.map((name, i) => ({ i, name }))
  if (props.report?.charge) {
    pts.push({ i: pts.length, name: props.report.charge?.name || t('charge_point') })
  }
  return pts
})
const total = computed(() => Math.max(waypoints.value.length, 1))
const progress = computed(() => Math.min(100, Math.round((cursor.value / total.value) * 100)))
const currentLabel = computed(() => {
  if (!waypoints.value.length) return '—'
  const idx = Math.min(cursor.value, waypoints.value.length - 1)
  return waypoints.value[idx]?.name || '—'
})

function stopTimer () {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function play () {
  if (videoUrl.value) return
  if (!waypoints.value.length) return
  playing.value = true
  stopTimer()
  timer = setInterval(() => {
    if (cursor.value >= total.value) {
      pause()
      return
    }
    cursor.value += 1
  }, 1200)
}

function pause () {
  playing.value = false
  stopTimer()
}

function reset () {
  pause()
  cursor.value = 0
}

function seek (v) {
  cursor.value = Number(v) || 0
}

watch(
  () => props.report?.summary?.exec_id,
  () => { reset() }
)

onUnmounted(() => stopTimer())
</script>

<template>
  <div class="patrol-replay">
    <div class="text-subtitle2 q-mb-sm">{{ t('patrol_replay_title') }}</div>
    <div class="text-caption text-grey-7 q-mb-md">{{ t('patrol_replay_hint') }}</div>

    <div v-if="videoUrl" class="patrol-replay__video">
      <video :src="videoUrl" controls playsinline class="full-width"/>
    </div>

    <div v-else class="patrol-replay__stage column items-center justify-center">
      <q-icon name="movie" size="48px" color="teal-6"/>
      <div class="text-body1 q-mt-sm">{{ t('patrol_replay_demo_mode') }}</div>
      <div class="text-caption text-grey-7 q-mt-xs">
        {{ t('patrol_replay_now') }}: {{ currentLabel }}
        <span class="q-ml-sm">({{ Math.min(cursor, total) }}/{{ total }})</span>
      </div>
      <div class="row q-gutter-sm q-mt-md patrol-replay__dots">
        <q-badge
          v-for="p in waypoints"
          :key="p.i"
          :color="p.i < cursor ? 'teal' : (p.i === cursor && playing ? 'primary' : 'grey-5')"
          :outline="p.i >= cursor"
        >
          {{ p.name }}
        </q-badge>
      </div>
    </div>

    <div v-if="!videoUrl" class="row items-center q-gutter-sm q-mt-md">
      <q-btn
        dense unelevated
        :color="playing ? 'warning' : 'primary'"
        :icon="playing ? 'pause' : 'play_arrow'"
        :label="playing ? t('patrol_task_pause') : t('patrol_replay_play')"
        @click="playing ? pause() : play()"
      />
      <q-btn dense flat icon="replay" :label="t('patrol_replay_reset')" @click="reset"/>
      <q-slider
        class="col"
        :min="0"
        :max="total"
        :model-value="cursor"
        label
        @update:model-value="seek"
      />
      <div class="text-caption text-grey-7" style="min-width: 3rem">{{ progress }}%</div>
    </div>
  </div>
</template>

<style scoped>
.patrol-replay__stage {
  min-height: 220px;
  border-radius: 10px;
  background: linear-gradient(160deg, #e0f2f1 0%, #eceff1 55%, #f5f5f5 100%);
  border: 1px solid rgba(0, 0, 0, 0.06);
  padding: 1.25rem;
}
.patrol-replay__video {
  border-radius: 10px;
  overflow: hidden;
  background: #111;
}
.patrol-replay__video video {
  display: block;
  max-height: 320px;
  object-fit: contain;
  background: #000;
}
.patrol-replay__dots {
  flex-wrap: wrap;
  justify-content: center;
  max-width: 100%;
}
</style>
