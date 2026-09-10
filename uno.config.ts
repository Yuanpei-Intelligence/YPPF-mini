import type {
  Preset,
} from 'unocss'
import { FileSystemIconLoader } from '@iconify/utils/lib/loader/node-loaders'

// https://www.npmjs.com/package/@uni-helper/unocss-preset-uni
import { presetUni } from '@uni-helper/unocss-preset-uni'
// @see https://unocss.dev/presets/legacy-compat
import { presetLegacyCompat } from '@unocss/preset-legacy-compat'
import {
  defineConfig,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'

/**
 * Design tokens are declared once as CSS variables on `page` (src/style/index.scss,
 * values from src/uni.scss). The UnoCSS theme below only references those variables,
 * so classes such as `text-primary`, `bg-card`, `text-fg-2` never hard-code a color.
 * See docs/design/README.md for the full token table and usage rules.
 */
export default defineConfig({
  presets: [
    presetUni({
      attributify: false,
    }),
    presetIcons({
      scale: 1.2,
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
      collections: {
        // 注册本地 SVG 图标集合, 从本地文件系统加载图标
        // 在 './src/static/my-icons' 目录下的所有 svg 文件将被注册为图标，
        // my-icons 是图标集合名称，使用 `i-my-icons-图标名` 调用
        'my-icons': FileSystemIconLoader(
          './src/static/my-icons',
          // 可选的，你可以提供一个 transform 回调来更改每个图标
          (svg) => {
            let svgStr = svg

            // 如果 SVG 文件未定义 `fill` 属性，则默认填充 `currentColor`, 这样图标颜色会继承文本颜色，方便在不同场景下适配
            svgStr = svgStr.includes('fill="') ? svgStr : svgStr.replace(/^<svg /, '<svg fill="currentColor" ')

            // 如果 svg 有 width, 和 height 属性，将这些属性改为 1em，否则无法显示图标
            svgStr = svgStr.replace(/(<svg.*?width=)"(.*?)"/, '$1"1em"').replace(/(<svg.*?height=)"(.*?)"/, '$1"1em"')

            return svgStr
          },
        ),
      },
    }),
    // 处理低端安卓机的样式问题：颜色函数从空格分隔转为逗号分隔，并去掉 oklch 关键字
    presetLegacyCompat({
      commaStyleColorFunction: true,
      legacyColorSpace: true,
    }) as Preset,
  ],
  transformers: [
    // 启用指令功能：主要用于支持 @apply、@screen 和 theme() 等 CSS 指令
    transformerDirectives(),
    // 启用 () 分组功能，eg: `<view class="hover:(bg-gray-400 font-medium)">`
    transformerVariantGroup(),
  ],
  shortcuts: [
    {
      'center': 'flex justify-center items-center',

      // Page skeleton
      'yp-page': 'min-h-screen bg-page',
      'yp-container': 'px-4',
      'yp-card': 'rounded-lg bg-card p-4 shadow-card',
      'yp-card-flat': 'rounded-lg bg-card p-4',
      'yp-section-title': 'text-lg font-semibold text-fg-1',
      'yp-caption': 'text-xs text-fg-3',
      'yp-divider': 'h-1px w-full bg-line-light',
      'yp-list-item': 'flex items-center gap-3 min-h-104rpx px-4 bg-card active:bg-fill',
      'yp-input': 'box-border w-full min-h-88rpx rounded-md bg-fill px-3 text-base text-fg-1',

      // Buttons (native <button> or <view>); combine: `btn-primary btn-block`
      'btn-base': 'box-border inline-flex items-center justify-center gap-1 mx-0 min-h-88rpx rounded-md px-4 text-base font-medium leading-normal transition-opacity active:opacity-80 disabled:opacity-50',
      'btn-primary': 'btn-base bg-primary text-white',
      'btn-secondary': 'btn-base bg-primary-light text-primary',
      'btn-outline': 'btn-base border border-line bg-card text-fg-1',
      'btn-danger': 'btn-base bg-error-light text-error',
      'btn-ghost': 'btn-base bg-transparent text-fg-2',
      'btn-text': 'inline-flex items-center justify-center gap-1 mx-0 min-h-64rpx px-2 text-sm text-primary leading-normal active:opacity-70',
      'btn-sm': 'min-h-64rpx px-3 text-sm rounded-sm',
      'btn-block': 'flex w-full',
    },
  ],
  // 动态图标类必须在这里登记（tabbar 图标、PageState/StatusTag 等通过 prop 传入的图标）
  safelist: [
    'i-carbon-home',
    'i-carbon-calendar',
    'i-carbon-apps',
    'i-carbon-user',
    'i-carbon-code',
    'i-carbon-document-blank',
    'i-carbon-notification',
    'i-carbon-search',
    'i-carbon-warning-alt',
    'i-carbon-wifi-off',
    'i-carbon-checkmark-filled',
    'i-carbon-time',
    'i-carbon-book',
    'i-carbon-shopping-cart',
    'i-carbon-chat',
    'i-carbon-event-schedule',
    'i-carbon-location',
  ],
  rules: [
    [
      'p-safe',
      {
        padding:
          'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
      },
    ],
    ['pt-safe', { 'padding-top': 'env(safe-area-inset-top)' }],
    ['pb-safe', { 'padding-bottom': 'env(safe-area-inset-bottom)' }],
    // Fixed bottom bars: inner spacing plus the safe area in one declaration, so it never
    // competes with `py-*` on the same element.
    ['pb-safe-3', { 'padding-bottom': 'calc(24rpx + env(safe-area-inset-bottom))' }],
  ],
  theme: {
    colors: {
      /** 品牌色：text-primary / bg-primary / border-primary；变体 primary-dark / primary-light / primary-disabled */
      primary: {
        DEFAULT: 'var(--yp-color-primary)',
        dark: 'var(--yp-color-primary-dark)',
        light: 'var(--yp-color-primary-light)',
        disabled: 'var(--yp-color-primary-disabled)',
      },
      success: {
        DEFAULT: 'var(--yp-color-success)',
        dark: 'var(--yp-color-success-dark)',
        light: 'var(--yp-color-success-light)',
      },
      warning: {
        DEFAULT: 'var(--yp-color-warning)',
        dark: 'var(--yp-color-warning-dark)',
        light: 'var(--yp-color-warning-light)',
      },
      error: {
        DEFAULT: 'var(--yp-color-error)',
        dark: 'var(--yp-color-error-dark)',
        light: 'var(--yp-color-error-light)',
      },
      info: {
        DEFAULT: 'var(--yp-color-info)',
        dark: 'var(--yp-color-info-dark)',
        light: 'var(--yp-color-info-light)',
      },
      /** 品牌色（北大红 / 元培米色）：只用于标志、品牌文字、元气值展示，不进按钮、胶囊、表单 */
      brand: {
        DEFAULT: 'var(--yp-color-brand)',
        light: 'var(--yp-color-brand-light)',
      },
      /** 文字层级：text-fg-1（标题正文）/ text-fg-2（次要）/ text-fg-3（说明、占位）/ text-fg-4（禁用） */
      fg: {
        1: 'var(--yp-text-1)',
        2: 'var(--yp-text-2)',
        3: 'var(--yp-text-3)',
        4: 'var(--yp-text-4)',
        inverse: 'var(--yp-text-inverse)',
      },
      /** 背景：bg-page / bg-card / bg-fill / bg-fill-active / bg-mask */
      page: 'var(--yp-bg-page)',
      card: 'var(--yp-bg-card)',
      fill: {
        DEFAULT: 'var(--yp-bg-fill)',
        active: 'var(--yp-bg-fill-active)',
      },
      mask: 'var(--yp-mask)',
      /** 边框：border-line / border-line-light */
      line: {
        DEFAULT: 'var(--yp-border)',
        light: 'var(--yp-border-light)',
      },
    },
    /** 字号阶梯（rpx；2rpx ≈ 1pt）：xs 12 / sm 14 / base 15 / lg 17 / xl 20 / 2xl 24 / 3xl 28 */
    fontSize: {
      '2xs': ['22rpx', '30rpx'],
      'xs': ['24rpx', '34rpx'],
      'sm': ['28rpx', '40rpx'],
      'base': ['30rpx', '44rpx'],
      'lg': ['34rpx', '48rpx'],
      'xl': ['40rpx', '56rpx'],
      '2xl': ['48rpx', '64rpx'],
      '3xl': ['56rpx', '72rpx'],
    },
    /** 圆角：rounded-sm 8 / rounded(-md) 16 / rounded-lg 24 / rounded-xl 32 / rounded-2xl 40 (rpx) */
    borderRadius: {
      'none': '0',
      'sm': 'var(--yp-radius-sm)',
      'DEFAULT': 'var(--yp-radius-md)',
      'md': 'var(--yp-radius-md)',
      'lg': 'var(--yp-radius-lg)',
      'xl': 'var(--yp-radius-xl)',
      '2xl': '40rpx',
      'full': '9999px',
    },
    /** 阴影只保留两档：shadow-card（卡片）/ shadow-float（浮层、固定底栏） */
    boxShadow: {
      none: 'none',
      card: 'var(--yp-shadow-card)',
      float: 'var(--yp-shadow-float)',
      sm: 'var(--yp-shadow-card)',
      DEFAULT: 'var(--yp-shadow-card)',
      md: 'var(--yp-shadow-float)',
      lg: 'var(--yp-shadow-float)',
      xl: 'var(--yp-shadow-float)',
    },
  },
})
