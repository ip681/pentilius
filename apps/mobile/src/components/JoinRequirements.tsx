import { Text, View } from 'react-native';
import type { ClanSummaryDto, PlayerProfileDto, RobotAttributesDto } from '@pentilius/shared';
import { AssetImage } from '@/components/AssetImage';
import { t } from '@/lib/i18n';
import { colors } from '@/theme';

type Requirements = ClanSummaryDto['joinRequirements'];

/** The web's meetsJoinRequirements: raw attribute points only (no equipment), the same check as the server. */
export function meetsJoinRequirements(clan: Pick<ClanSummaryDto, 'joinRequirements'>, profile: PlayerProfileDto | null, attributes: RobotAttributesDto | null): boolean {
  if (!profile || !attributes) return true; // not loaded yet — don't block the button falsely
  const req = clan.joinRequirements;
  if (req.allowedRaces.length > 0 && !req.allowedRaces.includes(profile.race)) return false;
  if (profile.level < req.minLevel) return false;
  if (attributes.base.damage < req.minAttributes.damage) return false;
  if (attributes.base.defense < req.minAttributes.defense) return false;
  if (attributes.base.hp < req.minAttributes.hp) return false;
  if (attributes.base.evasion < req.minAttributes.evasion) return false;
  return true;
}

function hasAnyRequirement(req: Requirements): boolean {
  return req.minLevel > 0 || req.minAttributes.damage > 0 || req.minAttributes.defense > 0 || req.minAttributes.hp > 0 || req.minAttributes.evasion > 0 || req.allowedRaces.length > 0;
}

function Chip({ children, icon }: { children: string; icon?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 6, paddingVertical: 2 }}>
      {icon && <AssetImage assetId={icon} size={12} label="" hideFallback />}
      <Text style={{ fontSize: 9, textTransform: 'uppercase', color: colors.textMuted }}>{children}</Text>
    </View>
  );
}

/** A clan's join requirements as small chips; nothing when it has none. */
export function JoinRequirementChips({ requirements: req }: { requirements: Requirements }) {
  if (!hasAnyRequirement(req)) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
      {req.minLevel > 0 && <Chip>{t('clans.reqLevel', { value: req.minLevel })}</Chip>}
      {req.minAttributes.damage > 0 && <Chip>{t('clans.reqDamage', { value: req.minAttributes.damage })}</Chip>}
      {req.minAttributes.defense > 0 && <Chip>{t('clans.reqDefense', { value: req.minAttributes.defense })}</Chip>}
      {req.minAttributes.hp > 0 && <Chip>{t('clans.reqHp', { value: req.minAttributes.hp })}</Chip>}
      {req.minAttributes.evasion > 0 && <Chip>{t('clans.reqEvasion', { value: req.minAttributes.evasion })}</Chip>}
      {req.allowedRaces.map((race) => (
        <Chip key={race} icon={`races.${race.toLowerCase()}.icon`}>
          {t(`race.${race}.name`)}
        </Chip>
      ))}
    </View>
  );
}
