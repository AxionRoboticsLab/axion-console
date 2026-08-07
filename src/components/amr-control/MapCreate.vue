<script setup>
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { inject } from 'vue'

const $q = useQuasar()
const { t } = useI18n()

const publish = inject('publish')
const mapState = inject('mapState')

let lastSent = { cmd: '', t: 0 }

function mapCommand (command) {
  const now = Date.now()
  // 防止连点 / 事件冒泡导致发两次 start
  if (command === lastSent.cmd && now - lastSent.t < 400) {
    return
  }
  lastSent = { cmd: command, t: now }
  publish('/map_command', { data: command })
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
    mapCommand('save ' + data)
  })
}
</script>

<template>
  <q-btn no-wrap key="mapping" v-if="mapState === 'idle'" rounded :label="$t('amr2d_createMap')" color="secondary" icon="explore" @click="mapCommand('start')"/>
  <q-btn no-wrap key="save-map" v-else-if="mapState === 'mapping'" rounded :label="$t('amr2d_saveMap')" color="secondary" icon="save" @click="saveMap"/>
</template>
