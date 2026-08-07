<template>
  <q-layout view="hHh lpR fFf" class="login-layout">
    <q-page-container>
      <q-page class="flex flex-center login-page">
        <div class="login-lang">
          <q-btn flat round dense color="primary" icon="translate" :aria-label="t('toolbar_language')">
            <q-menu anchor="bottom right" self="top right">
              <q-list dense style="min-width: 140px">
                <q-item
                  v-for="item in localeMenu"
                  :key="item.value"
                  clickable
                  v-close-popup
                  :active="item.active"
                  active-class="bg-primary text-white"
                  @click="setLocale(item.value)"
                >
                  <q-item-section>{{ item.label }}</q-item-section>
                  <q-item-section side v-if="item.active">
                    <q-icon name="check" size="18px" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>

        <q-card class="login-card q-pa-lg" flat bordered>
          <div class="column items-center q-mb-lg">
            <q-icon name="smart_toy" size="48px" color="primary" />
            <div class="text-h5 text-weight-bold q-mt-sm">AXION</div>
            <div class="text-caption text-grey-7">{{ t('login_subtitle') }}</div>
          </div>

          <q-form class="q-gutter-md" @submit.prevent="onSubmit">
            <q-input
              v-model="username"
              outlined
              dense
              :label="t('login_username')"
              autocomplete="username"
              :disable="loading"
              :rules="[val => !!val || t('login_username_required')]"
            >
              <template #prepend>
                <q-icon name="person" />
              </template>
            </q-input>

            <q-input
              v-model="password"
              outlined
              dense
              :type="showPwd ? 'text' : 'password'"
              :label="t('login_password')"
              autocomplete="current-password"
              :disable="loading"
              :rules="[val => !!val || t('login_password_required')]"
            >
              <template #prepend>
                <q-icon name="lock" />
              </template>
              <template #append>
                <q-icon
                  :name="showPwd ? 'visibility_off' : 'visibility'"
                  class="cursor-pointer"
                  @click="showPwd = !showPwd"
                />
              </template>
            </q-input>

            <q-banner v-if="errorMsg" dense class="bg-negative text-white q-mb-sm rounded-borders">
              {{ errorMsg }}
            </q-banner>

            <q-btn
              type="submit"
              color="primary"
              class="full-width"
              unelevated
              :loading="loading"
              :label="t('login_submit')"
            />
          </q-form>
        </q-card>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useAuthStore } from 'stores/auth'
import { useLocaleSwitch } from 'src/composables/useLocaleSwitch'

defineOptions({ name: 'LoginPage' })

const { t } = useI18n()
const $q = useQuasar()
const router = useRouter()
const auth = useAuthStore()
const { localeMenu, setLocale } = useLocaleSwitch()

const username = ref('')
const password = ref('')
const showPwd = ref(false)
const loading = ref(false)
const errorMsg = ref('')

async function onSubmit () {
  errorMsg.value = ''
  loading.value = true
  try {
    await auth.login(username.value.trim(), password.value)
    $q.notify({ type: 'positive', message: t('login_success') })
    // 登录成功固定进入首页
    router.replace('/')
  } catch (e) {
    const body = e?.response?.data
    const detail = body?.detail
    errorMsg.value =
      body?.msg ||
      detail?.msg ||
      (typeof detail === 'string' ? detail : null) ||
      e?.message ||
      t('login_failed')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  background:
    radial-gradient(ellipse at 20% 20%, rgba(25, 118, 210, 0.12), transparent 50%),
    radial-gradient(ellipse at 80% 80%, rgba(25, 118, 210, 0.08), transparent 45%),
    #f5f7fb;
}

.login-lang {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
}

.login-card {
  width: min(400px, 92vw);
  border-radius: 12px;
  background: #fff;
}
</style>
