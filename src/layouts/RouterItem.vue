<template>
  <q-item clickable v-ripple @click="handleClick(link)">
    <q-item-section avatar v-if="icon">
      <q-icon :name="icon" />
    </q-item-section>

    <q-item-section>
      <q-item-label>{{ $t(title) }}</q-item-label>
      <q-item-label caption>{{ $t(caption) }}</q-item-label>
    </q-item-section>
  </q-item>
</template>

<script>
import { useRouter } from 'vue-router'

export default {
  name: 'RouterItem',
  props: {
    title: { type: String },
    caption: { type: String, default: '' },
    link: { type: String, default: '/' },
    icon: { type: String, default: '' }
  },
  emits: ['close-drawer'],
  setup (props, context) {
    const router = useRouter()
    return {
      handleClick (target) {
        context.emit('close-drawer')
        router.push(target)
      }
    }
  }
}
</script>
