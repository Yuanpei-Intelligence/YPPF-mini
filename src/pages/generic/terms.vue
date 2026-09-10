<script lang="ts" setup>
definePage({
  style: {
    navigationBarTitleText: '用户条款和隐私协议',
  },
  title: '用户条款和隐私协议',
})
</script>

<template>
  <view class="terms-page">
    <view class="terms-card">
      <text class="main-title">北京世纪原创科技有限公司 - 用户协议与隐私条款</text>

      <text class="section-title">特别提示</text>
      <text class="content" decode>在您使用"北京世纪原创科技有限公司"（以下简称"本公司"）提供的房间预约及活动管理小程序（以下简称"本程序"）之前，请您务必审慎阅读、充分理解本协议各条款内容。当您通过微信授权登录、勾选同意并进入本程序，即视为您已签署本协议。</text>

      <text class="section-title">第一部分：用户服务协议</text>

      <text class="subsection-title">1. 协议主体与服务说明</text>
      <text class="content">1.1 本协议由您与 北京世纪原创科技有限公司 订立。</text>
      <text class="content">1.2 本程序提供房间预约、活动管理、信息展示等功能，旨在服务特定群体（如学院内部人员）的办公及活动需求。</text>
      <text class="content">1.3 本程序与 yppf 网页版 为同一运营主体，两端数据互通，功能同步。</text>

      <text class="subsection-title">2. 账号绑定与登录</text>
      <text class="content">2.1 账号关联： 本程序通过微信识别身份。您可将微信账号与 yppf 网页版账号进行绑定，以同步您的权限及历史记录。</text>
      <text class="content">2.2 信息同步： 绑定后，您在网页端登记的学号、姓名、身份信息、预约历史等数据将实时同步至本程序。</text>
      <text class="content">2.3 真实性保证： 您提供的实名信息应真实有效，因信息虚假导致预约失效、被取消资格或产生其他法律责任，由您自行承担。</text>

      <text class="subsection-title">3. 用户发布内容规范（核心条款）</text>
      <text class="content">3.1 发布功能： 您可以在本程序中上传图片（头像、活动照片）和提交文字信息。</text>
      <text class="content">3.2 严禁内容： 您承诺严格遵守国家法律法规，不得发布含有下列内容的文字或图片：</text>
      <text class="content">政治敏感： 散布违背四项基本原则、损害国家荣誉或利益、涉及暴力恐怖或敏感政治话题的内容。</text>
      <text class="content">人身攻击： 侮辱、诽谤他人，侵害他人姓名权、名誉权、隐私权等合法权益。</text>
      <text class="content">社会秩序： 传播虚假信息、淫秽、色情、博彩、暴力或其他违法违规内容。</text>
      <text class="content">3.3 内容授权： 您发布的原创内容版权归您。但为了提供展示服务，您授予本公司在法律允许范围内，出于运营本程序之目的，免费、非独占地展示这些内容的权利。</text>

      <text class="subsection-title">4. 违规追责与处理权利</text>
      <text class="content">4.1 审核与监控： 本公司有权对用户提交的文字、图片进行审核。</text>
      <text class="content">4.2 处置权： 若您违反本协议第3条，本公司有权直接删除违规内容、限制预约功能或封禁账号。</text>
      <text class="content">4.3 法律追偿： 本公司保留对不合适言论、违法图片及其他违规行为追究法律责任的权利。 若您的行为导致本公司遭受损失，您需承担全部经济赔偿责任。</text>

      <text class="subsection-title">5. 账号解除绑定与注销</text>
      <text class="content">5.1 解除绑定： 您可以在小程序"我的-解除绑定"页面自行解除微信与 yppf 账号的关联。</text>
      <text class="content">5.2 账号注销： 若需彻底注销 yppf 网页版账号及其项下的所有个人数据，您需在反馈中心向学院提交申请。账号注销后，我们将停止提供服务并依法对相关数据进行匿名化处理。</text>

      <text class="subsection-title">6. 免责声明与管辖</text>
      <text class="content">6.1 第三方责任： 用户上传内容仅代表其个人立场，不代表本公司观点。</text>
      <text class="content">6.2 管辖法院： 若双方发生纠纷且协商不成，任何一方均可向北京世纪原创科技有限公司住所地（北京市）有管辖权的人民法院提起诉讼。</text>

      <text class="section-title">第二部分：隐私条款</text>

      <text class="subsection-title">1. 我们如何收集和使用信息</text>
      <text class="content">1.1 核心标识符： 我们收集您的微信 OpenID/UnionID，用于关联您的 yppf 账号。</text>
      <text class="content">1.2 业务必要信息： 我们会从 yppf 账号读取您的学号/工号、姓名。这些信息是进行房间预约、身份核验所必需的。</text>
      <text class="content">1.3 信息展示范围： 【重要说明】在预约及活动管理过程中，为了便于用户之间识别及选择活动参与者，您的姓名及学号将在本组织/特定活动范围内（即仅限登录本程序的内部相关用户）向其他用户展示。我们承诺不会向学院外部人员或非相关第三方公开上述信息。</text>
      <text class="content">1.4 权限调用： 仅在您主动上传图片时，我们会申请相机或相册权限。</text>
      <text class="content">1.5 开发框架说明： 本程序使用 uniapp 框架开发，我们不利用框架插件收集与业务无关的隐私数据。</text>

      <text class="subsection-title">2. 信息的存储与安全</text>
      <text class="content">2.1 您的个人信息存储于中华人民共和国境内。</text>
      <text class="content">2.2 我们采用行业标准的安全技术防止数据泄露、丢失或误用。</text>

      <text class="subsection-title">3. 信息的共享与披露</text>
      <text class="content">3.1 我们不会向第三方商业机构共享您的个人信息。</text>
      <text class="content">3.2 仅在法律强制要求（如司法调查）或为了履行本协议项下的业务逻辑（如前述内部用户展示）时，我们才会披露相关信息。</text>

      <text class="subsection-title">4. 未成年人保护</text>
      <text class="content">若您是未成年人，请在监护人指导下阅读本协议并获得监护人同意后再使用。</text>

      <text class="subsection-title">5. 如何联系我们</text>
      <text class="content">若您对个人信息处理有任何疑问或投诉，请通过小程序反馈功能或本公司官方渠道与我们联系。</text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 法务文本只调排版，颜色/字号/圆角全部取设计令牌（src/uni.scss） */
.terms-page {
  min-height: 100vh;
  padding: $yp-space-section $yp-space-gutter 48rpx;
  box-sizing: border-box;
  background: var(--yp-bg-page);
  overflow-x: hidden;
}

.terms-card {
  width: 100%;
  padding: $yp-space-card;
  box-sizing: border-box;
  border-radius: var(--yp-radius-lg);
  background: var(--yp-bg-card);
  font-size: var(--yp-font-base);
  line-height: 1.75;
  color: var(--yp-text-2);
}

.main-title,
.section-title,
.subsection-title,
.content {
  display: block;
  max-width: 100%;
  box-sizing: border-box;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: break-word;
  text-align: left;
}

.main-title {
  margin-bottom: 24rpx;
  font-size: var(--yp-font-xl);
  font-weight: 600;
  line-height: 1.4;
  color: var(--yp-text-1);
}

.section-title {
  margin-top: 40rpx;
  margin-bottom: 16rpx;
  font-size: var(--yp-font-lg);
  font-weight: 600;
  line-height: 1.4;
  color: var(--yp-text-1);
}

.subsection-title {
  margin-top: 24rpx;
  margin-bottom: 8rpx;
  font-size: var(--yp-font-base);
  font-weight: 600;
  line-height: 1.5;
  color: var(--yp-text-1);
}

.content {
  margin-bottom: 12rpx;
}
</style>
