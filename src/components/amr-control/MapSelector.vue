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
const loadedMapName = inject('loadedMapName', null)
const mapManager = inject('mapManager', null)

const maps = ref([])
const mapId = ref('')

function parseNames (message) {
  return String(message || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(item => ({ label: item, value: item }))
}

async function fetchNames () {
  try {
    const message = await rosClient.requestMapList(6000)
    return parseNames(message)
  } catch (e) {
    console.warn('[MapSelector] topic list failed', e)
  }
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
  visible.value = true
  try {
    maps.value = await fetchNames()
    if (loadedMapName?.value && maps.value.some(m => m.value === loadedMapName.value)) {
      mapId.value = loadedMapName.value
    } else if (maps.value.length === 1) {
      mapId.value = maps.value[0].value
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
  if (loadedMapName) loadedMapName.value = mapName
  visible.value = false
  Notify.create({ type: 'positive', message: t('amr2d_loadMap_done') + `: ${mapName}` })
}

function hasLoadedMap () {
  return Boolean(loadedMapName?.value) || Boolean(mapManager?.map)
}

function selectMap () {
  if (!mapId.value) {
    Notify.create({ type: 'warning', message: t('amr2d_loadMap_description') })
    return
  }
  const current = loadedMapName?.value || ''
  if (current && current === mapId.value) {
    Notify.create({ type: 'info', message: t('amr2d_loadMap_already', { name: current }) })
    visible.value = false
    return
  }
  if (hasLoadedMap() && current && current !== mapId.value) {
    $q.dialog({
      title: t('amr2d_loadMap_switch_title'),
      message: t('amr2d_loadMap_switch_confirm', { from: current, to: mapId.value }),
      cancel: { label: t('cancel'), flat: true, color: 'secondary' },
      ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
      persistent: true
    }).onOk(() => applyLoad(mapId.value))
    return
  }
  if (hasLoadedMap() && !current && mapId.value) {
    // 有栅格但无名字记录时也二次确认
    $q.dialog({
      title: t('amr2d_loadMap_switch_title'),
      message: t('amr2d_loadMap_switch_confirm_anon', { to: mapId.value }),
      cancel: { label: t('cancel'), flat: true, color: 'secondary' },
      ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
      persistent: true
    }).onOk(() => applyLoad(mapId.value))
    return
  }
  applyLoad(mapId.value)
}

</script>

<template>
  <q-btn no-wrap rounded :label="$t('amr2d_loadMap')" color="primary" icon="download" :loading="loading" @click="show"/>
  <q-dialog v-model="visible" persistent>
    <q-card>
      <q-card-section class="text-h6" style="min-width: 20rem">
        <div>{{ $t('amr2d_loadMap') }}</div>
        <div v-if="loadedMapName" class="text-caption text-grey-7 text-weight-regular">
          {{ $t('amr2d_loadMap_current', { name: loadedMapName }) }}
        </div>
      </q-card-section>
      <q-separator/>
      <q-card-section v-if="loading" class="text-subtitle1 text-grey-7">
        {{ $t('amr2d_loadMap_loading') }}
      </q-card-section>
      <q-card-section v-else-if="maps.length === 0" class="text-subtitle1 text-grey-7 text-bold">
        {{ $t('amr2d_loadMap_empty') }}
        <div class="text-caption q-mt-sm text-weight-regular">
          {{ $t('amr2d_loadMap_hint') }}
        </div>
      </q-card-section>
      <q-card-section v-else>
        <div class="text-body2 text-grey-8 q-mb-sm">{{ $t('amr2d_loadMap_description') }}</div>
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
          :disable="loading || maps.length === 0 || !mapId"
          @click="selectMap"
          :label="$t('ok')"
          class="text-bold"
        />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
