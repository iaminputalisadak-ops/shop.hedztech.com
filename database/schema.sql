-- Nepal TechGuard E-commerce Database
-- Run this in MySQL to create database and tables

CREATE DATABASE IF NOT EXISTS nepal_techguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE nepal_techguard;

-- Admin users
CREATE TABLE IF NOT EXISTS admin_users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Categories (Windows, MS Office, Antivirus, etc.)
CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    image_url VARCHAR(500),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id INT UNSIGNED NOT NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    short_description TEXT,
    description TEXT,
    image_url VARCHAR(500),
    price_min DECIMAL(10,2) DEFAULT 0,
    price_max DECIMAL(10,2) DEFAULT 0,
    original_price DECIMAL(10,2) NULL,
    discount_percent INT UNSIGNED DEFAULT 0,
    rating DECIMAL(2,1) DEFAULT 0,
    review_count INT UNSIGNED DEFAULT 0,
    brand_name VARCHAR(100) NULL,
    region VARCHAR(50) DEFAULT 'Nepal',
    sold_count INT UNSIGNED DEFAULT 0,
    availability VARCHAR(50) DEFAULT 'In Stock',
    version_info VARCHAR(50) DEFAULT 'Latest',
    is_featured TINYINT(1) DEFAULT 0,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    INDEX idx_category (category_id),
    INDEX idx_slug (slug),
    INDEX idx_featured (is_featured),
    INDEX idx_active (is_active)
);

-- Product variants (e.g. 1 Year, 3 Years, different editions)
CREATE TABLE IF NOT EXISTS product_variants (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id INT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2) NULL,
    stock INT UNSIGNED DEFAULT 0,
    sku VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product (product_id)
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(50) NOT NULL UNIQUE,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(30),
    total_amount DECIMAL(10,2) NOT NULL,
    status ENUM('pending','paid','processing','delivered','cancelled') DEFAULT 'pending',
    payment_method VARCHAR(40) NULL,
    payment_status ENUM('unpaid','pending','paid','failed') NOT NULL DEFAULT 'unpaid',
    payment_reference VARCHAR(120) NULL,
    payment_proof_url VARCHAR(500) NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_order_number (order_number),
    INDEX idx_status (status),
    INDEX idx_created (created_at)
);

-- Order items
CREATE TABLE IF NOT EXISTS order_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    variant_id INT UNSIGNED NULL,
    product_name VARCHAR(255) NOT NULL,
    variant_name VARCHAR(150),
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    INDEX idx_order (order_id)
);

-- Default admin: username=admin, password=password - CHANGE IN PRODUCTION
INSERT INTO admin_users (username, email, password_hash, name) VALUES
('admin', 'admin@nepaltechguard.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Admin')
ON DUPLICATE KEY UPDATE username = COALESCE(username, 'admin');

-- Sample categories
INSERT INTO categories (id, name, slug, description, sort_order) VALUES
(1, 'Windows', 'windows', 'Windows 7, 8.1, 10 & 11 Pro, Home Retail and OEM', 1),
(2, 'MS Office', 'ms-office', 'Office 2016, 2019, 2021, 2024 Professional Plus', 2),
(3, 'Antivirus', 'antivirus', 'Quick Heal, Kaspersky, K7, McAfee and more', 3),
(4, 'Design & Editing', 'design-editing', 'Adobe Creative Cloud, Canva Pro', 4)
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Sample products (so homepage displays products right after setup)
INSERT INTO products (id, category_id, name, slug, short_description, price_min, price_max, original_price, discount_percent, rating, is_featured, is_active) VALUES
(1, 1, 'Windows 11 Pro Retail Key', 'windows-11-pro-retail', 'Lifetime license – instant delivery', 549, 549, 11489, 95, 4.8, 1, 1),
(2, 1, 'Windows 10 Pro Retail Key', 'windows-10-pro-retail', 'Genuine Windows 10 Pro – retail license', 549, 549, 8900, 94, 5.0, 1, 1),
(3, 1, 'Windows 11 Home Retail License Key', 'windows-11-home-retail', 'Full version – email delivery', 549, 549, NULL, 0, 4.8, 0, 1),
(4, 2, 'MS Office 2021 Pro Plus', 'ms-office-2021-pro-plus', 'Lifetime – Word, Excel, PowerPoint, Outlook', 449, 699, NULL, 0, 4.4, 1, 1),
(5, 2, 'Office 365 Pro Plus – 5 Devices', 'office-365-pro-plus', 'PC/MAC/Mobile – 5 devices', 349, 6499, 6499, 83, 4.8, 1, 1),
(6, 2, 'MS Office 2019 Professional Plus', 'ms-office-2019-pro-plus', 'Online activation – lifetime use', 499, 499, NULL, 0, 5.0, 0, 1),
(7, 3, 'Quick Heal Total Security 1 User 1 Year', 'quick-heal-total-security-1y', '1 PC – 1 year subscription', 1299, 1299, NULL, 0, 4.1, 1, 1),
(8, 3, 'K7 Total Security 1 User 1 Year', 'k7-total-security-1y', 'Complete protection – 1 device', 499, 499, NULL, 0, 4.8, 1, 1)
ON DUPLICATE KEY UPDATE name=VALUES(name), price_min=VALUES(price_min), price_max=VALUES(price_max), original_price=VALUES(original_price), is_featured=VALUES(is_featured);

INSERT INTO product_variants (product_id, name, price, original_price)
SELECT p.id, 'Default', p.price_min, p.original_price FROM products p
WHERE p.id <= 8 AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id);

-- Admin audit log
CREATE TABLE IF NOT EXISTS admin_audit (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    admin_id INT UNSIGNED NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_id INT UNSIGNED NULL,
    details TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- Admin key-value settings
CREATE TABLE IF NOT EXISTS admin_settings (
    `key` VARCHAR(100) PRIMARY KEY,
    `value` TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin notifications (optional UI messages)
CREATE TABLE IF NOT EXISTS admin_notifications (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    `type` ENUM('info','warning','error') DEFAULT 'info',
    message TEXT NOT NULL,
    is_read TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
