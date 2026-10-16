<?php
require_once __DIR__ . '/../../../config/database.php';
require_once __DIR__ . '/../../cors.php';
require_once __DIR__ . '/../check_auth.php';

requireAdmin();

$pdo = getConnection();
$action = $_GET['action'] ?? 'stats';

if ($action === 'stats') {
    $totalProducts = (int) $pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();
    $totalOrders = (int) $pdo->query('SELECT COUNT(*) FROM orders')->fetchColumn();
    $pendingOrders = (int) $pdo->query('SELECT COUNT(*) FROM orders WHERE status IN ("pending","paid")')->fetchColumn();
    $completedOrders = (int) $pdo->query('SELECT COUNT(*) FROM orders WHERE status IN ("delivered")')->fetchColumn();
    $totalCustomers = (int) $pdo->query('SELECT COUNT(*) FROM customers')->fetchColumn();
    $totalSales = (float) $pdo->query('SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status != "cancelled"')->fetchColumn();
    $lowStock = (int) $pdo->query('SELECT COUNT(*) FROM product_variants WHERE stock > 0 AND stock <= 5')->fetchColumn();
    $outOfStock = (int) $pdo->query('SELECT COUNT(*) FROM product_variants WHERE stock = 0')->fetchColumn();

    echo json_encode([
        'success' => true,
        'data' => [
            'total_products' => $totalProducts,
            'total_orders' => $totalOrders,
            'pending_orders' => $pendingOrders,
            'completed_orders' => $completedOrders,
            'total_customers' => $totalCustomers,
            'total_sales' => $totalSales,
            'low_stock' => $lowStock,
            'out_of_stock' => $outOfStock,
        ]
    ]);
    exit;
}

if ($action === 'recent_orders') {
    $stmt = $pdo->query('SELECT id, order_number, customer_name, total_amount, status, payment_status, created_at FROM orders ORDER BY id DESC LIMIT 10');
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'data' => $rows]);
    exit;
}

if ($action === 'recent_customers') {
    $stmt = $pdo->query('SELECT id, name, email, phone, total_orders, total_spent, created_at FROM customers ORDER BY id DESC LIMIT 10');
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'data' => $rows]);
    exit;
}

if ($action === 'sales_chart') {
    $days = isset($_GET['days']) ? min(90, max(1, (int) $_GET['days'])) : 30;
    $stmt = $pdo->prepare('SELECT DATE(created_at) as date, SUM(total_amount) as total FROM orders WHERE status != "cancelled" AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) GROUP BY DATE(created_at) ORDER BY date ASC');
    $stmt->execute([$days]);
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'data' => $rows]);
    exit;
}

// Admin audit log endpoint - paginated audit entries
if ($action === 'audit') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = 20;
    $offset = ($page - 1) * $limit;
    $stmt = $pdo->prepare(
        'SELECT a.id, a.admin_id, u.username, a.action, a.target_id, a.details, a.created_at
         FROM admin_audit a
         JOIN admin_users u ON a.admin_id = u.id
         ORDER BY a.created_at DESC
         LIMIT :limit OFFSET :offset'
    );
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'data' => $rows, 'page' => $page]);
    exit;
}

// Admin settings get/set
if ($action === 'settings') {
    $key = $_GET['key'] ?? null;
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if (!$key) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing key']);
            exit;
        }
        $stmt = $pdo->prepare('SELECT `value` FROM admin_settings WHERE `key` = ?');
        $stmt->execute([$key]);
        $val = $stmt->fetchColumn();
        echo json_encode(['success' => true, 'data' => ['key' => $key, 'value' => $val]]);
        exit;
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $payload = json_decode(file_get_contents('php://input'), true);
        $value = $payload['value'] ?? null;
        if (!$key || $value === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Missing key or value']);
            exit;
        }
        $stmt = $pdo->prepare('INSERT INTO admin_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');
        $stmt->execute([$key, $value]);
        echo json_encode(['success' => true]);
        exit;
    }
}

// Admin notifications list
if ($action === 'notifications') {
    $stmt = $pdo->query('SELECT id, `type`, message, is_read, created_at FROM admin_notifications ORDER BY created_at DESC');
    $rows = $stmt->fetchAll();
    echo json_encode(['success' => true, 'data' => $rows]);
    exit;
}

// Mark notification as read
if ($action === 'mark_notification') {
    $payload = json_decode(file_get_contents('php://input'), true);
    $id = $payload['id'] ?? null;
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'message' => 'Missing id']);
        exit;
    }
    $stmt = $pdo->prepare('UPDATE admin_notifications SET is_read = 1 WHERE id = ?');
    $stmt->execute([$id]);
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(400);
echo json_encode(['success' => false, 'message' => 'Invalid action']);
