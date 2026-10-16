#!/usr/bin/env php
<?php
/**
 * Standalone test for backend/api/media.php URL construction logic.
 * Does NOT touch the database - exercises productImageUrl() / coverUrl() directly.
 *
 * Simulates the PRODUCTION cPanel layout:
 *   DOCUMENT_ROOT = /public_html  (site root)
 *   file at        /public_html/backend/uploads/products/{slug}.jpg
 *   served URL     https://shop.hedztech.com/uploads/products/{slug}.jpg
 *
 * Usage: php scripts/test_media_logic.php
 */
require_once __DIR__ . '/../backend/api/media.php';

// Simulate production: DOCUMENT_ROOT is the site root, files live under backend/
$_SERVER['HTTPS'] = 'on';
$_SERVER['HTTP_HOST'] = 'shop.hedztech.com';
$_SERVER['DOCUMENT_ROOT'] = realpath(dirname(__DIR__, 1));

function pass($label, $cond) {
    echo ($cond ? "PASS" : "FAIL") . " - $label\n";
}

// 1. Genuine admin upload is preserved and rewritten to the live domain.
$url = productImageUrl('/uploads/windows-11-pro-retail-key_20261014.jpg', 'Windows 11 Pro Retail Key', 'windows-11-pro-retail');
pass("admin upload preserved", $url === 'https://shop.hedztech.com/uploads/windows-11-pro-retail-key_20261014.jpg');

// 2. Existing /assets/ image is preserved.
$url = productImageUrl('https://shop.hedztech.com/assets/windows-11-pro-retail-key_20261014.jpg', 'Windows 11 Pro Retail Key', 'windows-11-pro-retail');
pass("assets image preserved", $url === 'https://shop.hedztech.com/assets/windows-11-pro-retail-key_20261014.jpg');

// 3. Product with NO stored image -> maps to generated asset (primary fix).
$url = productImageUrl(null, 'Windows 10 Pro Retail Key', 'windows-10-pro-retail');
pass("generated asset mapped", $url === 'https://shop.hedztech.com/uploads/products/windows-10-pro-retail.jpg');

// 4. Empty string image_url -> generated asset.
$url = productImageUrl('', 'Office 2021 Pro Plus', 'office-2021-pro-plus-1pc-flash');
pass("empty -> generated asset", $url === 'https://shop.hedztech.com/uploads/products/office-2021-pro-plus-1pc-flash.jpg');

// 5. localhost seed path -> generated asset (seed data cleanup).
$url = productImageUrl('/Nepal-TechGuard/backend/uploads/windows-10-enterprise-ltsc-2021.png', 'Windows 10 Enterprise LTSC 2021', 'windows-10-enterprise-ltsc-2021-mak-20pc');
pass("localhost seed path -> generated asset", $url === 'https://shop.hedztech.com/uploads/products/windows-10-enterprise-ltsc-2021-mak-20pc.jpg');

// 6. cover.php fallback path must point to the REAL file (backend/api/cover.php).
$cover = coverUrl('Some Odd Product', 'some-odd-slug');
pass("cover.php path is real backend/api/cover.php", strpos($cover, '/backend/api/cover.php?') !== false);
pass("cover.php no longer points to nonexistent /backend/cover.php", strpos($cover, '/backend/cover.php?') === false || strpos($cover, '/backend/api/cover.php?') !== false);

// 7. Slug with no generated asset -> cover fallback (never null, never 404).
$url = productImageUrl(null, 'Mystery Product', 'totally-unknown-slug');
pass("unknown slug -> cover fallback", strpos($url, '/backend/api/cover.php?') !== false);

echo "\nDone.\n";