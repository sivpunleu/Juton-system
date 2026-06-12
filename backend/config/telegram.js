const firstClientUrl = () =>
  String(process.env.TELEGRAM_PUBLIC_URL || process.env.CLIENT_URL || '')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '')

export const getTelegramConfig = () => {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim()
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim()

  return {
    botToken,
    chatId,
    publicUrl: firstClientUrl(),
    isConfigured: Boolean(botToken && chatId),
  }
}
