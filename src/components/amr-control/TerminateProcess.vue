<script setup>

import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { computed, inject } from 'vue'

const $q = useQuasar()
const { t } = useI18n()
const rosClient = inject('rosClient')
const mapState = inject('mapState')

const stopLabel = computed(() =>
  mapState.value === 'mapping' ? t('cancel') : t('amr2d_stop_process')
)

function stopProcess () {
  const isMapping = mapState.value === 'mapping'
  $q.dialog({
    title: isMapping ? t('cancel') : t('amr2d_stop_process'),
    message: t('amr2d_stop_process_description'),
    cancel: { label: t('cancel'), flat: true, color: 'secondary' },
    ok: { label: t('ok'), flat: true, color: 'primary', class: 'text-bold' },
    persistent: true
  }).onOk(() => {
    rosClient.publish('/map_command', { data: 'stop' })
    mapState.value = 'terminating'
  })
}
</script>

<template>
  <q-btn
    no-wrap
    v-if="mapState !== 'idle'"
    key="stop-process"
    rounded
    :label="stopLabel"
    color="warning"
    :icon="mapState === 'mapping' ? 'close' : 'stop'"
    @click="stopProcess"
  />
</template>
