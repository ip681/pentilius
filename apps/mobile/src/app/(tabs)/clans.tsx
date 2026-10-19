import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { ClanDetailDto, ClanMemberDto, ClanMessageDto, ClanRole, ClanSummaryDto, ClanWarHistoryEntryDto, ClanWarStateDto, Race, RobotAttributesDto } from '@pentilius/shared';
import { AssetImage, ResourceIcon } from '@/components/AssetImage';
import { ClanBuildingsGrid } from '@/components/ClanBuildings';
import { ClanLink } from '@/components/ClanLink';
import { TreasuryChanges, WarOutcomeLine } from '@/components/ClanWarResult';
import { JoinRequirementChips, meetsJoinRequirements } from '@/components/JoinRequirements';
import { MessageActions } from '@/components/MessageActions';
import { PlayerLink } from '@/components/PlayerLink';
import { CloseLink } from '@/components/ReportSheet';
import { ScreenTitle } from '@/components/ScreenTitle';
import { SheetButtons, SheetOption } from '@/components/SheetButtons';
import { Sheet } from '@/components/ui';
import {
  activateClanBuilding,
  ApiError,
  createClan,
  demoteClanMember,
  disbandClan,
  donateToClan,
  getClanMessages,
  getClanWarHistory,
  getClanWarStatus,
  getMyClan,
  getRobotAttributes,
  joinClan,
  kickClanMember,
  leaveClan,
  listClans,
  promoteClanMember,
  sendClanMessage,
  transferClanLeadership,
  updateClan,
  updateClanJoinRequirements,
  upgradeClanBuilding,
} from '@/lib/api';
import { formatDateTime, formatNumber, formatRelativeTime } from '@/lib/format';
import { getLocale, t } from '@/lib/i18n';
import { displayPlayerName } from '@/lib/player-name';
import { useSession } from '@/lib/session';
import { useLive } from '@/lib/use-live';
import { colors } from '@/theme';

const ALL_RACES: Race[] = ['LUXARI', 'VORLUN', 'ZARYTH', 'THALION', 'NEXAR'];
const DELETED_PLAYER_PREFIX = '~deleted~';

type ClanAction = 'promote' | 'demote' | 'transfer' | 'kick';
const ACTION_LABEL_KEY: Record<ClanAction, string> = { promote: 'clans.promote', demote: 'clans.demote', transfer: 'clans.transferLeadership', kick: 'clans.kick' };
const ACTION_CONFIRM_KEY: Record<ClanAction, string> = { promote: 'clans.confirmPromote', demote: 'clans.confirmDemote', transfer: 'clans.confirmTransfer', kick: 'clans.confirmKick' };

function availableActions(member: ClanMemberDto, myRole: ClanRole | null): ClanAction[] {
  if (member.isCurrentPlayer) return [];
  if (myRole === 'LEADER') {
    const actions: ClanAction[] = [];
    if (member.role === 'MEMBER') actions.push('promote');
    if (member.role === 'OFFICER') actions.push('demote');
    actions.push('transfer', 'kick');
    return actions;
  }
  if (myRole === 'OFFICER' && member.role === 'MEMBER') return ['kick'];
  return [];
}

type ClanOptionAction = 'leave' | 'disband';

// The web's Clans page (apps/web/src/app/(player)/[locale]/clans/page.tsx), as on a phone.
export default function ClansScreen() {
  const { profile, refresh: refreshProfile } = useSession();
  const [myClan, setMyClan] = useState<ClanDetailDto | null | undefined>(undefined);
  const [clans, setClans] = useState<ClanSummaryDto[] | null>(null);
  const [myAttributes, setMyAttributes] = useState<RobotAttributesDto | null>(null);
  const [warStatus, setWarStatus] = useState<ClanWarStateDto | null>(null);
  const [warHistory, setWarHistory] = useState<ClanWarHistoryEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [donate, setDonate] = useState({ metal: '', crystal: '', credits: '' });
  const [editingClan, setEditingClan] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editingRequirements, setEditingRequirements] = useState(false);
  const [req, setReq] = useState({ minLevel: '0', minDamage: '0', minDefense: '0', minHp: '0', minEvasion: '0' });
  const [reqRaces, setReqRaces] = useState<Race[]>([]);
  const [messages, setMessages] = useState<ClanMessageDto[] | null>(null);
  const [chatText, setChatText] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [actionSheetPlayerId, setActionSheetPlayerId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ClanAction | null>(null);
  const [clanOptionsOpen, setClanOptionsOpen] = useState(false);
  const [pendingClanAction, setPendingClanAction] = useState<ClanOptionAction | null>(null);
  const chatRef = useRef<{ scrollToEnd: (options?: { animated?: boolean }) => void } | null>(null);

  async function load() {
    try {
      const [mine, list, attributes] = await Promise.all([getMyClan(), listClans(), getRobotAttributes()]);
      setMyClan(mine.clan);
      setClans(list);
      setMyAttributes(attributes);
      setWarStatus(mine.clan ? (await getClanWarStatus()).war : null);
      setWarHistory(mine.clan ? await getClanWarHistory() : null);
    } catch {
      setError(t('clans.loadError'));
    }
  }
  useLive(load);

  async function loadMessages() {
    if (!myClan) return;
    try {
      setMessages(await getClanMessages(myClan.id));
    } catch {
      // A missed poll shouldn't replace the screen's main error.
    }
  }
  useEffect(() => {
    if (!myClan) setMessages(null);
    else loadMessages();
  }, [myClan?.id]);
  // Clan chat is live — every 5 s, only while this screen is in view.
  useLive(loadMessages, 5000);

  function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof ApiError && err.code) {
      const map: Record<string, string> = {
        ALREADY_IN_CLAN: t('clans.errorAlreadyInClan'),
        CLAN_NAME_TAKEN: t('clans.errorNameTaken'),
        INAPPROPRIATE_CONTENT: t('common.inappropriateContent'),
        CLAN_TAG_TAKEN: t('clans.errorTagTaken'),
        CLAN_FULL: t('clans.errorFull'),
        NOT_ENOUGH_RESOURCES: t('clans.errorNotEnoughResources'),
        NOT_ENOUGH_TREASURY: t('clans.errorNotEnoughTreasury'),
        SENDING_TOO_FAST: t('clans.errorSendingTooFast'),
        ALREADY_AT_WAR: t('clans.war.errorAlreadyAtWar'),
        TARGET_ALREADY_AT_WAR: t('clans.war.errorTargetAlreadyAtWar'),
        CLAN_TOO_SMALL: t('clans.war.errorClanTooSmall'),
        TARGET_TOO_SMALL: t('clans.war.errorTargetTooSmall'),
        REMATCH_COOLDOWN: t('clans.war.errorRematchCooldown'),
        JOIN_REQUIREMENTS_NOT_MET: t('clans.errorRequirementsNotMet'),
        ALREADY_ACTIVE: t('clans.tavern.errorAlreadyActive'),
        BUILDING_NOT_BUILT: t('clans.tavern.errorNotBuilt'),
      };
      if (map[err.code]) return map[err.code];
    }
    return fallback;
  }

  async function run(action: () => Promise<unknown>, fallbackKey: string, after?: () => void) {
    setError(null);
    try {
      await action();
      after?.();
      await load();
    } catch (err) {
      setError(errorMessage(err, t(fallbackKey)));
    }
  }

  function handleJoin(clanId: string, full: boolean, eligible: boolean) {
    if (full) return setError(t('clans.errorFull'));
    if (!eligible) return setError(t('clans.errorRequirementsNotMet'));
    run(() => joinClan(clanId), 'clans.joinError');
  }

  const ACTION_HANDLER: Record<ClanAction, (playerId: string) => Promise<void>> = {
    promote: promoteClanMember,
    demote: demoteClanMember,
    transfer: transferClanLeadership,
    kick: kickClanMember,
  };

  function openRequirementsEditor() {
    if (!myClan) return;
    const r = myClan.joinRequirements;
    setReq({ minLevel: String(r.minLevel), minDamage: String(r.minAttributes.damage), minDefense: String(r.minAttributes.defense), minHp: String(r.minAttributes.hp), minEvasion: String(r.minAttributes.evasion) });
    setReqRaces(r.allowedRaces);
    setEditingRequirements(true);
  }

  async function handleSendMessage() {
    if (!myClan || !chatText.trim()) return;
    setChatError(null);
    try {
      await sendClanMessage(myClan.id, chatText.trim());
      setChatText('');
      await loadMessages();
    } catch (err) {
      setChatError(errorMessage(err, t('clans.chatSendError')));
    }
  }

  async function handleBuilding(kind: 'upgrade' | 'activate', key: string, canAfford: boolean) {
    setError(null);
    if (!canAfford) {
      setError(t('clans.errorNotEnoughTreasury'));
      return;
    }
    try {
      await (kind === 'upgrade' ? upgradeClanBuilding(key) : activateClanBuilding(key));
      await load();
    } catch (err) {
      setError(errorMessage(err, t(kind === 'upgrade' ? 'clans.upgradeError' : 'clans.tavern.activateError')));
    }
  }

  const actionSheetMember = myClan?.members.find((m) => m.playerId === actionSheetPlayerId) ?? null;
  const closeActionSheet = () => {
    setActionSheetPlayerId(null);
    setPendingAction(null);
  };
  const closeClanOptions = () => {
    setClanOptionsOpen(false);
    setPendingClanAction(null);
  };
  const canManage = myClan?.myRole === 'LEADER' || myClan?.myRole === 'OFFICER';

  return (
    <ScrollView style={{ backgroundColor: colors.ink }} contentContainerStyle={{ padding: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <ScreenTitle title={t('clans.title')} subtitle={t('clans.subtitle')} />
      {error && <Text style={{ marginBottom: 16, color: '#f87171' }}>{error}</Text>}

      {myClan === null && (
        <>
          <View style={[panel, { padding: 20, marginBottom: 24, gap: 12 }]}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('clans.createTitle')}</Text>
            <LabeledInput label={t('clans.name')} value={name} onChangeText={setName} maxLength={30} />
            <LabeledInput label={t('clans.tag')} value={tag} onChangeText={(v) => setTag(v.replace(/[^a-zA-Z0-9]/g, ''))} maxLength={5} autoCapitalize="characters" />
            <LabeledInput label={t('clans.description')} value={description} onChangeText={setDescription} maxLength={280} />
            <AccentButton
              label={t('clans.createButton')}
              disabled={name.trim().length < 3 || tag.length < 2}
              onPress={() => run(() => createClan({ name, tag, description: description || undefined }), 'clans.createError')}
            />
          </View>

          <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 12 }}>{t('clans.browseTitle')}</Text>
          {clans && clans.length === 0 && <Text style={{ fontSize: 12, color: colors.textFaint }}>{t('clans.noClans')}</Text>}
          <View style={{ gap: 16 }}>
            {clans?.map((clan) => {
              const eligible = meetsJoinRequirements(clan, profile, myAttributes);
              const full = clan.memberCount >= clan.memberCap;
              return (
                <View key={clan.id} style={[panel, { padding: 16 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: '600' }}>
                      <ClanLink clanId={clan.id} tag={clan.tag} name={clan.name} />
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textFaint }}>
                      {clan.memberCount}/{clan.memberCap}
                    </Text>
                  </View>
                  {clan.description ? <Text style={{ marginBottom: 12, fontSize: 12, color: colors.textMuted }}>{clan.description}</Text> : null}
                  <Text style={{ marginBottom: 12, fontSize: 10, color: colors.textFaint }}>
                    {t('clans.leader')}: <PlayerLink playerId={clan.leaderId} username={clan.leaderUsername} isVip={clan.leaderIsVip} />
                  </Text>
                  <JoinRequirementChips requirements={clan.joinRequirements} />
                  <AccentButton label={t('clans.join')} dimmed={full || !eligible} onPress={() => handleJoin(clan.id, full, eligible)} />
                </View>
              );
            })}
          </View>
        </>
      )}

      {myClan && (
        <View style={[panel, { padding: 16 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ flex: 1, fontSize: 18, fontWeight: '600' }}>
              <ClanLink clanId={myClan.id} tag={myClan.tag} name={myClan.name} />
            </Text>
            <Text style={{ fontSize: 10, color: colors.textFaint }}>
              {myClan.memberCount}/{myClan.memberCap}
            </Text>
          </View>
          {myClan.description && !editingClan ? <Text style={{ marginBottom: 8, fontSize: 12, color: colors.textMuted }}>{myClan.description}</Text> : null}

          {warStatus && (
            <Pressable
              onPress={() => router.navigate('/clan-war')}
              style={{ marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderRadius: 6, borderWidth: 1, borderColor: colors.panelBorderDanger, backgroundColor: colors.well, paddingHorizontal: 16, paddingVertical: 10 }}
            >
              <Text style={{ flex: 1, fontSize: 12, textTransform: 'uppercase', color: colors.danger }}>{t('clans.war.atWarWith', { clan: `[${warStatus.enemyClanTag}] ${warStatus.enemyClanName}` })}</Text>
              <Text style={{ fontSize: 12, textTransform: 'uppercase', color: colors.textFaint }}>{t('clans.war.viewBattle')} →</Text>
            </Pressable>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
            {myClan.myRole === 'LEADER' && !editingClan && (
              <SmallButton
                label={t('clans.editClan')}
                onPress={() => {
                  setEditName(myClan.name);
                  setEditDescription(myClan.description ?? '');
                  setEditingClan(true);
                }}
              />
            )}
            {canManage && !editingRequirements && <SmallButton label={t('clans.editRequirements')} onPress={openRequirementsEditor} />}
          </View>

          {editingClan && (
            <View style={[well, { padding: 16, marginBottom: 16, gap: 12 }]}>
              <FormTitle>{t('clans.editTitle')}</FormTitle>
              <LabeledInput label={t('clans.name')} value={editName} onChangeText={setEditName} maxLength={30} dark />
              <LabeledInput label={t('clans.description')} value={editDescription} onChangeText={setEditDescription} maxLength={280} dark />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <AccentButton label={t('clans.editSave')} onPress={() => run(() => updateClan({ name: editName, description: editDescription }), 'clans.editError', () => setEditingClan(false))} />
                <SmallButton label={t('clans.editCancel')} onPress={() => setEditingClan(false)} />
              </View>
            </View>
          )}

          {editingRequirements && (
            <View style={[well, { padding: 16, marginBottom: 16, gap: 12 }]}>
              <FormTitle>{t('clans.requirementsTitle')}</FormTitle>
              <Text style={{ fontSize: 10, color: colors.textFaint }}>{t('clans.requirementsHint')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    ['minLevel', 'clans.reqLevelLabel'],
                    ['minDamage', 'robot.stat.damage'],
                    ['minDefense', 'robot.stat.defense'],
                    ['minHp', 'robot.stat.hp'],
                    ['minEvasion', 'robot.stat.evasion'],
                  ] as const
                ).map(([field, labelKey]) => (
                  <View key={field} style={{ width: '48%' }}>
                    <LabeledInput label={t(labelKey)} value={req[field]} onChangeText={(v) => setReq((prev) => ({ ...prev, [field]: v.replace(/[^0-9]/g, '') }))} keyboardType="number-pad" dark small />
                  </View>
                ))}
              </View>
              <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>{t('clans.reqRacesLabel')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {ALL_RACES.map((race) => {
                  const checked = reqRaces.includes(race);
                  return (
                    <Pressable
                      key={race}
                      onPress={() => setReqRaces((prev) => (prev.includes(race) ? prev.filter((r) => r !== race) : [...prev, race]))}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 }}
                    >
                      <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1, borderColor: colors.accent, backgroundColor: checked ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {checked && <Text style={{ fontSize: 11, color: colors.text }}>✓</Text>}
                      </View>
                      <AssetImage assetId={`races.${race.toLowerCase()}.icon`} size={16} label="" hideFallback />
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>{t(`race.${race}.name`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ fontSize: 9, color: colors.textFaint }}>{t('clans.reqRacesHint')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <AccentButton
                  label={t('clans.editSave')}
                  onPress={() =>
                    run(
                      () =>
                        updateClanJoinRequirements({
                          minLevel: Number(req.minLevel) || 0,
                          minDamage: Number(req.minDamage) || 0,
                          minDefense: Number(req.minDefense) || 0,
                          minHp: Number(req.minHp) || 0,
                          minEvasion: Number(req.minEvasion) || 0,
                          allowedRaces: reqRaces,
                        }),
                      'clans.requirementsError',
                      () => setEditingRequirements(false),
                    )
                  }
                />
                <SmallButton label={t('clans.editCancel')} onPress={() => setEditingRequirements(false)} />
              </View>
            </View>
          )}

          <View style={[well, { padding: 16, marginBottom: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <AssetImage assetId="clans.treasury.icon" size={24} label={t('clans.treasury')} />
              <FormTitle>{t('clans.treasury')}</FormTitle>
            </View>
            {/* Your own clan always comes with its treasury — only the public clan view hides it. */}
            <View style={{ flexDirection: 'row', gap: 20, marginBottom: 12 }}>
              {(['METAL', 'CRYSTAL', 'CREDITS'] as const).map((type) => (
                <View key={type} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ResourceIcon type={type} />
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>{formatNumber(myClan.treasury![type.toLowerCase() as 'metal' | 'crystal' | 'credits'])}</Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
              {(['METAL', 'CRYSTAL', 'CREDITS'] as const).map((type) => {
                const field = type.toLowerCase() as 'metal' | 'crystal' | 'credits';
                return (
                  <View key={type} style={{ width: 90, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <ResourceIcon type={type} size={14} />
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>{t(`resource.${type}`)}</Text>
                    </View>
                    <TextInput
                      value={donate[field]}
                      onChangeText={(v) => setDonate((prev) => ({ ...prev, [field]: v.replace(/[^0-9]/g, '') }))}
                      keyboardType="number-pad"
                      style={inputStyle(true, true)}
                    />
                  </View>
                );
              })}
              <AccentButton
                label={t('clans.donate')}
                onPress={() =>
                  run(
                    () =>
                      donateToClan({
                        metal: donate.metal ? Number(donate.metal) : undefined,
                        crystal: donate.crystal ? Number(donate.crystal) : undefined,
                        credits: donate.credits ? Number(donate.credits) : undefined,
                      }),
                    'clans.donateError',
                    () => {
                      setDonate({ metal: '', crystal: '', credits: '' });
                      refreshProfile();
                    },
                  )
                }
              />
            </View>
          </View>

          <ClanBuildingsGrid
            buildings={myClan.buildings}
            treasury={myClan.treasury!}
            canManage={canManage}
            onUpgrade={(key, ok) => handleBuilding('upgrade', key, ok)}
            onActivate={(key, ok) => handleBuilding('activate', key, ok)}
            error={error}
          />

          <MembersTable clan={myClan} onAction={(playerId) => {
            setActionSheetPlayerId(playerId);
            setPendingAction(null);
          }} />

          {warHistory && warHistory.length > 0 && (
            <View style={[well, { padding: 16, marginBottom: 16 }]}>
              <FormTitle>{t('clans.war.history')}</FormTitle>
              <View style={{ gap: 8, marginTop: 8 }}>
                {warHistory.map((entry) => (
                  <View key={entry.id} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}>
                    <WarOutcomeLine entry={entry} />
                    <Text style={{ fontSize: 10, color: colors.textFaint }}>{formatDateTime(entry.resolvedAt)}</Text>
                    <TreasuryChanges entry={entry} />
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={[well, { padding: 16, marginBottom: 16 }]}>
            <FormTitle>{t('clans.chat')}</FormTitle>
            <ScrollView
              ref={chatRef as never}
              nestedScrollEnabled
              onContentSizeChange={() => chatRef.current?.scrollToEnd({ animated: false })}
              style={{ height: 220, marginTop: 8, marginBottom: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.ink }}
              contentContainerStyle={{ padding: 10, gap: 6 }}
            >
              {messages && messages.length === 0 && <Text style={{ fontSize: 11, color: colors.textFaint }}>{t('clans.chatEmpty')}</Text>}
              {messages?.map((message) => (
                <Text key={message.id} style={{ fontSize: 12, color: colors.textMuted }}>
                  <Text style={{ fontSize: 9, color: colors.textFaint }}>{formatDateTime(message.createdAt)}</Text>{' '}
                  <PlayerLink playerId={message.playerId} username={message.username} isVip={message.isVip} style={{ fontWeight: '600' }} />
                  {': '}
                  {message.text}
                  {profile && message.playerId !== profile.id && !message.username.startsWith(DELETED_PLAYER_PREFIX) && (
                    <MessageActions messageId={message.id} targetType="CLAN_MESSAGE" authorId={message.playerId} authorName={message.username} allowBlock onBlocked={loadMessages} />
                  )}
                </Text>
              ))}
            </ScrollView>
            {chatError && <Text style={{ marginBottom: 8, fontSize: 11, color: colors.danger }}>{chatError}</Text>}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={chatText}
                onChangeText={setChatText}
                maxLength={500}
                placeholder={t('clans.chatPlaceholder')}
                placeholderTextColor={colors.textFaint}
                onSubmitEditing={handleSendMessage}
                returnKeyType="send"
                style={[inputStyle(true, true), { flex: 1 }]}
              />
              <AccentButton label={t('clans.chatSend')} disabled={!chatText.trim()} onPress={handleSendMessage} />
            </View>
          </View>

          <View style={{ alignSelf: 'flex-start' }}>
            <SmallButton label={t('clans.options')} onPress={() => setClanOptionsOpen(true)} />
          </View>

          <Sheet open={!!actionSheetMember} onClose={closeActionSheet}>
            {actionSheetMember &&
              (pendingAction ? (
                <>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>{t(ACTION_CONFIRM_KEY[pendingAction])}</Text>
                  <SheetButtons
                    danger={pendingAction === 'kick'}
                    onConfirm={() => {
                      const playerId = actionSheetMember.playerId;
                      const action = ACTION_HANDLER[pendingAction];
                      closeActionSheet();
                      run(() => action(playerId), 'clans.actionError');
                    }}
                    onCancel={() => setPendingAction(null)}
                  />
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{displayPlayerName(actionSheetMember.username)}</Text>
                  {availableActions(actionSheetMember, myClan.myRole).map((action) => (
                    <SheetOption key={action} label={t(ACTION_LABEL_KEY[action])} danger={action === 'kick'} onPress={() => setPendingAction(action)} />
                  ))}
                  <CloseLink onPress={closeActionSheet} />
                </>
              ))}
          </Sheet>

          <Sheet open={clanOptionsOpen} onClose={closeClanOptions}>
            {pendingClanAction ? (
              <>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>{t(pendingClanAction === 'leave' ? 'clans.confirmLeave' : 'clans.confirmDisband')}</Text>
                <SheetButtons
                  danger
                  onConfirm={() => {
                    const action = pendingClanAction;
                    closeClanOptions();
                    run(action === 'leave' ? leaveClan : disbandClan, 'clans.actionError');
                  }}
                  onCancel={() => setPendingClanAction(null)}
                />
              </>
            ) : (
              <>
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>{t('clans.options')}</Text>
                {(myClan.myRole === 'LEADER' ? (['leave', 'disband'] as const) : (['leave'] as const)).map((action) => (
                  <SheetOption key={action} label={t(action === 'leave' ? 'clans.leave' : 'clans.disband')} danger onPress={() => setPendingClanAction(action)} />
                ))}
                <CloseLink onPress={closeClanOptions} />
              </>
            )}
          </Sheet>
        </View>
      )}
    </ScrollView>
  );
}

const panel = { backgroundColor: colors.panel, borderColor: colors.panelBorder, borderWidth: 1, borderRadius: 8 } as const;
const well = { backgroundColor: colors.well, borderColor: colors.wellBorder, borderWidth: 1, borderRadius: 6 } as const;

function inputStyle(dark: boolean, small: boolean) {
  return { borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: dark ? colors.ink : colors.well, paddingHorizontal: small ? 8 : 12, paddingVertical: small ? 6 : 8, fontSize: small ? 13 : 14, color: colors.text } as const;
}

function LabeledInput({
  label,
  dark = false,
  small = false,
  ...input
}: { label: string; dark?: boolean; small?: boolean } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: small ? 10 : 12, color: colors.textMuted }}>{label}</Text>
      <TextInput placeholderTextColor={colors.textFaint} style={inputStyle(dark, small)} {...input} />
    </View>
  );
}

function FormTitle({ children }: { children: string }) {
  return <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textFaint }}>{children}</Text>;
}

function AccentButton({ label, onPress, disabled = false, dimmed = false }: { label: string; onPress: () => void; disabled?: boolean; dimmed?: boolean }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ borderRadius: 6, borderWidth: 1, borderColor: colors.accent, backgroundColor: pressed ? colors.accentBgHover : colors.accentBg, paddingHorizontal: 16, paddingVertical: 9, alignItems: 'center', opacity: disabled || dimmed ? 0.3 : 1 })}
    >
      <Text style={{ fontSize: 11, textTransform: 'uppercase', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ borderRadius: 6, borderWidth: 1, borderColor: colors.wellBorder, backgroundColor: colors.well, paddingHorizontal: 12, paddingVertical: 7 }}>
      <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.textMuted }}>{label}</Text>
    </Pressable>
  );
}

const MEMBER_COLUMNS = { level: 36, member: 170, role: 80, resource: 64, active: 96, actions: 92 };

/** The members table; on a phone it scrolls sideways, as on the web. */
function MembersTable({ clan, onAction }: { clan: ClanDetailDto; onAction: (playerId: string) => void }) {
  const locale = getLocale();
  const head = (width: number, child: React.ReactNode, right = false) => <View style={{ width, paddingBottom: 8, alignItems: right ? 'flex-end' : 'flex-start' }}>{child}</View>;
  const headText = (key: string) => <Text style={{ fontSize: 10, textTransform: 'uppercase', color: colors.textFaint }}>{t(key)}</Text>;
  return (
    <ScrollView horizontal style={{ marginBottom: 16 }}>
      <View>
        <View style={{ flexDirection: 'row' }}>
          {head(MEMBER_COLUMNS.level, headText('clans.level'))}
          {head(MEMBER_COLUMNS.member, headText('clans.member'))}
          {head(MEMBER_COLUMNS.role, headText('clans.role'))}
          {(['METAL', 'CRYSTAL', 'CREDITS'] as const).map((type) => (
            <View key={type} style={{ width: MEMBER_COLUMNS.resource, paddingBottom: 8, alignItems: 'flex-end' }}>
              <ResourceIcon type={type} />
            </View>
          ))}
          {head(MEMBER_COLUMNS.active, headText('clans.lastActive'), true)}
          {head(MEMBER_COLUMNS.actions, headText('clans.actions'), true)}
        </View>
        {clan.members.map((member) => {
          const actions = availableActions(member, clan.myRole);
          const cell = (width: number, child: React.ReactNode, right = false) => <View style={{ width, paddingVertical: 8, alignItems: right ? 'flex-end' : 'flex-start', justifyContent: 'center' }}>{child}</View>;
          return (
            <View key={member.playerId} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.wellBorder }}>
              {cell(MEMBER_COLUMNS.level, <Text style={{ fontSize: 12, color: colors.textMuted }}>{member.level}</Text>)}
              {cell(
                MEMBER_COLUMNS.member,
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 }}>
                  <AssetImage assetId={`races.${member.race.toLowerCase()}.icon`} size={16} label="" hideFallback />
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12 }}>
                    <PlayerLink playerId={member.playerId} username={member.username} isVip={member.isVip} />
                    {member.isCurrentPlayer ? <Text style={{ color: colors.textFaint }}> ({t('clans.you')})</Text> : null}
                  </Text>
                </View>,
              )}
              {cell(MEMBER_COLUMNS.role, <Text style={{ fontSize: 12, color: colors.text }}>{t(`clans.roleLabel.${member.role}`)}</Text>)}
              {(['metal', 'crystal', 'credits'] as const).map((field) => (
                <View key={field} style={{ width: MEMBER_COLUMNS.resource, paddingVertical: 8, alignItems: 'flex-end', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>{member.contributed[field] || '—'}</Text>
                </View>
              ))}
              {cell(
                MEMBER_COLUMNS.active,
                member.online ? <Text style={{ fontSize: 12, color: colors.positive }}>{t('clans.online')}</Text> : <Text style={{ fontSize: 12, color: colors.textFaint }}>{formatRelativeTime(member.lastActiveAt, locale)}</Text>,
                true,
              )}
              {cell(
                MEMBER_COLUMNS.actions,
                actions.length > 0 ? <SmallButton label={t('clans.action')} onPress={() => onAction(member.playerId)} /> : null,
                true,
              )}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
