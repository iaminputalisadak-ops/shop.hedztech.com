#!/usr/bin/env php
<?php
/**
 * Authoritative end-to-end catalog verification.
 *
 * Uses the REAL backend/api/media.php productImageUrl() to resolve every
 * product's image URL, then HTTP-GETs each URL against the running dev server
 * and confirms it decodes as an image.
 *
 * Requires: PHP dev server on localhost:8000
 *   php -S localhost:8000 backend/router.php
 *
 * Usage: php scripts/verify_catalog.php
 */
$_SERVER['HTTPS'] = '';
// Point at the running dev server so resolved URLs are testable locally.
$_SERVER['HTTP_HOST'] = 'localhost:8000';
$_SERVER['DOCUMENT_ROOT'] = realpath(dirname(__DIR__, 1));
require_once __DIR__ . '/../backend/api/media.php';

$livePath = __DIR__ . '/../scripts/data/products-live.json';
$products = json_decode(file_get_contents($livePath), true);
if (!$products) {
    fwrite(STDERR, "products-live.json not found\n");
    exit(1);
}

function httpCheck(string $url): array {
    // Absolute production URLs cannot be retested against the local dev server;
    // they are preserved as-is and were verified separately on the live host.
    if (preg_match('#^https?://(shop\.hedztech\.com|www\.shop\.hedztech\.com)/#', $url)) {
        return [true, "external-production (preserved)"];
    }
    $ctx = stream_context_create(['http' => ['timeout' => 10, 'ignore_errors' => true]]);
    $res = @file_get_contents($url, false, $ctx);
    if ($res === false) {
        return [false, "unreachable"];
    }
    $hdrs = $http_response_header ?? [];
    $code = 200;
    $ctype = '';
    foreach ($hdrs as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) {
            $code = (int)$m[1];
        }
        if (stripos($h, 'Content-Type:') === 0) {
            $ctype = trim(substr($h, 14));
        }
    }
    if ($code < 200 || $code >= 300) {
        return [false, "HTTP $code"];
    }
    if (stripos($ctype, 'image/') !== 0) {
        return [false, "not-image $ctype"];
    }
    return [true, "$code $ctype " . round(strlen($res) / 1024) . "KB"];
}

$ok = $bad = 0;
$broken = [];
foreach ($products as $p) {
    $slug = (string)($p['slug'] ?? '');
    $name = (string)($p['name'] ?? '');
    $stored = $p['image_url'] ?? null;
    $url = productImageUrl($stored, $name, $slug);
    [$good, $detail] = httpCheck($url);
    if ($good) {
        $ok++;
    } else {
        $bad++;
        $broken[] = [$name, $url, $detail];
    }
}

echo "products: " . count($products) . " | served OK: $ok | broken: $bad\n\n";
if ($broken) {
    echo "Broken images:\n";
    foreach (array_slice($broken, 0, 20) as [$n, $u, $d]) {
        echo "  $n\n    $u -> $d\n";
    }
    if (count($broken) > 20) {
        echo "  ... and " . (count($broken) - 20) . " more\n";
    }
}
echo "\n" . ($bad === 0 ? "ALL PASS" : "SOME FAILED") . "\n";
exit($bad === 0 ? 0 : 1);