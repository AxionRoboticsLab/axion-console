<script setup>
import { Notify, useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject } from 'vue'

const $q = useQuasar()
const { t } = useI18n()

const publish = inject('publish')
const mapState = inject('mapState')
const mapBoardVisible = inject('mapBoardVisible', null)
const keepMapOnIdle = inject('keepMapOnIdle', null)

let lastSent = { cmd: '', t: 0 }
const MAP_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/

function mapCommand (command) {
  const now = Date.now()
  // 防止连点 / 事件冒泡导致发两次 start
  if (command === lastSent.cmd && now - lastSent.t < 400) {
    return
  }
  lastSent = { cmd: command, t: now }
  publish('/map_command', { data: command })
  // /map_state 经 rosbridge 可能丢包；本地立即切 UI
  if (command === 'start') {
    if (keepMapOnIdle) keepMapOnIdle.value = false
    mapState.value = 'mapping'
    if (mapBoardVisible) mapBoardVisible.value = true
  } else if (command.startsWith('save ')) {
    // 后端 save 成功后会发 idle；本地先退出建图，避免「点了没反应」
    if (keepMapOnIdle) keepMapOnIdle.value = false
    if (mapBoardVisible) mapBoardVisible.value = false
    mapState.value = 'idle'
    Notify.create({ type: 'positive', message: t('amr2d_saveMap_done') })
  }
}

function saveMap () {
  $q.dialog({
    title: t('amr2d_saveMap'),
    message: t('amr2d_saveMap_description'),
    prompt: {
      model: '',
      type: 'text' // optional
    },
    cancel: { label: t('cancel'), flat: true, color: 'secondary' },
    ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
    persistent: true
  }).onOk(data => {
    const name = String(data || '').trim()
    if (!MAP_NAME_RE.test(name)) {
      Notify.create({ type: 'negative', message: t('amr2d_saveMap_invalid_name') })
      return
    }
    mapCommand('save ' + name)
  })
}
</script>

<template>
  <q-btn no-wrap key="mapping" v-if="mapState === 'idle'" rounded :label="$t('amr2d_createMap')" color="secondary" icon="explore" @click="mapCommand('start')"/>
  <q-btn no-wrap key="save-map" v-else-if="mapState === 'mapping'" rounded :label="$t('amr2d_saveMap')" color="secondary" icon="save" @click="saveMap"/>
</template>
