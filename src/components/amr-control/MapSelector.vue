<script setup>
import { Notify } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject, ref } from 'vue'

const { t } = useI18n()
const visible = ref(false)
const loading = ref(false)
const rosClient = inject('rosClient')
const publish = inject('publish')
const mapBoardVisible = inject('mapBoardVisible', null)
const keepMapOnIdle = inject('keepMapOnIdle', null)

const maps = ref([])
const mapId = ref('')

async function show () {
  if (loading.value) return
  loading.value = true
  maps.value = []
  mapId.value = ''
  visible.value = true
  try {
    const response = await rosClient.call('/get_map_files', {}, { timeoutMs: 8000 })
    const message = response?.values?.message ?? response?.values?.[0]?.message ?? ''
    maps.value = String(message || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(item => ({ label: item, value: item }))
  } catch (e) {
    console.error(e)
    Notify.create({ type: 'negative', message: t('amr2d_loadMap_failed') })
  } finally {
    loading.value = false
  }
}

function selectMap () {
  if (!mapId.value) {
    Notify.create({ type: 'warning', message: t('amr2d_loadMap_description') })
    return
  }
  publish('/map_command', { data: 'load ' + mapId.value })
  if (keepMapOnIdle) keepMapOnIdle.value = true
  if (mapBoardVisible) mapBoardVisible.value = true
  visible.value = false
  Notify.create({ type: 'positive', message: t('amr2d_loadMap_done') })
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
      <q-card-section v-else-if="maps.length === 0" class="text-subtitle1 text-grey-7 text-bold">
        {{$t('amr2d_loadMap_empty')}}
        <div class="text-caption q-mt-sm text-weight-regular">
          {{$t('amr2d_loadMap_hint')}}
        </div>
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
        <q-btn color="primary" flat :disable="loading || maps.length === 0" @click="selectMap" :label="$t('ok')" class="text-bold"/>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>
