<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref, watch } from 'vue'
import { getUserMe, wxBind } from '@/api/login'
import ApiFieldError from '@/components/ApiFieldError.vue'
import FormField from '@/components/FormField.vue'
import { useApiException } from '@/hooks/useApiException'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { tokens } from '@/style/tokens'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '绑定微信账号',
  },
})

const AGREE_KEY = 'agree'

const signedOpenid = ref('')
const username = ref('')
const password = ref('')
/** uv-checkbox-group 的选中值；勾选协议时含 AGREE_KEY */
const agreeValues = ref<string[]>([])
const agreedToTerms = computed(() => agreeValues.value.includes(AGREE_KEY))
const submitting = ref(false)
const toastRef = ref<UvToastInstance | null>(null)
const {
  clearFieldError,
  getFieldMessages,
  handleApiException,
  hasFieldErrors,
  setFieldError,
  showMessage,
} = useApiException(toastRef)
const tokenStore = useTokenStore()
const userStore = useUserStore()

function openPublicWebview(uri: string) {
  void openWebview({ uri, isPublic: true })
}

function toTerms() {
  uni.navigateTo({ url: '/pages/generic/terms' })
}

watch(agreedToTerms, (agreed) => {
  if (agreed)
    clearFieldError('terms')
})

onLoad((options) => {
  if (options && options.signed_openid) {
    signedOpenid.value = decodeURIComponent(options.signed_openid)
  }
  else {
    setFieldError('signed_openid', '缺少微信绑定凭据，请重新进入小程序', 'required')
  }
})

async function handleBind() {
  if (submitting.value)
    return
  // 本地校验只走表单内联提示，不再叠加 toast
  let invalid = false
  if (!username.value) {
    setFieldError('username', '请输入用户名', 'required')
    invalid = true
  }
  if (!password.value) {
    setFieldError('password', '请输入密码', 'required')
    invalid = true
  }
  if (!agreedToTerms.value) {
    setFieldError('terms', '请先阅读并同意用户协议与隐私政策', 'required')
    invalid = true
  }
  if (!signedOpenid.value) {
    setFieldError('signed_openid', '绑定凭据无效，请重新进入小程序', 'invalid')
    invalid = true
  }
  if (invalid)
    return

  submitting.value = true
  try {
    const res = await wxBind({
      username: username.value,
      password: password.value,
      signed_openid: signedOpenid.value,
    })

    if (res.status === 'bound') {
      const tokenData = {
        token: res.token,
        expiresIn: res.expires_in,
      }
      tokenStore.setTokenInfo(tokenData)
      const userInfo = await getUserMe()
      // 保持account_id
      userStore.setUserInfo({
        ...userInfo,
        account_id: res.account_id ?? '',
        username: res.username ?? '',
      })
      showMessage('绑定成功', 'success')
      setTimeout(() => {
        uni.reLaunch({ url: '/pages/index/index' })
      }, 600)
    }
  }
  catch (err) {
    console.error(err)
    // 后端字段错误只在对应控件旁显示；没有字段错误时才 toast 一次
    handleApiException(err, { showToast: false })
    if (!hasFieldErrors.value)
      handleApiException(err)
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <uv-toast ref="toastRef" />
  <view class="yp-page px-4 py-4">
    <text class="block text-sm text-fg-2 leading-relaxed">
      请使用网页版 YPPF 个人账号完成绑定。如需登录小组账号，可以在「我的 · 切换账户」中登录您管理的小组。
    </text>

    <view class="mt-4 yp-card-flat">
      <FormField label="用户名" required :messages="getFieldMessages('username')">
        <input
          v-model="username"
          class="yp-input"
          type="text"
          placeholder="请输入用户名"
          placeholder-class="text-fg-3"
          @input="clearFieldError('username')"
        >
      </FormField>
      <FormField label="密码" required :messages="getFieldMessages('password')">
        <input
          v-model="password"
          class="yp-input"
          type="text"
          password
          placeholder="请输入密码"
          placeholder-class="text-fg-3"
          @input="clearFieldError('password')"
        >
      </FormField>
      <view class="mt-1 flex items-center gap-4 -ml-2">
        <view class="btn-text min-h-88rpx" @click="openPublicWebview('/forgetpw/')">
          忘记密码
        </view>
        <view class="btn-text min-h-88rpx" @click="openPublicWebview('/freshman/')">
          注册账号
        </view>
      </view>
    </view>

    <!-- 协议勾选 -->
    <view class="mt-4 py-2">
      <uv-checkbox-group
        v-model="agreeValues"
        shape="square"
        :size="20"
        :icon-size="12"
        :active-color="tokens.primary"
        :inactive-color="tokens.text4"
      >
        <uv-checkbox :name="AGREE_KEY">
          <view class="ml-1 text-sm text-fg-2 leading-relaxed">
            我已阅读并同意
            <text class="text-primary" @click.stop="toTerms">《用户协议》</text>
            和
            <text class="text-primary" @click.stop="toTerms">《隐私政策》</text>
          </view>
        </uv-checkbox>
      </uv-checkbox-group>
      <ApiFieldError :messages="getFieldMessages('terms')" />
      <ApiFieldError :messages="getFieldMessages('signed_openid')" />
    </view>

    <button
      class="btn-primary mt-6 btn-block"
      :loading="submitting"
      :disabled="submitting"
      @click="handleBind"
    >
      绑定
    </button>
  </view>
</template>
