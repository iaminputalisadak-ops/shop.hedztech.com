<?php
/**
 * Bulk AI image generation with job tracking, concurrency control, and preview/approval flow.
 *
 * POST /admin/products/bulk_generate.php
 *   Body: {
 *     "product_ids": [1, 2, 3],      // Required: product IDs to process
 *     "action": "generate|retry|approve|reject", // Default: generate
 *     "job_id": "job_xxx"            // Required for retry/approve/reject
 *   }
 *
 * For generate: creates job, processes with concurrency limit, saves to temp/
 * For retry: retries failed items in existing job
 * For approve: moves approved temp images to final location, updates products.image_url
 * For reject: deletes temp images for rejected items
 *
 * GET /admin/products/bulk_generate.php?action=status&job_id=xxx
 *   Returns job progress, results, errors
 */
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../cors.php';
require_once __DIR__ . '/../check_auth.php';
require_once __DIR__ . '/../../../../src/ImageProvider.php';

requireAdmin();

header('Content-Type: application/json; charset=utf-8');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? 'generate';

$pdo = getConnection();
$jobsDir = dirname(dirname(dirname(dirname(__DIR__)))) . '/jobs/';
$tempDir = dirname(dirname(dirname(dirname(__DIR__)))) . '/uploads/temp/';
$finalDir = dirname(dirname(dirname(dirname(__DIR__)))) . '/uploads/';

if (!is_dir($jobsDir)) mkdir($jobsDir, 0755, true);
if (!is_dir($tempDir)) mkdir($tempDir, 0755, true);
if (!is_dir($finalDir)) mkdir($finalDir, 0755, true);

// Load prompt templates
$promptTemplatesFile = dirname(dirname(dirname(dirname(__DIR__)))) . '/prompt_templates.json';
$promptTemplates = [];
if (file_exists($promptTemplatesFile)) {
    $promptTemplates = json_decode(file_get_contents($promptTemplatesFile), true) ?? [];
}

function buildPromptFromTemplates(array $product, array $promptTemplates): string {
    $name = $product['name'] ?? '';
    $cat = strtolower($product['category_name'] ?? '');
    $brand = $product['brand_name'] ?? '';
    $hay = strtolower($name . ' ' . $cat);
    
    $templateKey = 'default';
    if (strpos($hay, 'windows') !== false) {
        $templateKey = 'microsoft_os';
    } elseif (strpos($hay, 'office') !== false || strpos($hay, 'word') !== false || 
              strpos($hay, 'excel') !== false || strpos($hay, 'powerpoint') !== false) {
        $templateKey = 'microsoft_office';
    } elseif (strpos($hay, 'project') !== false || strpos($hay, 'visio') !== false || 
              strpos($hay, 'access') !== false) {
        $templateKey = 'microsoft_project_visio_access';
    } elseif (strpos($hay, 'antivirus') !== false || strpos($hay, 'security') !== false || 
              strpos($hay, 'kaspersky') !== false || strpos($hay, 'mcafee') !== false || 
              strpos($hay, 'quick heal') !== false) {
        $templateKey = 'antivirus_security';
    } elseif (strpos($hay, 'adobe') !== false || strpos($hay, 'photoshop') !== false || 
              strpos($hay, 'illustrator') !== false || strpos($hay, 'acrobat') !== false) {
        $templateKey = 'adobe_creative';
    } elseif (strpos($hay, 'canva') !== false) {
        $templateKey = 'ai_others';
    } elseif (strpos($hay, 'youtube') !== false || strpos($hay, 'drive') !== false || 
              strpos($hay, 'cloud') !== false || strpos($hay, 'spotify') !== false || 
              strpos($hay, 'netflix') !== false) {
        $templateKey = 'cloud_streaming';
    } elseif (strpos($hay, 'lumion') !== false || strpos($hay, 'autocad') !== false || 
              strpos($hay, 'architecture') !== false || strpos($hay, 'design') !== false) {
        $templateKey = 'design_architecture';
    } elseif (strpos($hay, 'vmware') !== false || strpos($hay, 'parallels') !== false || 
              strpos($hay, 'virtual') !== false) {
        $templateKey = 'virtualization';
    } elseif (strpos($hay, 'accounting') !== false || strpos($hay, 'quickbooks') !== false || 
              strpos($hay, 'sage') !== false) {
        $templateKey = 'accounting_software';
    } elseif (strpos($hay, 'bundle') !== false || substr_count($hay, '+') > 0) {
        $templateKey = 'bundle_keys';
    }
    
    if (isset($promptTemplates[$templateKey]) && is_array($promptTemplates[$templateKey])) {
        $promptParts = [];
        foreach ($promptTemplates[$templateKey] as $part) {
            $promptParts[] = str_replace(['{name}', '{brand}'], [$name, $brand], $part);
        }
        $prompt = implode(', ', $promptParts);
    } else {
        $prompt = "Professional product photography of {$name}, software license key card, digital technology product, clean minimal studio lighting, pristine white background, sharp focus, 8K resolution, commercial product shot style, no watermark";
        if (!empty($brand)) {
            $prompt .= ", featuring {$brand} branding";
        }
    }
    
    return $prompt;
}

function logJob(string $jobsDir, string $jobId, array $data): void {
    $jobFile = $jobsDir . $jobId . '.json';
    if (file_exists($jobFile)) {
        $job = json_decode(file_get_contents($jobFile), true) ?? [];
    } else {
        $job = ['id' => $jobId, 'created' => date('c'), 'items' => []];
    }
    $job['updated'] = date('c');
    $job = array_merge($job, $data);
    file_put_contents($jobFile, json_encode($job, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
}

function getJob(string $jobsDir, string $jobId): ?array {
    $jobFile = $jobsDir . $jobId . '.json';
    if (!file_exists($jobFile)) return null;
    return json_decode(file_get_contents($jobFile), true) ?? null;
}

function saveJobItem(string $jobsDir, string $jobId, array $item): void {
    $job = getJob($jobsDir, $jobId);
    if (!$job) return;
    $job['items'] = array_map(function($i) use ($item) {
        return $i['product_id'] === $item['product_id'] ? $item : $i;
    }, $job['items']);
    logJob($jobsDir, $jobId, ['items' => $job['items']]);
}

if ($method === 'GET' && $action === 'status') {
    $jobId = $_GET['job_id'] ?? '';
    if (!$jobId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'job_id required']);
        exit;
    }
    
    $job = getJob($jobsDir, $jobId);
    if (!$job) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Job not found']);
        exit;
    }
    
    // Calculate progress
    $total = count($job['items']);
    $completed = count(array_filter($job['items'], fn($i) => $i['status'] === 'completed'));
    $failed = count(array_filter($job['items'], fn($i) => $i['status'] === 'failed'));
    $pending = count(array_filter($job['items'], fn($i) => in_array($i['status'], ['pending', 'processing'])));
    $approved = count(array_filter($job['items'], fn($i) => $i['status'] === 'approved'));
    $rejected = count(array_filter($job['items'], fn($i) => $i['status'] === 'rejected'));
    
    echo json_encode([
        'success' => true,
        'job' => $job,
        'progress' => [
            'total' => $total,
            'completed' => $completed,
            'failed' => $failed,
            'pending' => $pending,
            'approved' => $approved,
            'rejected' => $rejected,
            'percent' => $total > 0 ? round(($completed + $failed + $approved + $rejected) / $total * 100) : 0,
        ],
    ]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'POST method required']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];
$productIds = $input['product_ids'] ?? [];
$jobId = $input['job_id'] ?? '';
$postAction = $input['action'] ?? 'generate';

if ($postAction === 'retry') {
    if (!$jobId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'job_id required for retry']);
        exit;
    }
    
    $job = getJob($jobsDir, $jobId);
    if (!$job) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Job not found']);
        exit;
    }
    
    // Reset failed items to pending
    $job['items'] = array_map(function($item) {
        if ($item['status'] === 'failed') {
            $item['status'] = 'pending';
            $item['error'] = null;
            $item['attempts'] = 0;
        }
        return $item;
    }, $job['items']);
    
    logJob($jobsDir, $jobId, ['items' => $job['items'], 'status' => 'processing']);
    
    echo json_encode(['success' => true, 'message' => 'Failed items queued for retry']);
    exit;
}

if ($postAction === 'approve' || $postAction === 'reject') {
    if (!$jobId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'job_id required']);
        exit;
    }
    
    $job = getJob($jobsDir, $jobId);
    if (!$job) {
        http_response_code(404);
        echo json_encode(['success' => false, 'message' => 'Job not found']);
        exit;
    }
    
    $itemIds = $input['item_ids'] ?? []; // Optional: specific items, otherwise all completed
    $scriptPath = $_SERVER['SCRIPT_NAME'] ?? '';
    $backendPath = str_replace('\\', '/', dirname(dirname(dirname(dirname($scriptPath)))));
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $baseUrl = $scheme . '://' . $host . rtrim($backendPath, '/');
    
    $updatedItems = [];
    foreach ($job['items'] as $item) {
        if ($itemIds && !in_array($item['product_id'], $itemIds)) {
            $updatedItems[] = $item;
            continue;
        }
        
        if ($item['status'] !== 'completed') {
            $updatedItems[] = $item;
            continue;
        }
        
        $tempPath = $tempDir . $item['temp_filename'];
        
        if ($postAction === 'approve' && file_exists($tempPath)) {
            // Move to final location
            $finalFilename = $item['temp_filename'];
            $finalPath = $finalDir . $finalFilename;
            
            if (rename($tempPath, $finalPath)) {
                // Update database
                $publicUrl = $baseUrl . '/uploads/' . $finalFilename;
                try {
                    $stmt = $pdo->prepare('UPDATE products SET image_url = ? WHERE id = ?');
                    $stmt->execute([$publicUrl, $item['product_id']]);
                } catch (Exception $e) {
                    // Log but continue
                }
                
                $item['status'] = 'approved';
                $item['final_filename'] = $finalFilename;
                $item['image_url'] = $publicUrl;
                $item['approved_at'] = date('c');
            } else {
                $item['status'] = 'failed';
                $item['error'] = 'Failed to move file to final location';
            }
        } elseif ($postAction === 'reject') {
            // Delete temp file
            if (file_exists($tempPath)) {
                unlink($tempPath);
            }
            $item['status'] = 'rejected';
            $item['rejected_at'] = date('c');
        }
        
        $updatedItems[] = $item;
    }
    
    logJob($jobsDir, $jobId, ['items' => $updatedItems]);
    
    echo json_encode(['success' => true, 'message' => ucfirst($postAction) . 'd selected items']);
    exit;
}

// Default: generate action
if (empty($productIds)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'product_ids array required']);
    exit;
}

// Fetch products
$placeholders = implode(',', array_fill(0, count($productIds), '?'));
$stmt = $pdo->prepare("
    SELECT p.id, p.name, p.slug, p.category_id, c.name AS category_name,
           p.short_description, p.image_url, p.brand_name
    FROM products p
    JOIN categories c ON c.id = p.category_id
    WHERE p.id IN ($placeholders)
");
$stmt->execute($productIds);
$products = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($products)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'message' => 'No products found']);
    exit;
}

// Create job
$jobId = 'job_' . date('YmdHis') . '_' . bin2hex(random_bytes(4));
$jobItems = [];

foreach ($products as $product) {
    // Skip if already has a valid non-placeholder image
    $imageUrl = $product['image_url'] ?? '';
    if ($imageUrl && 
        strpos($imageUrl, 'cover.php') === false && 
        strpos($imageUrl, 'windows-10-enterprise-ltsc-2021.png') === false &&
        strpos($imageUrl, '/uploads/img_') === false) {
        $jobItems[] = [
            'product_id' => $product['id'],
            'name' => $product['name'],
            'slug' => $product['slug'],
            'status' => 'skipped',
            'reason' => 'Already has valid custom image',
        ];
        continue;
    }
    
    $prompt = buildPromptFromTemplates($product, $promptTemplates);
    $jobItems[] = [
        'product_id' => $product['id'],
        'name' => $product['name'],
        'slug' => $product['slug'],
        'prompt' => $prompt,
        'status' => 'pending',
        'attempts' => 0,
        'max_attempts' => 3,
    ];
}

$jobData = [
    'id' => $jobId,
    'created' => date('c'),
    'status' => 'processing',
    'concurrency' => 2,
    'items' => $jobItems,
];
logJob($jobsDir, $jobId, $jobData);

// Return job ID immediately, processing happens via background
echo json_encode([
    'success' => true,
    'job_id' => $jobId,
    'message' => 'Job created. Poll status endpoint for progress.',
    'total_items' => count($jobItems),
]);