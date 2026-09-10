import { getTicket } from '@/api/login'
import { toRequestError } from '@/http/errors'

export interface OpenWebviewOptions {
  uri: string
  isPublic?: boolean
  mode?: 'navigateTo' | 'redirectTo' | 'reLaunch'
}

function buildWebviewUrl(uri: string, isPublic: boolean, ticket?: string) {
  const params = [
    `uri=${encodeURIComponent(uri)}`,
    `public=${isPublic ? '1' : '0'}`,
  ]

  if (ticket) {
    params.push(`ticket=${encodeURIComponent(ticket)}`)
  }

  return `/pages/generic/webview?${params.join('&')}`
}

function navigateToWebview(mode: OpenWebviewOptions['mode'], url: string) {
  switch (mode) {
    case 'redirectTo':
      uni.redirectTo({ url })
      return
    case 'reLaunch':
      uni.reLaunch({ url })
      return
    default:
      uni.navigateTo({ url })
  }
}

export async function openWebview(options: OpenWebviewOptions): Promise<void> {
  const {
    uri,
    isPublic = false,
    mode = 'navigateTo',
  } = options

  if (isPublic) {
    const url = buildWebviewUrl(uri, true)
    navigateToWebview(mode, url)
    return
  }

  try {
    const res = await getTicket()
    const url = buildWebviewUrl(uri, false, res.ticket)
    navigateToWebview(mode, url)
  }
  catch (err) {
    console.error(err)
    const requestError = toRequestError(err)
    uni.showToast({
      title: requestError.message,
      icon: 'none',
    })
  }
}
