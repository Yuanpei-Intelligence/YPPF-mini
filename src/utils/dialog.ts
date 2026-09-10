type ConfirmOptions = Omit<UniApp.ShowModalOptions, 'success' | 'fail' | 'complete'>

/**
 * `uni.showModal` 的 Promise 包装：用户点击确定时 resolve true，取消或调用失败都视为 false。
 * 取消不是错误，调用方不要为它弹提示。
 */
export function confirmModal(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      cancelText: '取消',
      ...options,
      success: res => resolve(!!res.confirm),
      fail: () => resolve(false),
    })
  })
}
