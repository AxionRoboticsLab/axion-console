<script setup>
/**
 * 导航点（一期）：前端本地管理。
 * 原 ros2d 依赖自定义服务 /pose_list，axion-slam 尚未实现，导致新增无效。
 * 按当前地图名持久化到 localStorage，后续再接后端/Nav2。
 */
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { computed, inject, ref, watch } from 'vue'

const { t } = useI18n()
const pageMode = inject('pageMode')
const robotPose = inject('robotPose')
const mapManager = inject('mapManager')
const loadedMapName = inject('loadedMapName', null)

const visible = computed(() => pageMode.value === 'mapPose')
const poseList = ref([])
const selected = ref('')
let nextSeq = 1

function storageKey () {
  const map = loadedMapName?.value || '_default'
  return `axion.nav_poses.${map}`
}

function normalizePose (raw) {
  if (!raw) return null
  // PoseStamped: { header, pose: { position, orientation } }
  // 或扁平: { position, orientation }
  const pose = raw.pose?.position ? raw.pose : raw
  if (!pose?.position || !pose?.orientation) return null
  return {
    position: {
      x: Number(pose.position.x) || 0,
      y: Number(pose.position.y) || 0,
      z: Number(pose.position.z) || 0
    },
    orientation: {
      x: Number(pose.orientation.x) || 0,
      y: Number(pose.orientation.y) || 0,
      z: Number(pose.orientation.z) || 0,
      w: pose.orientation.w == null ? 1 : Number(pose.orientation.w)
    }
  }
}

function currentRobotPose () {
  return normalizePose(robotPose?.value) ||
    normalizePose(mapManager?.pose) ||
    null
}

function toStamped (pose, seq) {
  return {
    header: {
      seq,
      frame_id: 'map',
      stamp: { sec: 0, nanosec: 0 }
    },
    pose
  }
}

function persist () {
  try {
    localStorage.setItem(storageKey(), JSON.stringify({
      nextSeq,
      poses: poseList.value
    }))
  } catch (e) {
    console.warn('[PoseManager] persist failed', e)
  }
}

function loadLocal () {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) {
      poseList.value = []
      nextSeq = 1
      return
    }
    const data = JSON.parse(raw)
    poseList.value = Array.isArray(data.poses) ? data.poses : []
    nextSeq = Number(data.nextSeq) || (poseList.value.length + 1)
  } catch (e) {
    poseList.value = []
    nextSeq = 1
  }
}

function refreshMapMarkers () {
  mapManager?.loadPoseList?.(poseList.value)
}

watch(visible, (value) => {
  if (value) {
    loadLocal()
    refreshMapMarkers()
  } else {
    mapManager?.loadPoseList?.([])
  }
})

watch(() => loadedMapName?.value, () => {
  if (!visible.value) return
  loadLocal()
  refreshMapMarkers()
})

function addPose () {
  const pose = currentRobotPose()
  if (!pose) {
    Notify.create({ type: 'warning', message: t('mapPose_no_robot') })
    return
  }
  const stamped = toStamped(pose, nextSeq++)
  poseList.value = [...poseList.value, stamped]
  persist()
  refreshMapMarkers()
  selected.value = stamped.header.seq
  mapManager?.changePoseColor?.(stamped.header.seq)
  Notify.create({
    type: 'positive',
    message: t('mapPose_added', { id: stamped.header.seq })
  })
}

function savePoses () {
  persist()
  Notify.create({ type: 'positive', message: t('mapPose_saved', { n: poseList.value.length }) })
}

function reloadPoses () {
  loadLocal()
  refreshMapMarkers()
  Notify.create({ type: 'info', message: t('mapPose_reloaded', { n: poseList.value.length }) })
}

function choose (pose) {
  selected.value = pose.header.seq
  mapManager?.changePoseColor?.(pose.header.seq)
  // 尚未接 Nav2：点击收藏点 = 设为「去这里」的目标
  if (pose?.pose) {
    mapManager?.updateTargetPose?.(pose.pose)
    Notify.create({ type: 'info', message: t('nav_goto_done') })
  }
}

function removeSelected () {
  if (selected.value === '' || selected.value == null) {
    Notify.create({ type: 'warning', message: t('mapPose_select_first') })
    return
  }
  poseList.value = poseList.value.filter(p => p.header.seq !== selected.value)
  selected.value = ''
  persist()
  refreshMapMarkers()
}
</script>

<template>
  <q-dialog v-model="visible" seamless :position="$q.screen.lt.sm ? 'top' : 'right'">
    <q-card style="min-width: 14rem">
      <q-card-section class="text-h6">
        {{ $t('mapPose_title') }}
        <div class="text-caption text-grey-7 text-weight-regular">
          {{ loadedMapName ? $t('amr2d_loadMap_current', { name: loadedMapName }) : $t('mapPose_local_hint') }}
        </div>
      </q-card-section>
      <q-separator/>
      <q-card-section>
        <q-list v-if="poseList.length" bordered separator dense style="overflow: auto; max-height: 30vh">
          <q-item
            v-for="item in poseList"
            :key="item.header.seq"
            clickable
            v-ripple
            :active="selected === item.header.seq"
            active-class="bg-teal-5 text-white"
            @click="choose(item)"
          >
            <q-item-section>
              #{{ item.header.seq }}
              <span class="text-caption">
                ({{ item.pose.position.x.toFixed(2) }}, {{ item.pose.position.y.toFixed(2) }})
              </span>
            </q-item-section>
          </q-item>
        </q-list>
        <div v-else class="text-grey-7 text-body2">
          {{ $t('mapPose_empty') }}
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
  <q-dialog seamless v-model="visible" position="bottom">
    <div class="q-pa-sm blur">
      <div class="flex justify-center q-gutter-sm">
        <q-btn :label="$t('mapPose_add')" icon="add" color="primary" @click="addPose"/>
        <q-btn :label="$t('mapPose_save')" icon="save" color="secondary" @click="savePoses"/>
        <q-btn :label="$t('mapPose_load')" icon="sync" color="primary" @click="reloadPoses"/>
        <q-btn :label="$t('mapPose_remove')" icon="delete" color="negative" outline @click="removeSelected"/>
      </div>
    </div>
  </q-dialog>
</template>
