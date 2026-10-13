#!/usr/bin/env python3
"""
map_ai_images.py — Upload generated AI product images and update database.

This script is the CLI companion to the admin-panel "Generate AI Images" feature.
It uploads images from scripts/ai_images_output/accepted/ to the server via the
existing admin upload endpoint, then updates each product's image_url in MySQL.

Usage:
  python scripts/map_ai_images.py [--dry-run] [--start-slug SLUG]

Environment variables:
  ADMIN_API_URL     - Base URL of admin API (default: https://shop.hedztech.com/backend/api)
  ADMIN_USERNAME    - Admin username
  ADMIN_PASSWORD    - Admin password
  DB_HOST, DB_NAME, DB_USER, DB_PASS  - MySQL connection (same as ai_images.py)
"""

import json
import os
import sys
import re
import time
from pathlib import Path
from datetime import datetime

import requests
import mysql.connector

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "scripts" / "ai_images_output"
ACCEPTED_DIR = OUTPUT_DIR / "accepted"


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    return re.sub(r'-+', '-', text).strip('-')


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Upload AI-generated images and map to products')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be done without uploading or modifying DB')
    parser.add_argument('--start-slug', type=str, default=None,
                        help='Start from a specific product slug (for resuming)')
    args = parser.parse_args()

    api_base = os.getenv('ADMIN_API_URL', 'https://shop.hedztech.com/backend/api').rstrip('/')
    username = os.getenv('ADMIN_USERNAME', 'admin')
    password = os.getenv('ADMIN_PASSWORD', 'password')

    if not ACCEPTED_DIR.exists():
        print(f"No accepted images directory found at {ACCEPTED_DIR}")
        sys.exit(1)

    accepted_images = sorted(ACCEPTED_DIR.glob("*.png"))
    if not accepted_images:
        print("No accepted images found.")
        sys.exit(1)

    # Load product map from products.json (must have been exported via ai_images.py)
    products_path = OUTPUT_DIR / "products.json"
    if not products_path.exists():
        print("ERROR: No products.json found. Run 'python scripts/ai_images.py export' first.")
        sys.exit(1)

    with open(products_path) as f:
        products_list = json.load(f)
    products = {p['slug']: p for p in products_list}

    print(f"Found {len(accepted_images)} accepted images.")

    if args.dry_run:
        print("\n[DRY RUN] The following uploads would occur:")
        for img_path in accepted_images:
            slug = img_path.stem
            product = products.get(slug)
            if product:
                print(f"  {img_path.name} → product #{product['id']} ({product['name'][:50]})")
            else:
                print(f"  {img_path.name} → NO MATCHING PRODUCT (skipped)")
        print("\nDry run complete. No changes made.")
        return

    # Authenticate
    print(f"\nAuthenticating to {api_base}...")
    resp = requests.post(
        f"{api_base}/auth/login.php",
        data={"username": username, "password": password},
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code} {resp.text}")
        sys.exit(1)

    data = resp.json()
    token = data.get('token') or data.get('data', {}).get('token', '')
    if not token:
        print("Login succeeded but no token returned. Check API login endpoint.")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}

    # Find starting point
    start_idx = 0
    if args.start_slug:
        for i, img_path in enumerate(accepted_images):
            if img_path.stem == args.start_slug:
                start_idx = i
                break
        if start_idx == 0:
            print(f"Warning: start slug '{args.start_slug}' not found, starting from beginning.")

    pending = accepted_images[start_idx:]
    print(f"Processing {len(pending)} images starting from index {start_idx}...")

    # Database connection
    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'database': os.getenv('DB_NAME', 'nepal_techguard'),
        'user': os.getenv('DB_USER', 'root'),
        'password': os.getenv('DB_PASS', ''),
    }

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    success = 0
    failed = 0
    skipped = 0
    results = []

    for i, img_path in enumerate(pending, 1):
        slug = img_path.stem
        product = products.get(slug)

        if not product:
            print(f"  [{i}/{len(pending)}] SKIP — no product with slug '{slug}'")
            skipped += 1
            results.append({"slug": slug, "status": "skipped", "reason": "no matching product"})
            continue

        product_id = product['id']
        product_name = product['name']

        try:
            # Upload image via admin upload.php
            with open(img_path, 'rb') as f:
                files = {'image': (f"{slug}.png", f, 'image/png')}
                resp = requests.post(
                    f"{api_base}/admin/upload.php",
                    files=files,
                    headers=headers,
                    timeout=60,
                )

            if resp.status_code != 200:
                raise RuntimeError(f"Upload HTTP {resp.status_code}: {resp.text[:200]}")

            upload_data = resp.json()
            if not upload_data.get('success'):
                raise RuntimeError(f"API: {upload_data.get('message', 'unknown error')}")

            image_url = upload_data.get('url') or upload_data.get('image_url')
            if not image_url:
                raise RuntimeError(f"No URL in response: {upload_data}")

            # Update database
            cursor.execute(
                'UPDATE products SET image_url = %s WHERE id = %s',
                (image_url, product_id)
            )

            print(f"  [{i}/{len(pending)}] OK — {product_name[:45]} → {Path(image_url).name}")
            success += 1
            results.append({
                "product_id": product_id,
                "slug": slug,
                "product_name": product_name,
                "image_url": image_url,
                "status": "success",
            })

        except Exception as e:
            print(f"  [{i}/{len(pending)}] FAIL — {product_name[:45]}: {e}")
            failed += 1
            results.append({
                "product_id": product_id,
                "slug": slug,
                "product_name": product_name,
                "status": "failed",
                "error": str(e),
            })

        # Brief pause to avoid overwhelming the server
        time.sleep(0.1)

    conn.commit()
    cursor.close()
    conn.close()

    # Save manifest
    manifest = {
        "uploaded_at": datetime.now().isoformat(),
        "total_processed": len(pending),
        "success": success,
        "failed": failed,
        "skipped": skipped,
        "results": results,
    }
    manifest_path = OUTPUT_DIR / "upload-manifest.json"
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Upload complete:")
    print(f"  ✓ Success: {success}")
    print(f"  ✗ Failed:  {failed}")
    print(f"  ⊘ Skipped: {skipped}")
    print(f"  Manifest: {manifest_path}")

    if failed:
        sys.exit(1)


if __name__ == '__main__':
    main()
