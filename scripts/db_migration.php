<?php
require_once __DIR__ . '/../backend/config/database.php';

$pdo = getConnection();
$productsFile = __DIR__ . '/data/products-live.json';
$products = json_decode(file_get_contents($productsFile), true);

$families = [
    "windows" => ["topic" => "Windows", "noun" => "Windows license key"],
    "office" => ["topic" => "Microsoft Office", "noun" => "Microsoft Office license"],
    "antivirus" => ["topic" => "antivirus", "noun" => "antivirus license"],
    "generic" => ["topic" => "software", "noun" => "software license"],
];

function getFamily($p) {
    $n = strtolower($p['name']);
    if (strpos($n, 'windows') !== false) return 'windows';
    if (strpos($n, 'office') !== false) return 'office';
    if (strpos($n, 'antivirus') !== false || strpos($n, 'quick heal') !== false) return 'antivirus';
    return 'generic';
}

$updated = 0;
$skipped = 0;
$dryRun = false; // Change to false to apply updates

foreach ($products as $p) {
    if (($p['is_active'] ?? 0) != 1) continue;

    $familyKey = getFamily($p);
    $family = $families[$familyKey] ?? $families['generic'];

    $enhancedDesc = "{$p['name']} is a genuine {$family['topic']} product sold by Nepal TechGuard.\n\n## Key Features\n- Genuine licence\n- Fast digital delivery\n- Activation support\n- Nepal pricing";

    if ($dryRun) {
        echo "Dry Run: Would update ID {$p['id']} ({$p['slug']}) with description and image URL.\n";
    } else {
        $stmt = $pdo->prepare("UPDATE products SET description = ?, image_url = ? WHERE id = ?");
        $imageUrl = "https://shop.hedztech.com/uploads/products/" . $p['slug'] . ".jpg";
        $stmt->execute([$enhancedDesc, $imageUrl, $p['id']]);
        $updated++;
    }
}

echo "\nSummary: Updated: $updated, Skipped: $skipped. Dry Run: " . ($dryRun ? 'YES' : 'NO') . "\n";
?>
