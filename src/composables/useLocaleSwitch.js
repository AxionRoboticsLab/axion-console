import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useControlParams } from 'stores/control-params'

const LOCALE_OPTIONS = [
  { value: 'zh-CN', labelKey: 'lang_zh', short: '中' },
  { value: 'en-US', labelKey: 'lang_en', short: 'EN' }
]

/**
 * 前端语言切换：同步 vue-i18n + pinia(localStorage)。
 * axios 会带 Accept-Language / X-Locale，后端中间件据此返回对应 msg。
 */
export function useLocaleSwitch () {
  const { locale, t } = useI18n({ useScope: 'global' })
  const params = useControlParams()

  const currentLocale = computed(() => locale.value)

  const localeMenu = computed(() =>
    LOCALE_OPTIONS.map((o) => ({
      value: o.value,
      label: t(o.labelKey),
      short: o.short,
      active: o.value === locale.value
    }))
  )

  function setLocale (next) {
    if (!next || (next !== 'zh-CN' && next !== 'en-US')) return
    locale.value = next
    params.locale = next
  }

  return {
    currentLocale,
    localeMenu,
    setLocale,
    LOCALE_OPTIONS
  }
}
