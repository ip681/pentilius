import { BadRequestException, Global, Injectable, Module } from '@nestjs/common';
import { findBannedWords, FilterWord, maskBannedWords } from './content-filter';
import { PrismaService } from '../prisma/prisma.service';

// The word list changes rarely (godmaster edits); re-read it at most this often.
// Edits made through godmaster also invalidate the cache immediately.
const CACHE_TTL_MS = 60_000;

/**
 * Content filter (owner decision, 2026-10-12 — app-store UGC requirement).
 * Names/descriptions are rejected (assertClean); chat and direct messages are
 * masked instead (mask). See moderation/content-filter.ts for the matching rules.
 */
@Injectable()
export class ContentFilterService {
  private cache: { words: FilterWord[]; loadedAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Rejects with a generic INAPPROPRIATE_CONTENT if any of the texts contains a banned word (never says which). */
  async assertClean(...texts: (string | null | undefined)[]): Promise<void> {
    const words = await this.words();
    for (const text of texts) {
      if (text && findBannedWords(text, words).length > 0) {
        throw new BadRequestException('INAPPROPRIATE_CONTENT');
      }
    }
  }

  async mask(text: string): Promise<string> {
    return maskBannedWords(text, await this.words());
  }

  /** For the godmaster test box: which words a text hits, and how chat would show it. */
  async test(text: string): Promise<{ matches: string[]; masked: string }> {
    const words = await this.words();
    return { matches: findBannedWords(text, words), masked: maskBannedWords(text, words) };
  }

  invalidate(): void {
    this.cache = null;
  }

  private async words(): Promise<FilterWord[]> {
    if (!this.cache || Date.now() - this.cache.loadedAt > CACHE_TTL_MS) {
      const rows = await this.prisma.bannedWord.findMany({ select: { normalized: true, match: true } });
      this.cache = { words: rows, loadedAt: Date.now() };
    }
    return this.cache.words;
  }
}

// Global so auth, clans, player and friends can all use it without new module imports.
@Global()
@Module({
  providers: [ContentFilterService],
  exports: [ContentFilterService],
})
export class ContentFilterModule {}
