<?php
/**
 * Secure AI image generation endpoint (server-side only)
 * 
 * POST /admin/ai-images/generate.php
 * - Requires authentication and admin access
 * - Reads OPENAI_API_KEY from environment
 * - Generates image using OpenAI DALL-E 3
 * - Downloads, validates (mime/type, dimensions, size), saves to uploads/
 * - Updates products.image_url
 * - Logs operations with retry logic
 */

declare(strict_types=1);

require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../cors.php';
require_once __DIR__ . '/../check_auth.php';
require_once __DIR__ . '/../../../../src/ImageProvider.php';

requireAdmin();

header('Content-Type: application/json; charset=utf-8');

// Only allow POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'success' => false,
        'message' => 'POST method required'
    ]);
    exit;
}

// Get input (product_id or slug)
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$productId = isset($input['product_id']) ? (int)$input['product_id'] : (isset($_POST['product_id']) ? (int)$_POST['product_id'] : 0);
$productSlug = trim($input['slug'] ?? $_POST['slug'] ?? '');

// Validate input
if ($productId <= 0 && empty($productSlug)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'product_id or slug is required'
    ]);
    exit;
}

// Read API key from environment (server-side only)
$apiKey = getenv('OPENAI_API_KEY');
if (!$apiKey) {
    $apiKey = $_ENV['OPENAI_API_KEY'] ?? null;
}
if (!$apiKey) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'OPENAI_API_KEY not configured on server'
    ]);
    exit;
}

$pdo = getConnection();

// Fetch product details
$stmt = null;
$product = null;
if ($productId > 0) {
    $stmt = $pdo->prepare("
        SELECT p.id, p.name, p.slug, c.name AS category_name, p.short_description, 
               p.brand_name, p.image_url
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.id = ?
    ");
    $stmt->execute([$productId]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);
} else {
    $stmt = $pdo->prepare("
        SELECT p.id, p.name, p.slug, c.name AS category_name, p.short_description, 
               p.brand_name, p.image_url
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.slug = ?
    ");
    $stmt->execute([$productSlug]);
    $product = $stmt->fetch(PDO::FETCH_ASSOC);
}

if (!$product) {
    http_response_code(404);
    echo json_encode([
        'success' => false,
        'message' => 'Product not found'
    ]);
    exit;
}

// Load prompt templates
$promptTemplatesFile = dirname(dirname(dirname(dirname(__DIR__)))) . '/prompt_templates.json';
$promptTemplates = [];
if (file_exists($promptTemplatesFile)) {
    $templatesContent = file_get_contents($promptTemplatesFile);
    $promptTemplates = json_decode($templatesContent, true) ?? [];
}

// Build prompt from templates
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
    
    // Use templates from JSON if available
    if (isset($promptTemplates[$templateKey]) && is_array($promptTemplates[$templateKey])) {
        $promptParts = [];
        foreach ($promptTemplates[$templateKey] as $part) {
            $promptParts[] = str_replace(['{name}', '{brand}'], [$name, $brand], $part);
        }
        $prompt = implode(', ', $promptParts);
    } else {
        // Fallback to default
        $prompt = "Professional product photography of {$name}, software license key card, digital technology product, clean minimal studio lighting, pristine white background, sharp focus, 8K resolution, commercial product shot style, no watermark";
        if (!empty($brand)) {
            $prompt .= ", featuring {$brand} branding";
        }
    }
    
    return $prompt;
}

$prompt = buildPromptFromTemplates($product, $promptTemplates);

// Log function
function logGeneration(string $logFile, array $data): void {
    $logEntry = json_encode(array_merge($data, ['timestamp' => date('c')]), JSON_UNESCAPED_SLASHES) . PHP_EOL;
    file_put_contents($logFile, $logEntry, FILE_APPEND);
}

$logFile = dirname(dirname(dirname(__DIR__))) . '/logs/ai-image-generation.log';

// Try to generate image with retry logic (up to 3 times)
$maxRetries = 3;
$imageUrlFromProvider = null;
$lastError = null;
$model = 'dall-e-3';
$provider = 'openai';

for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
    try {
        $providerInstance = new OpenAIProvider($apiKey);
        $imageUrlFromProvider = $providerInstance->generate($prompt);
        $lastError = null;
        break;
    } catch (ProviderException $e) {
        $lastError = $e->getMessage();
        logGeneration($logFile, [
            'product_id' => $product['id'],
            'slug' => $product['slug'],
            'prompt' => substr($prompt, 0, 200),
            'model' => $model,
            'provider' => $provider,
            'status' => 'retry',
            'attempt' => $attempt,
            'error' => $lastError
        ]);
        if ($attempt < $maxRetries) {
            sleep(2 * $attempt); // Exponential backoff
        }
    } catch (Exception $e) {
        $lastError = $e->getMessage();
        logGeneration($logFile, [
            'product_id' => $product['id'],
            'slug' => $product['slug'],
            'prompt' => substr($prompt, 0, 200),
            'model' => $model,
            'provider' => $provider,
            'status' => 'error',
            'attempt' => $attempt,
            'error' => $lastError
        ]);
        break;
    }
}

if ($imageUrlFromProvider === null) {
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to generate image after ' . $maxRetries . ' attempts',
        'error' => $lastError
    ]);
    exit;
}

// Download and validate image
$imgData = @file_get_contents($imageUrlFromProvider);
if ($imgData === false) {
    logGeneration($logFile, [
        'product_id' => $product['id'],
        'slug' => $product['slug'],
        'prompt' => substr($prompt, 0, 200),
        'model' => $model,
        'provider' => $provider,
        'status' => 'error',
        'error' => 'Failed to download generated image'
    ]);
    http_response_code(502);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to download generated image'
    ]);
    exit;
}

// Validate image size (max 5MB)
$maxSize = 5 * 1024 * 1024; // 5MB
if (strlen($imgData) > $maxSize) {
    logGeneration($logFile, [
        'product_id' => $product['id'],
        'slug' => $product['slug'],
        'prompt' => substr($prompt, 0, 200),
        'model' => $model,
        'provider' => $provider,
        'status' => 'error',
        'error' => 'Image size exceeds 5MB: ' . strlen($imgData)
    ]);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Image size exceeds 5MB'
    ]);
    exit;
}

// Validate image - get image info
$imageInfo = @getimagesizefromstring($imgData);
if ($imageInfo === false) {
    logGeneration($logFile, [
        'product_id' => $product['id'],
        'slug' => $product['slug'],
        'prompt' => substr($prompt, 0, 200),
        'model' => $model,
        'provider' => $provider,
        'status' => 'error',
        'error' => 'Invalid image data'
    ]);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid image data'
    ]);
    exit;
}

$width = $imageInfo[0];
$height = $imageInfo[1];
$mimeType = $imageInfo['mime'];

// Validate dimensions (>= 512)
if ($width < 512 || $height < 512) {
    logGeneration($logFile, [
        'product_id' => $product['id'],
        'slug' => $product['slug'],
        'prompt' => substr($prompt, 0, 200),
        'model' => $model,
        'provider' => $provider,
        'status' => 'error',
        'error' => 'Image dimensions too small: ' . $width . 'x' . $height
    ]);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Image dimensions must be >= 512x512. Got: ' . $width . 'x' . $height
    ]);
    exit;
}

// Validate mime type (jpg/png/webp)
$allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
if (!in_array(strtolower($mimeType), $allowedMimes)) {
    logGeneration($logFile, [
        'product_id' => $product['id'],
        'slug' => $product['slug'],
        'prompt' => substr($prompt, 0, 200),
        'model' => $model,
        'provider' => $provider,
        'status' => 'error',
        'error' => 'Invalid mime type: ' . $mimeType
    ]);
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'message' => 'Invalid image type. Allowed: jpg, png, webp'
    ]);
    exit;
}

// Save to uploads/ with unique name (slug + timestamp + uuid)
$uploadDir = dirname(dirname(dirname(__DIR__))) . '/uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$uuid = bin2hex(random_bytes(4));
$timestamp = date('YmdHis');
$slug = preg_replace('/[^a-z0-9-]/', '-', strtolower($product['slug'] ?? $product['id']));
$filename = $slug . '_' . $timestamp . '_' . $uuid . '.webp';

// Try to convert to WebP if possible (optional but preferred)
$saveSuccess = false;
if (function_exists('imagewebp')) {
    try {
        $image = null;
        switch ($mimeType) {
            case 'image/png':
                $image = imagecreatefrompng($imgData);
                if ($image !== false) {
                    imagesavealpha($image, true);
                }
                break;
            case 'image/jpeg':
            case 'image/jpg':
                $image = imagecreatefromjpeg($imgData);
                break;
            case 'image/webp':
                $image = imagecreatefromwebp($imgData);
                break;
            default:
                $image = false;
        }
        if ($image !== false) {
            $savePath = $uploadDir . $filename;
            if (imagewebp($image, $savePath, 85)) {
                imagedestroy($image);
                $saveSuccess = true;
            }
        }
    } catch (Exception $e) {
        // Fall back to saving as-is
    }
}

// If WebP conversion failed, save original format
if (!$saveSuccess) {
    // Determine original extension
    $ext = 'png';
    if ($mimeType === 'image/jpeg' || $mimeType === 'image/jpg') {
        $ext = 'jpg';
    } elseif ($mimeType === 'image/webp') {
        $ext = 'webp';
    }
    $filename = $slug . '_' . $timestamp . '_' . $uuid . '.' . $ext;
    $savePath = $uploadDir . $filename;
    if (file_put_contents($savePath, $imgData) !== false) {
        $saveSuccess = true;
    }
}

if (!$saveSuccess) {
    logGeneration($logFile, [
        'product_id' => $product['id'],
        'slug' => $product['slug'],
        'prompt' => substr($prompt, 0, 200),
        'model' => $model,
        'provider' => $provider,
        'status' => 'error',
        'error' => 'Failed to save image to disk'
    ]);
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Failed to save image'
    ]);
    exit;
}

// Build public URL
$savePath = $uploadDir . $filename;
$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? 'localhost';
$scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
$backendPath = dirname(dirname(dirname(dirname($scriptName))));
$backendPath = str_replace('\\', '/', $backendPath);
$publicUrl = $scheme . '://' . $host . rtrim($backendPath, '/') . '/uploads/' . $filename;

// Update products.image_url
try {
    $updateStmt = $pdo->prepare('UPDATE products SET image_url = ? WHERE id = ?');
    $updateStmt->execute([$publicUrl, $product['id']]);
} catch (Exception $e) {
    logGeneration($logFile, [
        'product_id' => $product['id'],
        'slug' => $product['slug'],
        'prompt' => substr($prompt, 0, 200),
        'model' => $model,
        'provider' => $provider,
        'status' => 'error',
        'error' => 'Failed to update database: ' . $e->getMessage()
    ]);
    // Still return success if image was saved
}

// Log success
logGeneration($logFile, [
    'product_id' => $product['id'],
    'slug' => $product['slug'],
    'prompt' => substr($prompt, 0, 200),
    'model' => $model,
    'provider' => $provider,
    'status' => 'success',
    'image_url' => $publicUrl,
    'filename' => $filename,
    'dimensions' => $width . 'x' . $height,
    'size_bytes' => strlen($imgData),
    'mime_type' => $mimeType
]);

// Return response
echo json_encode([
    'success' => true,
    'image_url' => $publicUrl,
    'filename' => $filename,
    'product_id' => $product['id']
]);
