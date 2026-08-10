<script setup>
/**
 * 录包回放：优先播真实 video url；无文件时仍用 video + 原生控件，
 * 并用点位时间轴驱动演示进度。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  report: { type: Object, default: null }
})

const { t } = useI18n()
const videoRef = ref(null)
const muted = ref(false)
const playing = ref(false)
const cursor = ref(0)
let timer = null

const playback = computed(() => props.report?.playback || {})
const videoUrl = computed(() => playback.value.url || '')
const hasRealVideo = computed(() => Boolean(videoUrl.value))

const waypoints = computed(() => {
  const route = props.report?.route || []
  const pts = route.map((name, i) => ({ i, name }))
  if (props.report?.charge) {
    pts.push({ i: pts.length, name: props.report.charge?.name || t('charge_point') })
  }
  return pts
})
const total = computed(() => Math.max(waypoints.value.length, 1))
const currentLabel = computed(() => {
  if (!waypoints.value.length) return '—'
  const idx = Math.min(Math.max(cursor.value - 1, 0), waypoints.value.length - 1)
  if (cursor.value <= 0) return waypoints.value[0]?.name || '—'
  return waypoints.value[idx]?.name || '—'
})

function stopTimer () {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function playDemo () {
  if (!waypoints.value.length) return
  playing.value = true
  stopTimer()
  const el = videoRef.value
  if (el) {
    try { await el.play() } catch (_) { /* 无源时可能失败，忽略 */ }
  }
  timer = setInterval(() => {
    if (cursor.value >= total.value) {
      pauseDemo()
      return
    }
    cursor.value += 1
  }, 1200)
}

function pauseDemo () {
  playing.value = false
  stopTimer()
  videoRef.value?.pause?.()
}

function resetDemo () {
  pauseDemo()
  cursor.value = 0
  const el = videoRef.value
  if (el) {
    el.currentTime = 0
  }
}

function toggleMute () {
  muted.value = !muted.value
  if (videoRef.value) videoRef.value.muted = muted.value
}

function onVideoPlay () {
  playing.value = true
  if (!hasRealVideo.value && !timer) playDemo()
}

function onVideoPause () {
  playing.value = false
  stopTimer()
}

watch(
  () => props.report?.summary?.exec_id,
  async () => {
    resetDemo()
    await nextTick()
    if (videoRef.value) videoRef.value.muted = muted.value
  }
)

onUnmounted(() => stopTimer())
</script>

<template>
  <div class="patrol-replay">
    <div class="patrol-replay__title">{{ t('patrol_replay_title') }}</div>
    <div class="text-caption text-grey-7 q-mb-sm">{{ t('patrol_replay_hint') }}</div>

    <div class="patrol-replay__frame">
      <video
        ref="videoRef"
        class="patrol-replay__video"
        controls
        playsinline
        preload="metadata"
        :src="videoUrl || undefined"
        :muted="muted"
        @play="onVideoPlay"
        @pause="onVideoPause"
      />

      <div v-if="!hasRealVideo" class="patrol-replay__overlay">
        <div class="patrol-replay__overlay-main">
          <q-icon name="movie" size="36px" color="white"/>
          <div class="q-mt-xs">{{ t('patrol_replay_demo_mode') }}</div>
          <div class="text-caption q-mt-xs" style="opacity: 0.85">
            {{ t('patrol_replay_now') }}: {{ currentLabel }}
            ({{ Math.min(cursor, total) }}/{{ total }})
          </div>
        </div>
        <div class="row q-gutter-xs justify-center q-mt-sm patrol-replay__dots">
          <q-badge
            v-for="p in waypoints"
            :key="p.i"
            :color="p.i < cursor ? 'teal' : 'grey-7'"
            :outline="p.i >= cursor"
          >
            {{ p.name }}
          </q-badge>
        </div>
      </div>
    </div>

    <div class="row items-center q-gutter-sm q-mt-md">
      <q-btn
        dense unelevated
        color="primary"
        icon="play_arrow"
        :label="t('patrol_replay_play')"
        :disable="playing"
        @click="hasRealVideo ? videoRef?.play() : playDemo()"
      />
      <q-btn
        dense unelevated
        color="warning"
        text-color="dark"
        icon="pause"
        :label="t('patrol_task_pause')"
        :disable="!playing"
        @click="hasRealVideo ? videoRef?.pause() : pauseDemo()"
      />
      <q-btn
        dense outline
        color="grey-8"
        :icon="muted ? 'volume_off' : 'volume_up'"
        :label="muted ? t('patrol_replay_unmute') : t('patrol_replay_mute')"
        @click="toggleMute"
      />
      <q-btn dense flat icon="replay" :label="t('patrol_replay_reset')" @click="resetDemo"/>
    </div>
  </div>
</template>

<style scoped>
.patrol-replay {
  height: 100%;
}

.patrol-replay__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #263238;
  margin-bottom: 0.35rem;
}

.patrol-replay__frame {
  position: relative;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 10px;
  overflow: hidden;
  background: #111;
  min-height: 260px;
}

.patrol-replay__video {
  display: block;
  width: 100%;
  min-height: 260px;
  max-height: 360px;
  object-fit: contain;
  background: #000;
}

.patrol-replay__overlay {
  position: absolute;
  inset: 0;
  bottom: 42px; /* 避开原生 controls */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(20, 40, 40, 0.55), rgba(10, 10, 10, 0.35));
  color: #fff;
  padding: 1rem;
  text-align: center;
}

.patrol-replay__dots {
  flex-wrap: wrap;
  max-width: 100%;
}
</style>
