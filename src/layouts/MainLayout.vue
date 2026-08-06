<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title>
          {{ headerTitle }}
        </q-toolbar-title>

        <div>Axion Console</div>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list padding>
        <q-item-label header>
          {{ t('menu') }}
        </q-item-label>

        <q-expansion-item
          v-for="mod in modules"
          :key="mod.id"
          :icon="mod.icon"
          :label="t(mod.title)"
          :caption="t(mod.caption)"
          header-class="text-primary"
          expand-separator
          default-opened
        >
          <RouterItem
            v-for="item in mod.children"
            :key="item.link"
            :title="item.title"
            :caption="item.caption"
            :icon="item.icon"
            :link="item.link"
            @close-drawer="leftDrawerOpen = false"
          />
        </q-expansion-item>
      </q-list>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Links from 'src/router/Links'
import RouterItem from 'layouts/RouterItem.vue'

defineOptions({
  name: 'MainLayout'
})

const leftDrawerOpen = ref(true)
const { t } = useI18n()
const $route = useRoute()
const modules = Links('modules')

const headerTitle = computed(() => {
  const key = 'router_' + $route.name
  const translated = t(key)
  return translated === key ? t('menu') : translated
})

function toggleLeftDrawer () {
  leftDrawerOpen.value = !leftDrawerOpen.value
}
</script>
