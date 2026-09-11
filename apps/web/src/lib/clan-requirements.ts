import type { ClanSummaryDto, PlayerProfileDto, RobotAttributesDto } from '@pentilius/shared';

/** Equipment deliberately excluded — compares the player's raw Core Attribute points only, same as the backend check. */
export function meetsJoinRequirements(
  clan: Pick<ClanSummaryDto, 'joinRequirements'>,
  profile: PlayerProfileDto | null,
  attributes: RobotAttributesDto | null,
): boolean {
  if (!profile || !attributes) return true; // unknown yet — don't falsely block the button while loading
  const req = clan.joinRequirements;
  if (req.allowedRaces.length > 0 && !req.allowedRaces.includes(profile.race)) return false;
  if (profile.level < req.minLevel) return false;
  if (attributes.base.damage < req.minAttributes.damage) return false;
  if (attributes.base.defense < req.minAttributes.defense) return false;
  if (attributes.base.hp < req.minAttributes.hp) return false;
  if (attributes.base.evasion < req.minAttributes.evasion) return false;
  return true;
}

export function hasAnyRequirement(req: ClanSummaryDto['joinRequirements']): boolean {
  return (
    req.minLevel > 0 ||
    req.minAttributes.damage > 0 ||
    req.minAttributes.defense > 0 ||
    req.minAttributes.hp > 0 ||
    req.minAttributes.evasion > 0 ||
    req.allowedRaces.length > 0
  );
}
