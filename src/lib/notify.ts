// 運営向けのDiscord webhook通知。
// 通知には利用者の投稿内容を含めない(第三者のサーバーに送らないため)。
// 中身は/adminの管理ページで確認する。DISCORD_WEBHOOK_URL未設定なら何もしない。
export async function notifyAdmin(message: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch (e) {
    console.error("notifyAdmin failed:", e);
  }
}
