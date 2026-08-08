<script setup>
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject, ref } from 'vue'

const $q = useQuasar()
const { t } = useI18n()
const visible = ref(false)
const loading = ref(false)
const rosClient = inject('rosClient')
const publish = inject('publish')
const mapBoardVisible = inject('mapBoardVisible', null)
const keepMapOnIdle = inject('keepMapOnIdle', null)

const maps = ref([])
const mapId = ref('')
const manualName = ref('')

function parseNames (message) {
  return String(message || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(item => ({ label: item, value: item }))
}

async function fetchNames () {
  // 1) 话题路径（与建图命令同一通道，最稳）
  try {
    const message = await rosClient.requestMapList(5000)
    return parseNames(message)
  } catch (e) {
    console.warn('[MapSelector] topic list failed', e)
  }
  // 2) 兼容旧服务（rosbridge 上常超时）
  try {
    const response = await rosClient.call('/get_map_files', {}, { timeoutMs: 3000 })
    const message = response?.values?.message ?? response?.values?.[0]?.message ?? ''
    return parseNames(message)
  } catch (e) {
    console.warn('[MapSelector] service list failed', e)
  }
  return []
}

async function show () {
  if (loading.value) return
  loading.value = true
  maps.value = []
  mapId.value = ''
  manualName.value = ''
  visible.value = true
  try {
    maps.value = await fetchNames()
    if (maps.value.length === 1) {
      mapId.value = maps.value[0].value
    }
    if (maps.value.length === 0) {
      Notify.create({ type: 'warning', message: t('amr2d_loadMap_failed') })
    }
  } finally {
    loading.value = false
  }
}

function applyLoad (name) {
  const mapName = String(name || '').trim()
  if (!mapName) {
    Notify.create({ type: 'warning', message: t('amr2d_loadMap_description') })
    return
  }
  publish('/map_command', { data: 'load ' + mapName })
  if (keepMapOnIdle) keepMapOnIdle.value = true
  if (mapBoardVisible) mapBoardVisible.value = true
  visible.value = false
  Notify.create({ type: 'positive', message: t('amr2d_loadMap_done') + `: ${mapName}` })
}

function selectMap () {
  if (mapId.value) {
    applyLoad(mapId.value)
    return
  }
  if (manualName.value) {
    applyLoad(manualName.value)
    return
  }
  // 列表失败时弹窗手输（磁盘上有 v1 即可直接 load）
  $q.dialog({
    title: t('amr2d_loadMap'),
    message: t('amr2d_loadMap_manual'),
    prompt: { model: 'v1', type: 'text' },
    cancel: { label: t('cancel'), flat: true, color: 'secondary' },
    ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
    persistent: true
  }).onOk((data) => applyLoad(data))
}

</script>

<template>
  <q-btn no-wrap rounded :label="$t('amr2d_loadMap')" color="primary" icon="download" :loading="loading" @click="show"/>
  <q-dialog v-model="visible" persistent>
    <q-card>
      <q-card-section class="text-h6" style="min-width: 20rem">
        <div>{{ $t('amr2d_loadMap') }}</div>
      </q-card-section>
      <q-separator/>
      <q-card-section v-if="loading" class="text-subtitle1 text-grey-7">
        {{ $t('amr2d_loadMap_loading') }}
      </q-card-section>
      <q-card-section v-else-if="maps.length === 0" class="text-subtitle1 text-grey-7">
        <div class="text-bold">{{$t('amr2d_loadMap_empty')}}</div>
        <div class="text-caption q-mt-sm text-weight-regular">
          {{$t('amr2d_loadMap_hint')}}
        </div>
        <q-input
          class="q-mt-md"
          dense
          outlined
          v-model="manualName"
          :label="$t('amr2d_loadMap_manual')"
          placeholder="v1"
        />
      </q-card-section>
      <q-card-section v-else>
        <q-option-group
          :options="maps"
          type="radio"
          v-model="mapId"
        />
      </q-card-section>
      <q-separator/>
      <q-card-section class="text-right q-pa-sm">
        <q-btn color="secondary" flat v-close-popup :label="$t('cancel')"/>
        <q-btn
          color="primary"
          flat
          :disable="loading || (maps.length > 0 && !mapId) || (maps.length === 0 && !manualName.trim())"
          @click="selectMap"
          :label="$t('ok')"
          class="text-bold"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
