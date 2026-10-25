/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Verification Test Suite for TumpangGo Website Updates:
 * 1. Review Carousel & 10 Testimonial Entries (6 Customer, 4 Merchant)
 * 2. Social Media Links (TikTok, Instagram, Facebook) with new tab security
 * 3. Exact Footer Sentence ("Super App Lokal Kecamatan Tumpang untuk UMKM.")
 */

import fs from 'fs';
import path from 'path';
import { 
  DEFAULT_DEMO_REVIEWS, 
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
console.log('  TUMPANGGO — REVIEW CAROUSEL, SOCIAL MEDIA & FOOTER VERIFICATION');
console.log('================================================================================\n');

// -----------------------------------------------------------------------------
// 1. AUDIT REVIEW CAROUSEL & 10 TESTIMONIAL ENTRIES
// -----------------------------------------------------------------------------
console.log('--- 1. AUDITING DEFAULT_DEMO_REVIEWS (EXACTLY 10 ENTRIES) ---');

assert(Array.isArray(DEFAULT_DEMO_REVIEWS), 'DEFAULT_DEMO_REVIEWS is an array');
assert(DEFAULT_DEMO_REVIEWS.length === 10, `DEFAULT_DEMO_REVIEWS contains exactly 10 entries (got ${DEFAULT_DEMO_REVIEWS.length})`);

const customerReviews = DEFAULT_DEMO_REVIEWS.filter((r: ReviewItem) => r.role === 'Pelanggan');
const merchantReviews = DEFAULT_DEMO_REVIEWS.filter((r: ReviewItem) => r.role === 'Merchant');

assert(customerReviews.length === 6, `Exactly 6 Customer reviews present (got ${customerReviews.length})`);
assert(merchantReviews.length === 4, `Exactly 4 Merchant reviews present (got ${merchantReviews.length})`);

// Check unique contents and natural language
const uniqueContents = new Set(DEFAULT_DEMO_REVIEWS.map(r => r.content.trim()));
assert(uniqueContents.size === 10, 'All 10 review contents are distinct and non-repeating');

// Check honesty flag
const allMarkedExample = DEFAULT_DEMO_REVIEWS.every(r => r.isExample === true);
assert(allMarkedExample, 'All 10 default demo reviews are honestly marked with isExample: true');

// Check all reviews have valid ratings and non-empty text
DEFAULT_DEMO_REVIEWS.forEach((r, idx) => {
  assert(r.content.length >= 15, `Review #${idx + 1} has substantial natural text (${r.content.length} chars)`);
  assert(r.rating >= 1 && r.rating <= 5, `Review #${idx + 1} has valid rating (${r.rating})`);
});

// -----------------------------------------------------------------------------
// 2. AUDIT COMPONENT SOURCE CODE (SINGLE CARD & REDUCED MOTION)
// -----------------------------------------------------------------------------
console.log('\n--- 2. AUDITING UserTestimonialsSection.tsx SOURCE CODE ---');

const userTestimonialsSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/UserTestimonialsSection.tsx'), 'utf-8');

assert(userTestimonialsSrc.includes('prefers-reduced-motion'), 'Includes detection for prefers-reduced-motion');
assert(userTestimonialsSrc.includes('reviewsList.map'), 'Maps reviews directly for 1 card per slide display');
const carouselTrackSection = userTestimonialsSrc.split('Sliding Track')[1] || '';
assert(!carouselTrackSection.includes('grid-cols-2'), 'Does not use multi-card per slide grid in carousel track');
assert(userTestimonialsSrc.includes('Contoh ulasan pelanggan'), 'Provides transparent demo label for customer reviews');
assert(userTestimonialsSrc.includes('Contoh ulasan mitra UMKM'), 'Provides transparent demo label for merchant reviews');
assert(userTestimonialsSrc.includes('Ulasan Terverifikasi'), 'Distinguishes verified reviews from demo reviews');
assert(userTestimonialsSrc.includes('ChevronLeft') && userTestimonialsSrc.includes('ChevronRight'), 'Provides manual navigation buttons');
assert(userTestimonialsSrc.includes('role="tablist"'), 'Provides accessible dot indicators');

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
