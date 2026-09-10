import type { TabBar } from '@uni-helper/vite-plugin-uni-pages'
import type { CustomTabBarItem, NativeTabBarItem } from './types'

/**
 * tabbar 选择的策略，更详细的介绍见 tabbar.md 文件
 * 0: 'NO_TABBAR' `无 tabbar`
 * 1: 'NATIVE_TABBAR'  `原生 tabbar`
 * 2: 'CUSTOM_TABBAR' `自定义 tabbar`
 *
 * 温馨提示：本文件的任何代码更改了之后，都需要重新运行，否则 pages.json 不会更新导致配置不生效。
 * 本文件在构建期和运行期都会被读取，必须保持纯数据：不要引入 store / api / http / 页面 / uni.* 运行时依赖。
 */
export const TABBAR_STRATEGY_MAP = {
  NO_TABBAR: 0,
  NATIVE_TABBAR: 1,
  CUSTOM_TABBAR: 2,
}

// 通过这里切换使用 tabbar 的策略
// NO_TABBAR(0)：nativeTabbarList 和 customTabbarList 都不生效
// NATIVE_TABBAR(1)：只需要配置 nativeTabbarList
// CUSTOM_TABBAR(2)：只需要配置 customTabbarList
export const selectedTabbarStrategy = TABBAR_STRATEGY_MAP.CUSTOM_TABBAR

// 使用 NATIVE_TABBAR 时的配置（当前策略为 CUSTOM_TABBAR，此列表不生效；切换前需补齐「预约」图标）
export const nativeTabbarList: NativeTabBarItem[] = [
  {
    iconPath: 'static/tabbar/home.png',
    selectedIconPath: 'static/tabbar/homeHL.png',
    pagePath: 'pages/index/index',
    text: '首页',
  },
  {
    iconPath: 'static/tabbar/example.png',
    selectedIconPath: 'static/tabbar/exampleHL.png',
    pagePath: 'pages/appmenu/appmenu',
    text: '应用',
  },
  {
    iconPath: 'static/tabbar/personal.png',
    selectedIconPath: 'static/tabbar/personalHL.png',
    pagePath: 'pages/me/me',
    text: '我的',
  },
]

// 使用 CUSTOM_TABBAR 时的配置
// unocss 图标必须登记到 uno.config.ts 的 safelist 中，否则构建时会被摇掉
// 如果需要配置鼓包，需要在 'tabbar/store.ts' 里面设置，最后在 `tabbar/index.vue` 里面更改鼓包的图片
export const customTabbarList: CustomTabBarItem[] = [
  {
    text: '首页',
    pagePath: 'pages/index/index',
    iconType: 'unocss',
    icon: 'i-carbon-home',
  },
  {
    pagePath: 'pages/appoint/appoint',
    text: '预约',
    iconType: 'unocss',
    icon: 'i-carbon-calendar',
  },
  {
    text: '应用',
    pagePath: 'pages/appmenu/appmenu',
    iconType: 'unocss',
    icon: 'i-carbon-apps',
  },
  {
    pagePath: 'pages/me/me',
    text: '我的',
    iconType: 'unocss',
    icon: 'i-carbon-user',
  },
]

/**
 * 是否启用 tabbar 缓存
 * NATIVE_TABBAR(1) 和 CUSTOM_TABBAR(2) 时，需要tabbar缓存
 */
export const tabbarCacheEnable
  = [TABBAR_STRATEGY_MAP.NATIVE_TABBAR, TABBAR_STRATEGY_MAP.CUSTOM_TABBAR].includes(selectedTabbarStrategy)

/**
 * 是否启用自定义 tabbar
 * CUSTOM_TABBAR(2) 时，启用自定义tabbar
 */
export const customTabbarEnable = [TABBAR_STRATEGY_MAP.CUSTOM_TABBAR].includes(selectedTabbarStrategy)

/**
 * 是否需要隐藏原生 tabbar
 * CUSTOM_TABBAR(2) 时，需要隐藏原生tabbar
 */
export const needHideNativeTabbar = selectedTabbarStrategy === TABBAR_STRATEGY_MAP.CUSTOM_TABBAR

const _tabbarList = customTabbarEnable ? customTabbarList.map(item => ({ text: item.text, pagePath: item.pagePath })) : nativeTabbarList
export const tabbarList = customTabbarEnable ? customTabbarList : nativeTabbarList

// 颜色值与设计令牌保持一致（src/uni.scss：$yp-color-primary / $yp-text-3 / $yp-bg-card）；
// 本文件不能 import 运行时模块，因此这里写字面量。
const _tabbar: TabBar = {
  // 只有微信小程序支持 custom。App 和 H5 不生效
  custom: selectedTabbarStrategy === TABBAR_STRATEGY_MAP.CUSTOM_TABBAR,
  color: '#666E7A',
  selectedColor: '#2456C9',
  backgroundColor: '#FFFFFF',
  borderStyle: 'white',
  height: '50px',
  fontSize: '10px',
  iconWidth: '24px',
  spacing: '3px',
  list: _tabbarList as unknown as TabBar['list'],
}

export const tabBar = tabbarCacheEnable ? _tabbar : undefined
