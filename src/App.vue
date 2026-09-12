<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'
import { BIND_PAGE } from '@/router/config'
import { navigateToInterceptor } from '@/router/interceptor'
import { useRolloutStore, useTokenStore } from './store'
import updateManager from './utils/updateManager.wx'

// 在自动登录之前创建，灰度状态才能跟上登录、切换账号和退出登录
const rolloutStore = useRolloutStore()

onLaunch((options) => {
  console.log('App.vue onLaunch', options)
  // #ifdef MP-WEIXIN
  // 有新版本时提示重启
  updateManager()
  // #endif
  // 尝试自动登录
  // #ifdef MP-WEIXIN
  const tokenStore = useTokenStore()
  tokenStore.wxLogin()
    .then((result) => {
      if (result.status === 'unbound') {
        uni.navigateTo({
          url: `${BIND_PAGE}?signed_openid=${encodeURIComponent(result.signed_openid)}`,
        })
      }
    })
    .catch((error) => {
      console.error('自动登录失败:', error)
    })
  // #endif
})
onShow((options) => {
  console.log('App.vue onShow', options)
  // 处理直接进入页面路由的情况：如h5直接输入路由、微信小程序分享后进入等
  // https://github.com/unibest-tech/unibest/issues/192
  if (options?.path) {
    navigateToInterceptor.invoke({ url: `/${options.path}`, query: options.query })
  }
  else {
    navigateToInterceptor.invoke({ url: '/' })
  }
  // 回到前台时按节流刷新灰度状态
  rolloutStore.refreshInBackground()
})
onHide(() => {
  console.log('App Hide')
})
</script>

<style lang="scss">

</style>
