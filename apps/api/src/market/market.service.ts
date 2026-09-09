import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MarketListingDto } from '@pentilius/shared';
import { ItemDefinition, ItemInstance, MarketListing, Player } from '@prisma/client';
import { GAME_BALANCE } from '../config/game-config';
import { computeItemStats } from '../inventory/inventory.service';
import { PrismaService } from '../prisma/prisma.service';

type ListingWithRelations = MarketListing & { seller: Player; itemInstance: ItemInstance & { itemDefinition: ItemDefinition } };

/**
 * Player-to-player market (owner decision, 2026-09-10) — instructions/GAME_SYSTEMS.md's
 * LOCKED "Trading and auction" direction, previously unbuilt. Equipment only
 * for now (see schema.prisma's MarketListing comment for the full rationale
 * and the deferred anti-self-trading heuristics).
 */
@Injectable()
export class MarketService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive(viewerId: string): Promise<MarketListingDto[]> {
    const listings = await this.prisma.marketListing.findMany({
      where: { status: 'ACTIVE' },
      include: { seller: true, itemInstance: { include: { itemDefinition: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const restricted = listings.filter((l) => l.visibleToClanOnly || l.visibleToFriendsOnly);
    if (restricted.length === 0) {
      return listings.map(toListingDto);
    }

    const [viewerMembership, friendRows] = await Promise.all([
      this.prisma.clanMembership.findUnique({ where: { playerId: viewerId } }),
      this.prisma.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterId: viewerId }, { addresseeId: viewerId }] },
      }),
    ]);
    const viewerClanId = viewerMembership?.clanId ?? null;
    const friendIds = new Set(friendRows.map((f) => (f.requesterId === viewerId ? f.addresseeId : f.requesterId)));

    const sellerIds = [...new Set(restricted.map((l) => l.sellerId))];
    const sellerMemberships = await this.prisma.clanMembership.findMany({ where: { playerId: { in: sellerIds } } });
    const sellerClanById = new Map(sellerMemberships.map((m) => [m.playerId, m.clanId]));

    const visible = listings.filter((listing) => {
      if (listing.sellerId === viewerId) return true; // sellers always see their own (also covered by listMine, but harmless here)
      if (!listing.visibleToClanOnly && !listing.visibleToFriendsOnly) return true;
      const sameClan = listing.visibleToClanOnly && viewerClanId !== null && sellerClanById.get(listing.sellerId) === viewerClanId;
      const isFriend = listing.visibleToFriendsOnly && friendIds.has(listing.sellerId);
      return sameClan || isFriend;
    });

    return visible.map(toListingDto);
  }

  async listMine(sellerId: string): Promise<MarketListingDto[]> {
    const listings = await this.prisma.marketListing.findMany({
      where: { status: 'ACTIVE', sellerId },
      include: { seller: true, itemInstance: { include: { itemDefinition: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return listings.map(toListingDto);
  }

  async createListing(
    sellerId: string,
    itemInstanceId: string,
    price: { priceMetal: number; priceCrystal: number; priceCredits: number },
    visibility: { visibleToClanOnly: boolean; visibleToFriendsOnly: boolean },
  ): Promise<MarketListingDto> {
    if (price.priceMetal <= 0 && price.priceCrystal <= 0 && price.priceCredits <= 0) {
      throw new BadRequestException('PRICE_REQUIRED');
    }
    if (visibility.visibleToClanOnly) {
      const membership = await this.prisma.clanMembership.findUnique({ where: { playerId: sellerId } });
      if (!membership) {
        throw new BadRequestException('NOT_IN_CLAN');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.itemInstance.findUnique({ where: { id: itemInstanceId }, include: { itemDefinition: true } });
      if (!item) {
        throw new NotFoundException('Item not found');
      }
      if (item.playerId !== sellerId) {
        throw new ForbiddenException('Item does not belong to this player');
      }
      if (item.itemDefinition.category !== 'EQUIPMENT') {
        throw new BadRequestException('ONLY_EQUIPMENT_LISTABLE');
      }
      if (item.equippedSlot !== null) {
        throw new BadRequestException('ITEM_EQUIPPED');
      }
      if (item.listedForSale) {
        throw new BadRequestException('ITEM_ALREADY_LISTED');
      }

      const activeCount = await tx.marketListing.count({ where: { sellerId, status: 'ACTIVE' } });
      if (activeCount >= GAME_BALANCE.market.maxActiveListingsPerPlayer) {
        throw new BadRequestException('TOO_MANY_LISTINGS');
      }

      await tx.itemInstance.update({ where: { id: itemInstanceId }, data: { listedForSale: true } });
      const created = await tx.marketListing.create({
        data: { sellerId, itemInstanceId, ...price, ...visibility },
        include: { seller: true, itemInstance: { include: { itemDefinition: true } } },
      });
      return toListingDto(created);
    });
  }

  async cancelListing(playerId: string, listingId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const listing = await tx.marketListing.findUnique({ where: { id: listingId } });
      if (!listing || listing.status !== 'ACTIVE' || listing.sellerId !== playerId) {
        throw new NotFoundException('Listing not found');
      }
      await tx.marketListing.update({ where: { id: listingId }, data: { status: 'CANCELLED', resolvedAt: new Date() } });
      await tx.itemInstance.update({ where: { id: listing.itemInstanceId }, data: { listedForSale: false } });
    });
  }

  async buyListing(buyerId: string, listingId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const listing = await tx.marketListing.findUnique({ where: { id: listingId } });
      if (!listing || listing.status !== 'ACTIVE') {
        throw new NotFoundException('Listing not found');
      }
      // Mandatory guard (owner decision, 2026-09-10) — the only anti-self-trading
      // rule built so far; IP/device heuristics were discussed and deferred.
      if (listing.sellerId === buyerId) {
        throw new BadRequestException('CANNOT_BUY_OWN_LISTING');
      }

      // Re-checked here even though the browse list already filters this —
      // never trust that a buyer only ever reaches a listing through the
      // filtered view (instructions/ARCHITECTURE.md: never trust the client).
      if (listing.visibleToClanOnly || listing.visibleToFriendsOnly) {
        const [buyerMembership, sellerMembership, friendship] = await Promise.all([
          tx.clanMembership.findUnique({ where: { playerId: buyerId } }),
          tx.clanMembership.findUnique({ where: { playerId: listing.sellerId } }),
          tx.friendship.findFirst({
            where: {
              status: 'ACCEPTED',
              OR: [
                { requesterId: buyerId, addresseeId: listing.sellerId },
                { requesterId: listing.sellerId, addresseeId: buyerId },
              ],
            },
          }),
        ]);
        const sameClan = listing.visibleToClanOnly && buyerMembership !== null && buyerMembership.clanId === sellerMembership?.clanId;
        const isFriend = listing.visibleToFriendsOnly && friendship !== null;
        if (!sameClan && !isFriend) {
          throw new NotFoundException('Listing not found');
        }
      }

      const buyer = await tx.player.findUniqueOrThrow({ where: { id: buyerId } });
      if (buyer.metal < listing.priceMetal || buyer.crystal < listing.priceCrystal || buyer.credits < listing.priceCredits) {
        throw new BadRequestException('NOT_ENOUGH_RESOURCES');
      }

      await tx.player.update({
        where: { id: buyerId },
        data: { metal: { decrement: listing.priceMetal }, crystal: { decrement: listing.priceCrystal }, credits: { decrement: listing.priceCredits } },
      });
      await tx.player.update({
        where: { id: listing.sellerId },
        data: { metal: { increment: listing.priceMetal }, crystal: { increment: listing.priceCrystal }, credits: { increment: listing.priceCredits } },
      });
      await tx.itemInstance.update({ where: { id: listing.itemInstanceId }, data: { playerId: buyerId, listedForSale: false } });
      await tx.marketListing.update({ where: { id: listingId }, data: { status: 'SOLD', resolvedAt: new Date(), buyerId } });
    });
  }
}

function toListingDto(listing: ListingWithRelations): MarketListingDto {
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    sellerUsername: listing.seller.username,
    itemInstanceId: listing.itemInstanceId,
    itemDefinitionKey: listing.itemInstance.itemDefinition.key,
    nameKey: listing.itemInstance.itemDefinition.nameKey,
    iconAssetId: listing.itemInstance.itemDefinition.iconAssetId,
    tier: listing.itemInstance.itemDefinition.tier!,
    quality: listing.itemInstance.quality,
    upgradeLevel: listing.itemInstance.upgradeLevel,
    maxUpgradeLevel: listing.itemInstance.itemDefinition.maxUpgradeLevel,
    currentStats: computeItemStats(
      listing.itemInstance.itemDefinition.baseStats as { attack?: number; defense?: number; hp?: number },
      listing.itemInstance.upgradeLevel,
    ),
    slot: listing.itemInstance.itemDefinition.slot!,
    rolledOptions: listing.itemInstance.rolledOptions,
    race: listing.itemInstance.race,
    price: { metal: listing.priceMetal, crystal: listing.priceCrystal, credits: listing.priceCredits },
    visibleToClanOnly: listing.visibleToClanOnly,
    visibleToFriendsOnly: listing.visibleToFriendsOnly,
    createdAt: listing.createdAt.toISOString(),
  };
}
