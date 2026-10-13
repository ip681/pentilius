/** VIP (owner decision, 2026-10-13): active while now < vipUntil. */
export function isVip(player: { vipUntil: Date | null }, at: Date = new Date()): boolean {
  return !!player.vipUntil && player.vipUntil.getTime() > at.getTime();
}
