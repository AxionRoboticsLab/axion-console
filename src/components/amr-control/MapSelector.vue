<script setup>
import { activateMap, deleteMap, listMaps } from 'src/api/maps'
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject, ref } from 'vue'

const $q = useQuasar()
const { t } = useI18n()
const visible = ref(false)
const loading = ref(false)
const publish = inject('publish')
const mapBoardVisible = inject('mapBoardVisible', null)
const keepMapOnIdle = inject('keepMapOnIdle', null)
const loadedMapName = inject('loadedMapName', null)
const loadedMapId = inject('loadedMapId', null)
const mapManager = inject('mapManager', null)

const maps = ref([])
const mapId = ref(null)

async function fetchMaps () {
  const rows = await listMaps()
  return (rows || []).map((m) => ({
    label: m.status === 1 ? `${m.map_name} (${t('map_status_active')})` : m.map_name,
    value: m.id,
    map_name: m.map_name,
    status: m.status,
    raw: m
  }))
}

async function show () {
  if (loading.value) return
  loading.value = true
  maps.value = []
  mapId.value = null
  visible.value = true
  try {
    maps.value = await fetchMaps()
    if (loadedMapId?.value && maps.value.some(m => m.value === loadedMapId.value)) {
      mapId.value = loadedMapId.value
    } else if (loadedMapName?.value) {
      const hit = maps.value.find(m => m.map_name === loadedMapName.value)
      if (hit) mapId.value = hit.value
    } else if (maps.value.length === 1) {
      mapId.value = maps.value[0].value
    }
  } catch (e) {
    console.warn('[MapSelector] listMaps failed', e)
    Notify.create({ type: 'negative', message: e.message || t('amr2d_loadMap_empty') })
  } finally {
    loading.value = false
  }
}

async function applyLoad (option) {
  const mapName = option?.map_name
  const id = option?.value
  if (!mapName || id == null) {
    Notify.create({ type: 'warning', message: t('amr2d_loadMap_description') })
    return
  }
  try {
    await activateMap(id)
  } catch (e) {
    Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
    return
  }
  publish('/map_command', { data: 'load ' + mapName })
  if (keepMapOnIdle) keepMapOnIdle.value = true
  if (mapBoardVisible) mapBoardVisible.value = true
  if (loadedMapName) loadedMapName.value = mapName
  if (loadedMapId) loadedMapId.value = id
  visible.value = false
  Notify.create({ type: 'positive', message: t('amr2d_loadMap_done') + `: ${mapName}` })
}

function hasLoadedMap () {
  return Boolean(loadedMapName?.value) || Boolean(mapManager?.map)
}

function selectedOption () {
  return maps.value.find(m => m.value === mapId.value)
}

function selectMap () {
  const option = selectedOption()
  if (!option) {
    Notify.create({ type: 'warning', message: t('amr2d_loadMap_description') })
    return
  }
  const current = loadedMapName?.value || ''
  if (current && current === option.map_name) {
    Notify.create({ type: 'info', message: t('amr2d_loadMap_already', { name: current }) })
    visible.value = false
    return
  }
  if (hasLoadedMap() && current && current !== option.map_name) {
    $q.dialog({
      title: t('amr2d_loadMap_switch_title'),
      message: t('amr2d_loadMap_switch_confirm', { from: current, to: option.map_name }),
      cancel: { label: t('cancel'), flat: true, color: 'secondary' },
      ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
      persistent: true
    }).onOk(() => applyLoad(option))
    return
  }
  if (hasLoadedMap() && !current && option.map_name) {
    $q.dialog({
      title: t('amr2d_loadMap_switch_title'),
      message: t('amr2d_loadMap_switch_confirm_anon', { to: option.map_name }),
      cancel: { label: t('cancel'), flat: true, color: 'secondary' },
      ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
      persistent: true
    }).onOk(() => applyLoad(option))
    return
  }
  applyLoad(option)
}

function removeSelected () {
  const option = selectedOption()
  if (!option) {
    Notify.create({ type: 'warning', message: t('amr2d_loadMap_description') })
    return
  }
  $q.dialog({
    title: t('amr2d_deleteMap_title'),
    message: t('amr2d_deleteMap_confirm', { name: option.map_name }),
    cancel: { label: t('cancel'), flat: true, color: 'secondary' },
    ok: { label: t('ok'), flat: true, color: 'negative', class: 'text-bold' },
    persistent: true
  }).onOk(async () => {
    try {
      await deleteMap(option.value)
      if (loadedMapId?.value === option.value) {
        if (loadedMapName) loadedMapName.value = ''
        if (loadedMapId) loadedMapId.value = null
      }
      maps.value = await fetchMaps()
      mapId.value = maps.value[0]?.value ?? null
      Notify.create({ type: 'positive', message: t('amr2d_deleteMap_done') })
    } catch (e) {
      Notify.create({ type: 'negative', message: e.message || t('nav_publish_failed') })
    }
  })
}
</script>

<template>
  <q-btn
    no-wrap rounded outline
    class="amr-rail__btn"
    :label="$t('amr2d_loadMap')"
    color="grey-7"
    icon="download"
    :loading="loading"
    @click="show"
  />
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
      <q-card-section class="row items-center justify-between q-pa-sm">
        <q-btn
          color="negative"
          flat
          :disable="loading || maps.length === 0 || mapId == null"
          :label="$t('amr2d_deleteMap')"
          @click="removeSelected"
        />
        <div>
          <q-btn color="secondary" flat v-close-popup :label="$t('cancel')"/>
          <q-btn
            color="primary"
            flat
            :disable="loading || maps.length === 0 || mapId == null"
            @click="selectMap"
            :label="$t('ok')"
            class="text-bold"
          />
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
