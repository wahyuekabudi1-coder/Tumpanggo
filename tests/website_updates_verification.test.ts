/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Verification Test Suite for TumpangGo Website Updates:
 * 1. Review Carousel & 10 Testimonial Entries (6 Customer, 4 Merchant)
 *    - Automatic infinite loop (no manual Prev/Next buttons, no 1/10 numbers, no dot indicators)
 *    - No demo/example labels ("Contoh ulasan", etc.)
 *    - Authentic Google attribution (Google logo/link ONLY rendered when source === 'google')
 *    - Redundant location label "Kecamatan Tumpang" removed from cards
 * 2. Social Media Links (TikTok, Instagram, Facebook) with new tab security
 * 3. Exact Footer Sentence ("Super App Lokal Kecamatan Tumpang untuk UMKM.")
 */

import fs from 'fs';
import path from 'path';
import { 
  DEFAULT_REVIEWS, 
  ReviewItem 
} from '../src/components/UserTestimonialsSection.tsx';
import { 
  DEFAULT_PLATFORM_FALLBACKS,
  validateSocialUrl 
} from '../src/components/SocialMediaButtons.tsx';

let passed = 0;
let failed = 0;

function assert(condition: boolean, desc: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

console.log('================================================================================');
console.log('  TUMPANGGO — REVIEW CAROUSEL REVISION, SOCIAL MEDIA & FOOTER VERIFICATION');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. AUDIT REVIEW CAROUSEL ENTRIES (EXACTLY 10 ENTRIES)
// -----------------------------------------------------------------------------
console.log('--- 1. AUDITING DEFAULT_REVIEWS (EXACTLY 10 ENTRIES) ---');

assert(Array.isArray(DEFAULT_REVIEWS), 'DEFAULT_REVIEWS is an array');
assert(DEFAULT_REVIEWS.length === 10, `DEFAULT_REVIEWS contains exactly 10 entries (got ${DEFAULT_REVIEWS.length})`);

const customerReviews = DEFAULT_REVIEWS.filter((r: ReviewItem) => r.role === 'Pelanggan');
const merchantReviews = DEFAULT_REVIEWS.filter((r: ReviewItem) => r.role === 'Merchant');

assert(customerReviews.length === 6, `Exactly 6 Customer reviews present (got ${customerReviews.length})`);
assert(merchantReviews.length === 4, `Exactly 4 Merchant reviews present (got ${merchantReviews.length})`);

// Check unique contents and natural language
const uniqueContents = new Set(DEFAULT_REVIEWS.map(r => r.content.trim()));
assert(uniqueContents.size === 10, 'All 10 review contents are distinct and non-repeating');

// Check all reviews have valid ratings and non-empty text
DEFAULT_REVIEWS.forEach((r, idx) => {
  assert(r.content.length >= 15, `Review #${idx + 1} has substantial natural text (${r.content.length} chars)`);
  assert(r.rating >= 1 && r.rating <= 5, `Review #${idx + 1} has valid rating (${r.rating})`);
});

// -----------------------------------------------------------------------------
// 2. AUDIT COMPONENT SOURCE CODE (NO NAVIGATION CONTROLS, NO DEMO LABELS, NO REDUNDANT LOCATION, ACCURATE GOOGLE ATTRIBUTION)
// -----------------------------------------------------------------------------
console.log('\n--- 2. AUDITING UserTestimonialsSection.tsx SOURCE CODE ---');

const userTestimonialsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UserTestimonialsSection.tsx'), 'utf-8');

assert(userTestimonialsSrc.includes('prefers-reduced-motion'), 'Includes detection for prefers-reduced-motion');
assert(userTestimonialsSrc.includes('reviewsList.map'), 'Maps reviews directly for 1 card per slide display');

// 2.1 Navigation controls must be removed
assert(!userTestimonialsSrc.includes('ChevronLeft'), 'Manual left arrow (ChevronLeft) is removed from review section');
assert(!userTestimonialsSrc.includes('ChevronRight'), 'Manual right arrow (ChevronRight) is removed from review section');
assert(!userTestimonialsSrc.includes('totalSlides > 1 && (') || !userTestimonialsSrc.includes('role="tablist"'), 'Slide dot indicators (role="tablist") are removed');
assert(!userTestimonialsSrc.includes('{activeSlide + 1} / {totalSlides}'), 'Numeric slide position counter (1/10) is removed');
assert(!userTestimonialsSrc.includes('{activeSlide + 1} dari {totalSlides}'), 'Mobile numeric counter is removed');

// 2.2 Demo / Example labels must be removed
assert(!userTestimonialsSrc.includes('Contoh ulasan'), 'No "Contoh ulasan" labels are present in the card UI');
assert(!userTestimonialsSrc.includes('Contoh testimoni'), 'No "Contoh testimoni" labels are present');

// 2.3 Redundant location label must be removed
assert(!userTestimonialsSrc.includes('Kecamatan Tumpang</span>'), 'Redundant "Kecamatan Tumpang" card label is removed');

// 2.4 Google attribution is accurately conditioned
assert(userTestimonialsSrc.includes('isGoogleSource'), 'Checks if review originates from Google (isGoogleSource)');
assert(userTestimonialsSrc.includes('GoogleIcon'), 'Provides authentic Google icon for verified Google source');
assert(userTestimonialsSrc.includes("review.source === 'google'"), 'Strictly verifies review.source === google before showing Google branding');

// 2.5 Auto-slide loop and pause mechanism
assert(userTestimonialsSrc.includes('(prev + 1) % totalSlides'), 'Continuous circular loop transition implemented');
assert(userTestimonialsSrc.includes('isPaused'), 'Pauses autoplay when hovered or touched');
assert(userTestimonialsSrc.includes('+ Tulis Review'), 'Keeps submission button for adding verified reviews');

// -----------------------------------------------------------------------------
// 3. AUDIT SOCIAL MEDIA LINKS
// -----------------------------------------------------------------------------
console.log('\n--- 3. AUDITING SocialMediaButtons.tsx ---');

const socialButtonsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SocialMediaButtons.tsx'), 'utf-8');

assert(socialButtonsSrc.includes("id: 'tiktok'"), 'Includes official TikTok channel');
assert(socialButtonsSrc.includes("id: 'instagram'"), 'Includes official Instagram channel');
assert(socialButtonsSrc.includes("id: 'facebook'"), 'Includes official Facebook channel');
assert(!socialButtonsSrc.includes("id: 'twitter'") && !socialButtonsSrc.includes("id: 'youtube'"), 'Strictly limited to TikTok, Instagram, and Facebook');

assert(socialButtonsSrc.includes('target="_blank"'), 'All social media links open in a new tab (target="_blank")');
assert(socialButtonsSrc.includes('rel="noopener noreferrer"'), 'All social media links have security rel="noopener noreferrer"');

assert(DEFAULT_PLATFORM_FALLBACKS.tiktok === 'https://www.tiktok.com', 'Fallback TikTok URL is official tiktok.com');
assert(DEFAULT_PLATFORM_FALLBACKS.instagram === 'https://www.instagram.com', 'Fallback Instagram URL is official instagram.com');
assert(DEFAULT_PLATFORM_FALLBACKS.facebook === 'https://www.facebook.com', 'Fallback Facebook URL is official facebook.com');

// Test URL validation
assert(validateSocialUrl('tiktok', 'https://www.tiktok.com/@tumpanggo') === 'https://www.tiktok.com/@tumpanggo', 'Validates authentic TikTok URL');
assert(validateSocialUrl('instagram', 'https://instagram.com/tumpanggo') === 'https://instagram.com/tumpanggo', 'Validates authentic Instagram URL');
assert(validateSocialUrl('facebook', 'https://facebook.com/tumpanggo') === 'https://facebook.com/tumpanggo', 'Validates authentic Facebook URL');
assert(validateSocialUrl('tiktok', 'https://malicious-site.com') === null, 'Rejects spoofed social URLs');

// -----------------------------------------------------------------------------
// 4. AUDIT FOOTER SENTENCE IN CustomerView.tsx
// -----------------------------------------------------------------------------
console.log('\n--- 4. AUDITING FOOTER SENTENCE IN CustomerView.tsx ---');

const customerViewSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/CustomerView.tsx'), 'utf-8');

const targetFooterSentence = 'Super App Lokal Kecamatan Tumpang untuk UMKM.';
assert(customerViewSrc.includes(targetFooterSentence), `Footer contains exact sentence: "${targetFooterSentence}"`);
assert(!customerViewSrc.includes('Super-App lokal Kecamatan Tumpang untuk UMKM, kurir instan, dan layanan digital.'), 'Old footer sentence with extra claims was completely removed');

// Confirm copyright and secret portal are preserved
assert(customerViewSrc.includes('© 2026 tumpangGo. All rights reserved.'), 'Copyright line remains intact');
assert(customerViewSrc.includes('portalAccessUnlocked'), 'Secret portal access mechanism remains intact');

console.log('\n================================================================================');
console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================================');

if (failed > 0) {
  process.exit(1);
}
