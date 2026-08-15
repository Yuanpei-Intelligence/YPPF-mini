<script lang="ts" setup>
import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { getUserMe, wxBind } from '@/api/login'
import { useTokenStore } from '@/store/token'
import { useUserStore } from '@/store/user'
import { openWebview } from '@/utils/webview'

definePage({
  style: {
    navigationBarTitleText: '绑定微信账号',
  },
})

const signedOpenid = ref('')
const username = ref('')
const password = ref('')
const agreedToTerms = ref(false)
const tokenStore = useTokenStore()
const userStore = useUserStore()

function openPublicWebview(uri: string) {
  void openWebview({ uri, isPublic: true })
}

function toTerms() {
  uni.navigateTo({ url: '/pages/generic/terms' })
}

onLoad((options) => {
  if (options && options.signed_openid) {
    signedOpenid.value = decodeURIComponent(options.signed_openid)
  }
  else {
    uni.showToast({
      title: '缺少签名OpenID',
      icon: 'none',
    })
  }
})

async function handleBind() {
  if (!username.value || !password.value) {
    uni.showToast({ title: '请输入用户名和密码', icon: 'none' })
    return
  }
  if (!agreedToTerms.value) {
    uni.showToast({ title: '请先阅读并同意用户协议与隐私政策', icon: 'none' })
    return
  }
  if (!signedOpenid.value) {
    uni.showToast({ title: '参数错误', icon: 'none' })
    return
  }

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
      uni.showToast({ title: '绑定成功', icon: 'success' })
      setTimeout(() => {
        uni.reLaunch({ url: '/pages/index/index' })
      }, 1500)
    }
  }
  catch (err) {
    console.error(err)
  }
}
</script>

<template>
  <view class="bind-page">
    <view class="bind-header">
      <view class="bind-header__title">
        绑定现有账号
      </view>
      <view class="bind-header__desc">
        请使用网页版 YPPF 个人账号完成绑定。如需登录小组账号，可以在“我的-切换账号”中登录您管理的小组。
      </view>
    </view>

    <view class="bind-form">
      <view class="bind-field">
        <text class="bind-field__label">用户名</text>
        <input
          v-model="username"
          class="bind-field__input"
          type="text"
          placeholder="请输入用户名"
        >
      </view>
      <view class="bind-field">
        <text class="bind-field__label">密码</text>
        <input
          v-model="password"
          class="bind-field__input"
          type="text"
          password
          placeholder="请输入密码"
        >
      </view>
      <view class="bind-links">
        <text class="bind-link" @click="openPublicWebview('/forgetpw/')">忘记密码</text>
        <text class="bind-link bind-link--divider">|</text>
        <text class="bind-link" @click="openPublicWebview('/freshman/')">注册</text>
      </view>

      <view class="bind-agree" @click="agreedToTerms = !agreedToTerms">
        <view
          class="bind-checkbox"
          :class="{ 'bind-checkbox--checked': agreedToTerms }"
        >
          <text v-if="agreedToTerms" class="bind-checkbox__icon">✓</text>
        </view>
        <view class="bind-agree__text">
          我已阅读并同意
          <text class="bind-agree__link" @click="toTerms">《用户协议》</text>
          和
          <text class="bind-agree__link" @click="toTerms">《隐私政策》</text>
        </view>
      </view>

      <button class="bind-btn" @click="handleBind">
        绑定
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.bind-page {
  min-height: 100vh;
  background: linear-gradient(180deg, #f0f7ff 0%, #f8fafc 100%);
  padding: 48rpx 32rpx;
}

.bind-header {
  margin-bottom: 48rpx;
}

.bind-header__title {
  font-size: 44rpx;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 12rpx;
}

.bind-header__desc {
  font-size: 28rpx;
  color: #64748b;
  line-height: 1.5;
}

.bind-form {
  background: #fff;
  border-radius: 24rpx;
  padding: 40rpx;
  box-shadow: 0 4rpx 24rpx rgba(0, 0, 0, 0.06);
}

.bind-field {
  margin-bottom: 32rpx;
}

.bind-field__label {
  display: block;
  font-size: 28rpx;
  font-weight: 500;
  color: #334155;
  margin-bottom: 16rpx;
}

.bind-field__input {
  width: 100%;
  height: 88rpx;
  padding: 0 24rpx;
  font-size: 30rpx;
  color: #1e293b;
  background: #f8fafc;
  border: 2rpx solid #e2e8f0;
  border-radius: 12rpx;
  box-sizing: border-box;

  &::placeholder {
    color: #94a3b8;
  }
}

.bind-links {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 40rpx;
}

.bind-link {
  font-size: 26rpx;
  color: #3b82f6;

  &--divider {
    color: #cbd5e1;
    font-weight: 300;
  }
}

.bind-agree {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  margin-bottom: 48rpx;
}

.bind-checkbox {
  width: 40rpx;
  height: 40rpx;
  flex-shrink: 0;
  margin-top: 4rpx;
  border: 2rpx solid #cbd5e1;
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &--checked {
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    border-color: #3b82f6;
  }
}

.bind-checkbox__icon {
  font-size: 24rpx;
  font-weight: 600;
  color: #fff;
}

.bind-agree__text {
  font-size: 26rpx;
  color: #64748b;
  line-height: 1.6;
}

.bind-agree__link {
  color: #3b82f6;
}

.bind-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  font-size: 32rpx;
  font-weight: 500;
  color: #fff;
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  border: none;
  border-radius: 16rpx;
  box-shadow: 0 8rpx 24rpx rgba(59, 130, 246, 0.35);

  &::after {
    border: none;
  }
}
</style>
