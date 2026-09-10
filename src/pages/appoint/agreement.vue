<script lang="ts" setup>
import type { UvToastInstance } from '@/hooks/useApiException'
import { getAgreement, signAgreement } from '@/api/appoint'
import { useApiException } from '@/hooks/useApiException'

definePage({
  style: {
    navigationBarTitleText: '签署协议',
    navigationStyle: 'default',
  },
})

const agreementTime = ref<string | null>(null)
const loading = ref(false)
const signing = ref(false)
const toastRef = ref<UvToastInstance | null>(null)
const { handleApiException, showMessage } = useApiException(toastRef)
const isSigned = computed(() => {
  return agreementTime.value !== null
})

onLoad(async () => {
  loading.value = true
  try {
    const res = await getAgreement()
    agreementTime.value = res.agree_time
  }
  catch (error) {
    handleApiException(error)
  }
  finally {
    loading.value = false
  }
})

async function _signAgreement() {
  if (signing.value)
    return
  signing.value = true
  try {
    await signAgreement()
    agreementTime.value = new Date().toDateString()
    showMessage('签署成功。', 'success')
  }
  catch (error) {
    console.error(error)
    handleApiException(error)
  }
  finally {
    signing.value = false
  }
}
</script>

<template>
  <uv-toast ref="toastRef" />
  <view class="min-h-screen bg-gray-50 pb-10">
    <view class="mb-2 text-center text-xl font-bold">
      35楼地下室使用规范
    </view>
    <view class="p-4">
      <view class="mb-2 text-lg font-bold">
        第一部分 公共空间
      </view>
      <br>
      1.地下室公共空间（包括公共自习区域、各个房间的柜子）禁止长时间存放个人物品，每天1：30-6：30物业会将地下室遗留物品转移到<text class="text-blue-500">物业办公室</text>（B108每天7:30-8:00转移占座物品），物业管理人员及学院等管理团队对转移的物品没有保管的责任和义务，如物品遗失由使用者个人负责。
      <br>
      2.地下室遗留物品在物业办公室存放两天，随后转移到<text class="text-blue-500">内联部柜子</text>，此后最近的一个<text class="text-blue-500">周日</text>，内联部对柜子内当周新增物品通过<text class="text-blue-500">企业微信、年级群等渠道公示一周</text>，希望同学们尽快联系物业或内联部领取，公示期结束后，遗留物品会被清理。
      <br>
      3.学生组织、书院课助教、运动队等团体可以在向物业申请在指定地下室柜子中长时间存放组织用物品。
      <br>
      4.同学可以在地下室公共空间小憩，但是不能脱鞋上沙发，物业人员有权制止相关行为。
      <br>
      5.公共自习室禁止进餐，希望大家前往咖啡厅和水吧进餐，请在用餐后及时清理垃圾，共同维护整洁的地下室环境。
      <br>
      6.地下室卫生间蹲坑冲水能力有限，请大家不要向蹲坑内丢弃卫生纸和其他杂物（如骨头、食物残渣等），这样会造成管道堵塞，严重情况下会导致蹲坑长达一学期无法使用。
      <br>
      <view class="mb-2 text-lg font-bold">
        第二部分 自习室
      </view>
      <br>
      1.<text class="text-blue-500">无占座自习室（B106、B114）禁止占座超过一个小时</text>，所有自习室（包括B108）<text class="text-blue-500">禁止隔夜占座</text>。
      <br>
      2.使用无占座自习室需签署<text class="text-blue-500">无占座协议</text>。在无占座自习室，离开座位前同学们可以取用占座贴，并且写上姓名（或学号）和离开座位的时间。若一个小时后仍未返回，或没有取占座贴即离开，<text class="text-blue-500">其他同学可以把该同学的东西转移</text>，希望大家优先将占座物品放在座位下，空间不足可转移至每个自习室墙角黑架子。
      <br>
      3.请不要在无键盘自习室（B119）使用键盘，理解需要更加安静的自习环境的同学的需求。
      <br>
      <br>
      <view class="mb-2 text-lg font-bold">
        第三部分 研讨室、活动室
      </view>
      <br>
      1.违约扣分的情况：
      <br>
      <view class="pl-4">
        - 预约开始时间前后15分钟内始终无人刷卡使用。
        <br>
        - 预约时间段内超过 40% 时间，房间内实际人数未达到房间预约人数一半以上。（注:不是一半及以上。例如有2个人预约，则需要两个人同时到场时间超过预约时间的40%）
        <br>
      </view>
      2.研讨室和功能房预约本着先到先得的原则，在不损坏房间设施的前提下对使用房间的方式不作限制。
      <br>
      3.为灵活利用闲置房间，预约当天的教室没有最低人数限制，距离下一场预约30分钟以上时可以在房间刷卡临时预约。
      <br>
      4.音乐室和朗读仓隔音效果有限，希望大家注意音量。
      <br>
      5.地下室房间的预约和使用必须严格遵循该房间的预定用途。若违反规定，学院有权取消相关预约或取消该用户的预约资格。
      <br>
      6.地下室空间资源有限，希望大家可以理解彼此对于房间的需求，如果遇到问题希望大家积极相互沟通。
    </view>
  </view>
  <view class="mb-2 text-center text-xl font-bold">
    申请使用35楼地下空间无占座自习室承诺书
  </view>
  <view class="p-4">
    我自愿申请使用35楼地下“无占座自习室”使用权，并承诺遵守以下规定：
    <br>
    1. 严格遵守35楼地下空间使用规则；
    <br>
    2. 自习座位使用后，及时将全部个人物品带离；
    <br>
    3. 自习过程中短暂离开座位时，正确填写占座贴并使用计时器记录离开时间，离开时间不超过一小时；
    <br>
    4. 认可未使用或未正确使用占座贴及计时器，或者占座超过一小时后，此座位为占座座位；
    <br>
    5. 对于无占座自习室内占座座位，同意具有“无占座自习室”使用权限的同学及物业管理人员有权将座位物品清理到临时存放处，并将座位提供给其他同学使用；
    <br>
    6. 认同临时存放处为公共空间，学院及物业管理部门会每晚24点对其进行清理；
    <br>
    7. 物业管理人员及学院等管理团队对清理的物品没有保管责任和义务，如物品遗失由使用者个人负责；
    <br>
    8. 违反“无占座自习室”使用规定，学院将取消“无占座自习室”使用权限并扣除信用积分；
    <br>
    9. 对使用“无占座自习室”过程中出现的任何问题，请通过内联权益部、年级主任或住宿辅导员联系学院解决。
    <br>
    <br>
    以上内容解释权归学院所有。
  </view>
  <view class="p-4">
    <uv-button v-if="!isSigned" type="primary" :loading="signing" :disabled="loading || signing" @click="_signAgreement">
      签署协议
    </uv-button>
    <uv-button v-else disabled>
      已签署：{{ agreementTime }}
    </uv-button>
  </view>
</template>

<style lang="scss" scoped>
</style>
