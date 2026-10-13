<?php
/**
 * Admin: Bulk AI image generation helper endpoints.
 *
 * GET  /admin/ai-images/index.php?action=products_needing_images
 *   Returns all active products with their current image_url so the
 *   admin panel can show which ones still use the placeholder/cover.php.
 *
 * GET  /admin/ai-images/index.php?action=status
 *   Returns a summary count of products by image coverage.
 *
 * GET  /admin/ai-images/index.php?action=prompt&id=123
 *   Returns a ready-to-use DALL-E prompt for a single product.
 *
 * POST /admin/ai-images/index.php?action=generate&id=123
 *   Calls OpenAI DALL-E 3 to generate a single product image, saves it
 *   to uploads/, and updates products.image_url. Requires OPENAI_API_KEY
 *   in the environment or admin config.
 *
 * PUT  /admin/ai-images/index.php?action=update_image&id=123
 *   Body: {"image_url": "https://..."} — sets image_url for a single product.
 */
require_once __DIR__ . '/../../config/database.php';
require_once __DIR__ . '/../../cors.php';
require_once __DIR__ . '/../check_auth.php';

requireAdmin();

header('Content-Type: application/json; charset=utf-8');

/**
 * Build a DALL-E prompt from product name, brand, and category template.
 */
function makePrompt(string $name, string $brand = '', string $template = 'default'): string {
    $templates = [
        'windows' => "Professional product photography of {$name}, digital software license key for Windows operating system, clean minimal studio lighting, pristine white background, Microsoft Windows branding elements, blue color scheme, sharp focus, 8K resolution, commercial product shot style, no watermark, no text overlay",
        'office' => "Professional product photography of {$name}, Microsoft Office suite packaging, overhead shot of Office applications on a computer monitor, clean office desk with laptop, Microsoft blue and white color palette, sharp focus, 8K resolution, commercial product shot, no watermark",
        'antivirus' => "Professional product photography of {$name}, cybersecurity software interface, digital protection theme, shield and circuit board motifs, green and blue tech colors, glowing digital security visualization, sharp focus, 8K resolution, commercial product shot, no watermark",
        'adobe' => "Professional product photography of {$name}, Adobe Creative Cloud software on computer monitor, creative workspace with Photoshop and Illustrator interface, Adobe magenta and purple color palette, sharp focus, 8K resolution, commercial product shot, no watermark",
        'canva' => "Professional product photography of {$name}, Canva design tool interface on tablet and desktop, vibrant creative design elements, Canva teal and blue color scheme, sharp focus, 8K resolution, commercial product shot, no watermark",
        'cloud-streaming' => "Professional product photography of {$name}, subscription service interface, modern app UI, smartphone and laptop showing streaming or Cloud app, clean modern background, soft gradient lighting, sharp focus, 8K resolution, commercial product shot, no watermark",
        'project-visio' => "Professional product photography of {$name}, project management or diagramming software interface, business planning on computer screen, professional office environment, clean lighting, sharp focus, 8K resolution, commercial product shot, no watermark",
        'lumion' => "Professional product photography of {$name}, architectural rendering software, 3D building visualization on large monitor, clean studio background, professional lighting, sharp focus, 8K resolution, commercial product shot, no watermark",
        'default' => "Professional product photography of {$name}, software license key card, digital technology product, clean minimal studio lighting, pristine white background, sharp focus, 8K resolution, commercial product shot style, no watermark",
    ];

    $prompt = $templates[$template] ?? $templates['default'];
    if (!empty($brand)) {
        $prompt .= ", featuring {$brand} branding";
    }
    return $prompt;
}

$action = $_GET['action'] ?? 'products_needing_images';

$pdo = getConnection();

switch ($action) {
    case 'products_needing_images':
        $stmt = $pdo->query("
            SELECT p.id, p.name, p.slug, p.category_id, c.name AS category_name,
                   p.short_description, p.image_url, p.brand_name,
                   p.price_min, p.price_max
            FROM products p
            JOIN categories c ON c.id = p.category_id
            WHERE p.is_active = 1
            ORDER BY p.category_id, p.name
        ");
        $products = $stmt->fetchAll();

        // Flag products that are still using the generic placeholder
        $needsImage = [];
        $hasImage = [];
        foreach ($products as $p) {
            $isCover = (strpos($p['image_url'] ?? '', 'cover.php') !== false)
                    || (strpos($p['image_url'] ?? '', 'windows-10-enterprise-ltsc-2021.png') !== false)
                    || strpos($p['image_url'] ?? '', '/uploads/img_') === false;
            if ($isCover) {
                $needsImage[] = $p;
            } else {
                $hasImage[] = $p;
            }
        }

        echo json_encode([
            'success' => true,
            'total' => count($products),
            'needing_images' => count($needsImage),
            'with_images' => count($hasImage),
            'products' => $products,
        ]);
        break;

    case 'status':
        $stmt = $pdo->query("
            SELECT COUNT(*) FROM products WHERE is_active = 1
        ");
        $total = $stmt->fetchColumn();

        echo json_encode([
            'success' => true,
            'total_active_products' => (int) $total,
            'message' => 'Run scripts/ai_images.py from the command line to generate and upload images.',
            'cli_command' => 'python scripts/ai_images.py all',
        ]);
        break;

    case 'prompt':
        $id = (int) ($_GET['id'] ?? 0);
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Product ID required']);
            exit;
        }
        $stmt = $pdo->prepare("
            SELECT p.name, p.slug, p.category_id, c.name AS category_name,
                   p.short_description, p.brand_name
            FROM products p
            JOIN categories c ON c.id = p.category_id
            WHERE p.id = ?
        ");
        $stmt->execute([$id]);
        $product = $stmt->fetch();
        if (!$product) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Product not found']);
            exit;
        }

        // Categorize product for prompt template
        $name = $product['name'];
        $cat = strtolower($product['category_name']);
        $hay = strtolower($name . ' ' . $cat);

        if (strpos($hay, 'windows') !== false) $template = 'windows';
        elseif (strpos($hay, 'office') !== false || strpos($hay, 'word') !== false || strpos($hay, 'excel') !== false || strpos($hay, 'powerpoint') !== false) $template = 'office';
        elseif (strpos($hay, 'antivirus') !== false || strpos($hay, 'security') !== false || strpos($hay, 'kaspersky') !== false || strpos($hay, 'mcafee') !== false || strpos($hay, 'quick heal') !== false) $template = 'antivirus';
        elseif (strpos($hay, 'adobe') !== false || strpos($hay, 'photoshop') !== false) $template = 'adobe';
        elseif (strpos($hay, 'canva') !== false) $template = 'canva';
        elseif (strpos($hay, 'youtube') !== false || strpos($hay, 'drive') !== false || strpos($hay, 'cloud') !== false) $template = 'cloud-streaming';
        elseif (strpos($hay, 'project') !== false || strpos($hay, 'visio') !== false) $template = 'project-visio';
        elseif (strpos($hay, 'lumion') !== false) $template = 'lumion';
        else $template = 'default';

        $prompt = makePrompt($name, $product['brand_name'] ?? '', $template);
        if (!empty($product['brand_name'])) {
            $prompt .= ", featuring {$product['brand_name']} branding";
        }

        echo json_encode([
            'success' => true,
            'product' => $product,
            'template' => $template,
            'prompt' => $prompt,
        ]);
        break;

    case 'generate':
        // POST with product ID — calls OpenAI DALL-E 3 and saves the result
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            http_response_code(405);
            echo json_encode(['success' => false, 'message' => 'POST method required']);
            exit;
        }

        $id = (int) ($_GET['id'] ?? $_POST['id'] ?? 0);
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Product ID required']);
            exit;
        }

        $apiKey = getenv('OPENAI_API_KEY') ?: getenv('OPENAI_KEY');
        if (!$apiKey) {
            http_response_code(500);
            echo json_encode(['success' => false, 'message' => 'OPENAI_API_KEY not configured on server']);
            exit;
        }

        // Fetch product data
        $stmt = $pdo->prepare("
            SELECT p.id, p.name, p.slug, c.name AS category_name, p.short_description, p.brand_name
            FROM products p
            JOIN categories c ON c.id = p.category_id
            WHERE p.id = ?
        ");
        $stmt->execute([$id]);
        $product = $stmt->fetch();

        if (!$product) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Product not found']);
            exit;
        }

        // Build prompt (same template logic as the 'prompt' action)
        $name = $product['name'];
        $cat = strtolower($product['category_name']);
        $hay = strtolower($name . ' ' . $cat);

        if (strpos($hay, 'windows') !== false) $template = 'windows';
        elseif (strpos($hay, 'office') !== false || strpos($hay, 'word') !== false || strpos($hay, 'excel') !== false || strpos($hay, 'powerpoint') !== false) $template = 'office';
        elseif (strpos($hay, 'antivirus') !== false || strpos($hay, 'security') !== false || strpos($hay, 'kaspersky') !== false || strpos($hay, 'mcafee') !== false || strpos($hay, 'quick heal') !== false) $template = 'antivirus';
        elseif (strpos($hay, 'adobe') !== false || strpos($hay, 'photoshop') !== false) $template = 'adobe';
        elseif (strpos($hay, 'canva') !== false) $template = 'canva';
        elseif (strpos($hay, 'youtube') !== false || strpos($hay, 'drive') !== false || strpos($hay, 'cloud') !== false) $template = 'cloud-streaming';
        elseif (strpos($hay, 'project') !== false || strpos($hay, 'visio') !== false) $template = 'project-visio';
        elseif (strpos($hay, 'lumion') !== false) $template = 'lumion';
        else $template = 'default';

        $prompt = makePrompt($name, $product['brand_name'] ?? '', $template);

        // Call OpenAI DALL-E 3
        $ch = curl_init('https://api.openai.com/v1/images/generations');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => [
                'Authorization: Bearer ' . $apiKey,
                'Content-Type: application/json',
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'model' => 'dall-e-3',
                'prompt' => $prompt,
                'n' => 1,
                'size' => '1024x1024',
                'response_format' => 'url',
                'style' => 'natural',
            ]),
            CURLOPT_TIMEOUT => 120,
        ]);

        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            http_response_code(502);
            echo json_encode([
                'success' => false,
                'message' => 'DALL-E API error (HTTP ' . $httpCode . ')',
                'response' => $resp ? substr($resp, 0, 500) : null,
            ]);
            exit;
        }

        $result = json_decode($resp, true);
        if (empty($result['data'][0]['url'])) {
            http_response_code(502);
            echo json_encode(['success' => false, 'message' => 'DALL-E returned no image URL']);
            exit;
        }

        $imageUrl = $result['data'][0]['url'];

        // Download the generated image
        $imgData = @file_get_contents($imageUrl);
        if ($imgData === false) {
            http_response_code(502);
            echo json_encode(['success' => false, 'message' => 'Failed to download generated image']);
            exit;
        }

        // Save to uploads/ with product slug as filename
        $uploadDir = dirname(dirname(dirname(__DIR__))) . '/uploads/';
        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0755, true);
        }

        $filename = $product['slug'] . '.png';
        $path = $uploadDir . $filename;
        file_put_contents($path, $imgData);

        // Build public URL
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $backendPath = str_replace('\\', '/', dirname(dirname(dirname(dirname($_SERVER['SCRIPT_NAME'])))));
        $publicUrl = $scheme . '://' . $host . rtrim($backendPath, '/') . '/uploads/' . $filename;

        // Update product image_url
        $pdo->prepare('UPDATE products SET image_url = ? WHERE id = ?')->execute([$publicUrl, $id]);

        echo json_encode([
            'success' => true,
            'message' => 'Image generated and applied successfully.',
            'image_url' => $publicUrl,
            'filename' => $filename,
            'prompt' => $prompt,
        ]);
        break;

    case 'update_image':
        // PUT with body {"image_url": "https://..."}
        $id = (int) ($_GET['id'] ?? 0);
        if (!$id) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Product ID required']);
            exit;
        }

        $input = json_decode(file_get_contents('php://input'), true) ?? [];
        $imageUrl = trim($input['image_url'] ?? '');

        if (!$imageUrl) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'image_url required']);
            exit;
        }

        $stmt = $pdo->prepare('UPDATE products SET image_url = ? WHERE id = ?');
        $stmt->execute([$imageUrl, $id]);

        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Product not found or unchanged']);
            exit;
        }

        echo json_encode(['success' => true, 'message' => 'Product image updated.', 'image_url' => $imageUrl]);
        break;

    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Unknown action']);
        break;
}
