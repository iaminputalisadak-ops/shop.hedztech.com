<?php
/**
 * Bulk scan endpoint for detecting products with missing/broken images.
 *
 * POST /admin/products/bulk_scan.php
 *   Body: {"category_id": 123} (optional filter)
 *
 * Response:
 * {
 *   "success": true,
 *   "scan_id": "unique_scan_id",
 *   "results": {
 *     "total": 100,
 *     "missing_image_url": 10,
 *     "empty_image_url": 5,
 *     "broken_cover_php": 15,
 *     "inaccessible": 3,
 *     "valid": 67
 *   },
 *   "products": [...]
 * }
 */
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../cors.php';
require_once __DIR__ . '/../check_auth.php';

requireAdmin();

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'POST method required']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$categoryId = isset($input['category_id']) ? (int)$input['category_id'] : null;

$pdo = getConnection();

$where = 'WHERE p.is_active = 1';
$params = [];
if ($categoryId) {
    $where .= ' AND p.category_id = ?';
    $params[] = $categoryId;
}

$stmt = $pdo->prepare("
    SELECT p.id, p.name, p.slug, p.image_url, p.category_id, c.name AS category_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    $where
    ORDER BY p.category_id, p.name
");
$stmt->execute($params);
$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

$results = [
    'total' => count($products),
    'missing_image_url' => 0,
    'empty_image_url' => 0,
    'broken_cover_php' => 0,
    'inaccessible' => 0,
    'valid' => 0,
];

$productsWithIssues = [];

foreach ($products as $product) {
    $imageUrl = $product['image_url'] ?? '';
    $issue = null;
    $issueDetails = [];

    if (!$imageUrl || trim($imageUrl) === '') {
        $issue = 'missing_image_url';
        $results['missing_image_url']++;
    } elseif (strpos($imageUrl, 'cover.php') !== false) {
        $issue = 'broken_cover_php';
        $results['broken_cover_php']++;
    } elseif (strpos($imageUrl, 'windows-10-enterprise-ltsc-2021.png') !== false) {
        $issue = 'placeholder_image';
        $results['broken_cover_php']++;
    } else {
        // Check if file exists locally (for uploads/ images)
        $isLocal = strpos($imageUrl, '/uploads/') !== false;
        if ($isLocal) {
            $scriptPath = $_SERVER['SCRIPT_NAME'] ?? '';
            $backendPath = str_replace('\\', '/', dirname(dirname(dirname(dirname($scriptPath)))));
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
            $baseUrl = $scheme . '://' . $host . rtrim($backendPath, '/');
            
            // Extract path after base URL
            $relativePath = str_replace($baseUrl, '', $imageUrl);
            $localPath = dirname(dirname(dirname(__DIR__))) . $relativePath;
            
            if (!file_exists($localPath)) {
                $issue = 'inaccessible';
                $issueDetails[] = 'Local file not found: ' . $localPath;
                $results['inaccessible']++;
            }
        }
        
        // Also do a quick HTTP HEAD check for external URLs
        if (!$issue) {
            $ch = curl_init($imageUrl);
            curl_setopt_array($ch, [
                CURLOPT_NOBODY => true,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_TIMEOUT => 5,
                CURLOPT_CONNECTTIMEOUT => 3,
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            
            if ($httpCode >= 400 || $httpCode === 0) {
                $issue = 'inaccessible';
                $issueDetails[] = 'HTTP ' . $httpCode;
                $results['inaccessible']++;
            }
        }
    }

    if ($issue) {
        $results['empty_image_url']++;
        $productsWithIssues[] = array_merge($product, [
            'issue' => $issue,
            'issue_details' => $issueDetails,
        ]);
    } else {
        $results['valid']++;
    }
}

// Save scan results for reference
$scanId = 'scan_' . date('YmdHis') . '_' . bin2hex(random_bytes(4));
$scanData = [
    'scan_id' => $scanId,
    'timestamp' => date('c'),
    'category_id' => $categoryId,
    'results' => $results,
    'products' => $productsWithIssues,
];
file_put_contents(dirname(dirname(dirname(__DIR__))) . "/jobs/{$scanId}.json", json_encode($scanData, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

echo json_encode([
    'success' => true,
    'scan_id' => $scanId,
    'results' => $results,
    'products' => $productsWithIssues,
]);