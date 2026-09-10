import { defineUniPages } from '@uni-helper/vite-plugin-uni-pages'
import { tabBar } from './src/tabbar/config'

export default defineUniPages({
  // Every page uses the native navigation bar in the light style below; pages must not
  // override the bar color individually (docs/design/README.md §3). Only pages that need
  // custom content in the bar may set `navigationStyle: 'custom'`.
  globalStyle: {
    navigationStyle: 'default',
    navigationBarTitleText: 'YPPF',
    navigationBarBackgroundColor: '#FFFFFF',
    navigationBarTextStyle: 'black',
    backgroundColor: '#F5F6F8',
    backgroundTextStyle: 'dark',
  },
  easycom: {
    autoscan: true,
    custom: {
      '^fg-(.*)': '@/components/fg-$1/fg-$1.vue',
      '^(?!z-paging-refresh|z-paging-load-more)z-paging(.*)':
        'z-paging/components/z-paging$1/z-paging$1.vue',
    },
  },
  // tabbar 的配置统一在 “./src/tabbar/config.ts” 文件中
  tabBar: tabBar as any,
  // WeChat downloads the whole main package before the first render, so the secondary timetable
  // pages ship as the `pages-timetable` subpackage. Preload it from the timetable on any network
  // and from the home page (which links into it) on Wi-Fi only.
  preloadRule: {
    'pages/timetable/index': { network: 'all', packages: ['pages-timetable'] },
    'pages/index/index': { network: 'wifi', packages: ['pages-timetable'] },
  },
})
