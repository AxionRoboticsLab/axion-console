<script setup>
import { upsertMap } from 'src/api/maps'
import { isValidIdentityName, normalizeIdentityName } from 'src/utils/naming'
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject } from 'vue'

const $q = useQuasar()
const { t } = useI18n()

const publish = inject('publish')
const mapState = inject('mapState')
const mapBoardVisible = inject('mapBoardVisible', null)
const keepMapOnIdle = inject('keepMapOnIdle', null)
const loadedMapName = inject('loadedMapName', null)

let lastSent = { cmd: '', t: 0 }

function mapCommand (command) {
  const now = Date.now()
  if (command === lastSent.cmd && now - lastSent.t < 400) {
    return
  }
  lastSent = { cmd: command, t: now }
  publish('/map_command', { data: command })
  if (command === 'start') {
    if (keepMapOnIdle) keepMapOnIdle.value = false
    if (loadedMapName) loadedMapName.value = ''
    mapState.value = 'mapping'
    if (mapBoardVisible) mapBoardVisible.value = true
  }
}

function saveMap () {
  $q.dialog({
    title: t('amr2d_saveMap'),
    message: t('amr2d_saveMap_description'),
    prompt: {
      model: '',
      type: 'text',
      isValid: (val) => isValidIdentityName(val)
    },
    cancel: { label: t('cancel'), flat: true, color: 'secondary' },
    ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
    persistent: true
  }).onOk(async (data) => {
    const name = normalizeIdentityName(data)
    if (!isValidIdentityName(name)) {
      Notify.create({ type: 'negative', message: t('amr2d_saveMap_invalid_name') })
      return
    }
    mapCommand('save ' + name)
    if (keepMapOnIdle) keepMapOnIdle.value = false
    if (mapBoardVisible) mapBoardVisible.value = false
    if (loadedMapName) loadedMapName.value = ''
    mapState.value = 'idle'
    try {
      await upsertMap(name, true)
      Notify.create({ type: 'positive', message: t('amr2d_saveMap_done') })
    } catch (e) {
      Notify.create({
        type: 'warning',
        message: t('amr2d_saveMap_done') + ' / ' + (e.message || t('amr2d_saveMap_db_warn'))
      })
    }
  })
}
</script>

<template>
  <q-btn no-wrap key="mapping" v-if="mapState === 'idle'" rounded :label="$t('amr2d_createMap')" color="secondary" icon="explore" @click="mapCommand('start')"/>
  <q-btn no-wrap key="save-map" v-else-if="mapState === 'mapping'" rounded :label="$t('amr2d_saveMap')" color="secondary" icon="save" @click="saveMap"/>
</template>
