<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated>
      <q-toolbar>
        <q-btn flat dense round icon="menu" aria-label="Menu" @click="toggleLeftDrawer" />

        <q-toolbar-title class="row items-center q-gutter-sm">
          <q-icon name="smart_toy" size="28px" />
          <span class="text-weight-bold">{{ brandName }}</span>
        </q-toolbar-title>
      </q-toolbar>
    </q-header>

    <q-drawer v-model="leftDrawerOpen" show-if-above bordered>
      <q-list padding>
        <q-item-label header>
          {{ t('menu') }}
        </q-item-label>

        <!-- Home: single entry, no expansion needed -->
        <RouterItem
          title="home"
          caption="home_description"
          icon="home"
          link="/"
          @close-drawer="leftDrawerOpen = false"
        />

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
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Links from 'src/router/Links'
import RouterItem from 'layouts/RouterItem.vue'

defineOptions({
  name: 'MainLayout'
})

// Brand shown in header (change anytime)
const brandName = 'AXION'

const leftDrawerOpen = ref(true)
const { t } = useI18n()

// exclude home from expansion list (rendered separately above)
const modules = Links('modules').filter((m) => m.id !== 'home')

function toggleLeftDrawer () {
  leftDrawerOpen.value = !leftDrawerOpen.value
}
</script>
