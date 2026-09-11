/**
 * 课表分享素材契约，对应后端 `GET /api/v2/timetable/share/assets/`（timetable/README.md §8.5）。
 */

export interface ShareAssets {
  /** 小程序码的绝对 URL；生成失败、配额用尽或开发环境为 null */
  miniapp_qrcode: string | null
  /** 公众号二维码的绝对 URL；未配置为 null */
  official_qrcode: string | null
  /** 海报页脚标语，后端缺省为「元培智慧书院 · YPPF」 */
  slogan: string
}
