<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated class="bg-primary text-white">
      <q-toolbar class="q-px-md">
        <q-toolbar-title shrink class="row items-center q-gutter-sm q-mr-lg">
          <q-icon name="smart_toy" size="28px" />
          <span class="text-weight-bold">{{ brandName }}</span>
        </q-toolbar-title>

        <div class="row items-center no-wrap top-nav">
          <!-- Home: direct link, no dropdown -->
          <q-btn
            flat
            no-caps
            dense
            class="top-nav__item"
            icon="home"
            :label="t('home')"
            :class="{ 'top-nav__item--active': isActive('/') }"
            @click="go('/')"
          />

          <!-- Modules with hover dropdown -->
          <div
            v-for="mod in modules"
            :key="mod.id"
            class="top-nav__wrap"
            @mouseenter="openMenu(mod.id)"
            @mouseleave="closeMenu(mod.id)"
          >
            <q-btn
              flat
              no-caps
              dense
              class="top-nav__item"
              :icon="mod.icon"
              :label="t(mod.title)"
              :class="{ 'top-nav__item--active': isModuleActive(mod) }"
              :aria-expanded="openId === mod.id"
            >
              <q-icon name="arrow_drop_down" size="20px" class="q-ml-xs" />
            </q-btn>

            <q-menu
              v-model="menuOpen[mod.id]"
              anchor="bottom left"
              self="top left"
              :offset="[0, 4]"
              no-parent-event
              no-focus
              no-refocus
              class="top-nav__menu"
            >
              <q-list
                dense
                style="min-width: 220px"
                @mouseenter="openMenu(mod.id)"
                @mouseleave="closeMenu(mod.id)"
              >
                <q-item
                  v-for="item in mod.children"
                  :key="item.link"
                  clickable
                  v-ripple
                  v-close-popup
                  :active="isActive(item.link)"
                  active-class="bg-primary text-white"
                  @click="go(item.link)"
                >
                  <q-item-section avatar>
                    <q-icon :name="item.icon" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>{{ t(item.title) }}</q-item-label>
                    <q-item-label caption>{{ t(item.caption) }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </div>
        </div>

        <q-space />

        <!-- Original ros2d-quasar toolbar actions (was in drawer header) -->
        <div class="row items-center no-wrap q-gutter-xs">
          <q-btn
            flat
            round
            dense
            :icon="$q.fullscreen.isActive ? 'fullscreen_exit' : 'fullscreen'"
            :aria-label="t('toolbar_fullscreen')"
            @click="$q.fullscreen.toggle()"
          >
            <q-tooltip>{{ t('toolbar_fullscreen') }}</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="settings"
            :aria-label="t('toolbar_settings')"
            @click="go('/robot/setting')"
          >
            <q-tooltip>{{ t('toolbar_settings') }}</q-tooltip>
          </q-btn>
          <q-btn
            flat
            round
            dense
            icon="autorenew"
            :aria-label="t('toolbar_reload')"
            @click="router.go(0)"
          >
            <q-tooltip>{{ t('toolbar_reload') }}</q-tooltip>
          </q-btn>
        </div>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import Links from 'src/router/Links'

defineOptions({
  name: 'MainLayout'
})

const brandName = 'AXION'
const { t } = useI18n()
const $q = useQuasar()
const route = useRoute()
const router = useRouter()

const modules = Links('modules').filter((m) => m.id !== 'home')

const menuOpen = reactive({})
const openId = ref(null)
const closeTimers = {}

modules.forEach((m) => {
  menuOpen[m.id] = false
})

function openMenu (id) {
  if (closeTimers[id]) {
    clearTimeout(closeTimers[id])
    closeTimers[id] = null
  }
  // close others
  modules.forEach((m) => {
    menuOpen[m.id] = m.id === id
  })
  openId.value = id
}

function closeMenu (id) {
  closeTimers[id] = setTimeout(() => {
    menuOpen[id] = false
    if (openId.value === id) openId.value = null
  }, 120)
}

function go (path) {
  router.push(path)
}

function isActive (link) {
  if (link === '/') return route.path === '/'
  return route.path === link || route.path.startsWith(link + '/')
}

function isModuleActive (mod) {
  return mod.children.some((c) => isActive(c.link))
}
</script>

<style scoped>
.top-nav {
  gap: 2px;
}

.top-nav__item {
  padding-left: 10px;
  padding-right: 10px;
  border-radius: 6px;
}

.top-nav__item--active {
  background: rgba(255, 255, 255, 0.18);
}

.top-nav__wrap {
  position: relative;
}

@media (max-width: 900px) {
  .top-nav {
    overflow-x: auto;
    max-width: min(70vw, 520px);
  }
}
</style>
