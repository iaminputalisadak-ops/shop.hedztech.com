#!/usr/bin/env python3
"""
ai_images.py — AI Product Image Generation Pipeline for Nepal TechGuard

Generates high-quality product images from product descriptions using OpenAI's DALL-E 3.
Integrates with the existing product catalog and admin API.

Usage:
  python scripts/ai_images.py export          # Export products from DB → products.json
  python scripts/ai_images.py generate        # Generate images for all products
  python scripts/ai_images.py review          # Interactive review/accept-reject loop
  python scripts/ai_images.py upload          # Upload accepted images via admin API
  python scripts/ai_images.py all             # Run export → generate → review → upload

Requirements:
  pip install openai mysql-connector-python requests pillow tqdm

Environment variables:
  OPENAI_API_KEY           - OpenAI API key (for DALL-E 3)
  DB_HOST                  - MySQL host (default: localhost)
  DB_NAME                  - MySQL database (default: nepal_techguard)
  DB_USER                  - MySQL user (default: root)
  DB_PASS                  - MySQL password
  ADMIN_API_URL            - Base URL of admin API (default: http://localhost:8000/backend/api)
  ADMIN_USERNAME           - Admin username for API auth
  ADMIN_PASSWORD           - Admin password for API auth
"""

import json
import os
import sys
import re
import time
import hashlib
import argparse
from pathlib import Path
from datetime import datetime
from urllib.parse import urljoin

import requests

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "scripts" / "ai_images_output"
IMAGES_DIR = OUTPUT_DIR / "images"
ACCEPTED_DIR = OUTPUT_DIR / "accepted"

# ---------------------------------------------------------------------------
# Prompt templates — one per product category/brand archetype.
# Each template is a list of prompt fragments that are joined to form a
# full DALL-E prompt.  The {name} and {short_description} placeholders are
# interpolated per product.
# ---------------------------------------------------------------------------

PROMPT_TEMPLATES = {
    "windows": [
        "Professional product photography of {name}",
        "digital software license key card for Windows operating system",
        "clean minimal studio lighting, pristine white background",
        "Microsoft Windows branding elements, blue color scheme",
        "sharp focus, 8K resolution, commercial product shot style",
        "no watermark, no text overlay except brand logo",
    ],
    "office": [
        "Professional product photography of {name}",
        "Microsoft Office suite packaging, digital license",
        "overhead shot of Office applications on a computer monitor",
        "clean office desk with laptop, professional lighting",
        "Microsoft blue and white color palette",
        "sharp focus, 8K resolution, commercial product shot",
        "no watermark, no text overlay",
    ],
    "antivirus": [
        "Professional product photography of {name}",
        "cybersecurity software interface, digital protection theme",
        "shield and circuit board motifs, green/blue tech colors",
        "glowing digital security visualization, dark professional background",
        "sharp focus, 8K resolution, commercial product shot",
        "no watermark, no text overlay",
    ],
    "adobe": [
        "Professional product photography of {name}",
        "Adobe Creative Cloud software on computer monitor",
        "creative workspace with Photoshop, Illustrator interface",
        "Adobe magenta and purple color palette, minimalist style",
        "sharp focus, 8K resolution, commercial product shot",
        "no watermark, no text overlay",
    ],
    "canva": [
        "Professional product photography of {name}",
        "Canva design tool interface on tablet and desktop",
        "vibrant creative design elements, clean modern aesthetic",
        "Canva teal/blue color scheme",
        "sharp focus, 8K resolution, commercial product shot",
        "no watermark, no text overlay",
    ],
    "cloud-streaming": [
        "Professional product photography of {name}",
        "subscription service interface, modern app UI",
        "smartphone and laptop showing streaming/Cloud app",
        "clean modern background, soft gradient lighting",
        "sharp focus, 8K resolution, commercial product shot",
        "no watermark, no text overlay",
    ],
    "project-visio": [
        "Professional product photography of {name}",
        "project management or diagramming software interface",
        "business planning on computer screen, charts and diagrams",
        "professional office environment, clean lighting",
        "sharp focus, 8K resolution, commercial product shot",
        "no watermark, no text overlay",
    ],
    "lumion": [
        "Professional product photography of {name}",
        "architectural rendering software, 3D visualization",
        "modern building render on large monitor, interior/exterior design",
        "clean studio background, professional lighting",
        "sharp focus, 8K resolution, commercial product shot",
        "no watermark, no text overlay",
    ],
    "default": [
        "Professional product photography of {name}",
        "software license key card, digital technology product",
        "clean minimal studio lighting, pristine white background",
        "sharp focus, 8K resolution, commercial product shot style",
        "no watermark, no text overlay except brand logo",
    ],
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')

def categorize(name: str, category_name: str) -> str:
    """Map a product to a prompt template category based on name and category."""
    hay = (name + ' ' + category_name).lower()
    if 'windows' in hay:
        return 'windows'
    if 'office' in hay or 'word' in hay or 'excel' in hay or 'powerpoint' in hay or 'outlook' in hay:
        return 'office'
    if 'antivirus' in hay or 'security' in hay or 'mcafee' in hay or 'kaspersky' in hay or 'quick heal' in hay:
        return 'antivirus'
    if 'adobe' in hay or 'photoshop' in hay or 'illustrator' in hay or 'acrobat' in hay or 'premiere' in hay:
        return 'adobe'
    if 'canva' in hay:
        return 'canva'
    if 'youtube' in hay or 'drive' in hay or 'cloud' in hay or 'streaming' in hay or 'spotify' in hay or 'chatgpt' in hay or 'grammarly' in hay or 'parallel' in hay:
        return 'cloud-streaming'
    if 'project' in hay or 'visio' in hay:
        return 'project-visio'
    if 'lumion' in hay:
        return 'lumion'
    return 'default'

def make_prompt(product: dict) -> str:
    """Build a DALL-E prompt from a product record."""
    name = product.get('name', 'Software License')
    category = product.get('category_name', '')
    short_desc = product.get('short_description', '') or ''
    brand = product.get('brand_name', '')
    template_key = categorize(name, category)
    template = PROMPT_TEMPLATES.get(template_key, PROMPT_TEMPLATES['default'])

    # Interpolate placeholders
    parts = []
    for fragment in template:
        parts.append(fragment.format(name=name))

    # Augment with brand-specific detail when available
    if brand:
        parts.append(f"featuring {brand} branding and color scheme")

    # Add product-specific detail from short_description (trim to avoid confusion)
    desc_clean = re.sub(r'\d+ days warranty', '', short_desc).strip()
    if desc_clean:
        parts.append(f"representing: {desc_clean[:100]}")

    prompt = ', '.join(parts)
    # DALL-E prompt max is 1000 chars; truncate at sentence boundary
    if len(prompt) > 950:
        prompt = prompt[:950].rsplit('.', 1)[0]
    return prompt

# ---------------------------------------------------------------------------
# Database export
# ---------------------------------------------------------------------------

def export_products() -> list:
    """Export all active products from the database."""
    import mysql.connector

    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'database': os.getenv('DB_NAME', 'nepal_techguard'),
        'user': os.getenv('DB_USER', 'root'),
        'password': os.getenv('DB_PASS', ''),
    }

    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT p.id, p.name, p.slug, p.category_id, c.name AS category_name,
               p.short_description, p.description, p.image_url, p.brand_name,
               p.price_min, p.price_max
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1
        ORDER BY p.category_id, p.name
    """)
    products = cursor.fetchall()
    cursor.close()
    conn.close()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path = OUTPUT_DIR / "products.json"
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(products, f, indent=2, ensure_ascii=False)

    print(f"Exported {len(products)} products to {out_path}")
    return products

# ---------------------------------------------------------------------------
# AI image generation via DALL-E 3
# ---------------------------------------------------------------------------

def generate_image(product: dict, client, index: int, total: int, skip_existing: bool = True) -> dict | None:
    """Generate a single AI image for a product using DALL-E 3."""
    slug = product.get('slug') or slugify(product.get('name', 'product'))
    image_path = ACCEPTED_DIR / f"{slug}.png"

    if skip_existing and image_path.exists():
        print(f"  [{index}/{total}] SKIP (already have) — {product['name'][:40]}")
        return {"product_id": product['id'], "slug": slug, "path": str(image_path), "prompt": "cached"}

    prompt = make_prompt(product)

    try:
        resp = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            size="1024x1024",
            response_format="url",
            quality="standard",
            style="natural",  # photo-realistic, good for product shots
        )

        image_url = resp.data[0].url

        # Download the generated image
        img_data = requests.get(image_url, timeout=60).content
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        raw_path = IMAGES_DIR / f"{slug}.png"
        with open(raw_path, 'wb') as f:
            f.write(img_data)

        # Also copy to accepted dir (pre-accepted; can be reviewed later)
        ACCEPTED_DIR.mkdir(parents=True, exist_ok=True)
        with open(image_path, 'wb') as f:
            f.write(img_data)

        print(f"  [{index}/{total}] OK — {product['name'][:40]}")
        return {
            "product_id": product['id'],
            "slug": slug,
            "path": str(image_path),
            "raw_path": str(raw_path),
            "prompt": prompt,
        }

    except Exception as e:
        print(f"  [{index}/{total}] FAIL — {product['name'][:40]}: {e}")
        return None

def generate_all_products(skip_existing: bool = True, limit: int = None):
    """Generate AI images for all exported products."""
    from openai import OpenAI

    # Check API key
    api_key = os.getenv('OPENAI_API_KEY')
    if not api_key:
        print("ERROR: OPENAI_API_KEY environment variable not set.")
        sys.exit(1)

    # Load products
    products_path = OUTPUT_DIR / "products.json"
    if not products_path.exists():
        print("No products.json found. Run 'export' first.")
        sys.exit(1)

    with open(products_path) as f:
        products = json.load(f)

    if limit:
        products = products[:limit]

    print(f"Generating {len(products)} images with DALL-E 3...\n")

    client = OpenAI(api_key=api_key)

    results = []
    errors = []

    for i, product in enumerate(products, 1):
        result = generate_image(product, client, i, len(products), skip_existing)
        if result:
            results.append(result)
        else:
            errors.append(product.get('slug', product['name']))

        # Rate limiting: DALL-E has a default quota. Sleep briefly between calls.
        if i < len(products):
            time.sleep(1)  # 1 second between calls ≈ 60/min, well within rate limits

    # Save manifest
    manifest = {
        "generated_at": datetime.now().isoformat(),
        "total_products": len(products),
        "success_count": len(results),
        "error_count": len(errors),
        "results": results,
        "errors": errors,
    }
    manifest_path = OUTPUT_DIR / "generation-manifest.json"
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\nDone: {len(results)} generated, {len(errors)} failed")
    if errors:
        print(f"Failed slugs: {', '.join(errors[:10])}{'...' if len(errors) > 10 else ''}")
    print(f"Manifest saved to {manifest_path}")

    return results

# ---------------------------------------------------------------------------
# Review / accept-reject
# ---------------------------------------------------------------------------

def review_images():
    """Interactive review of generated images. Opens each in default viewer."""
    images = list(ACCEPTED_DIR.glob("*.png"))
    if not images:
        print("No generated images found. Run 'generate' first.")
        sys.exit(1)

    print(f"Found {len(images)} generated images.")
    print("Review mode: each image will open in your default viewer.")
    print("Commands: a=accept, r=reject(delete), s=skip, q=quit\n")

    rejected_count = 0
    accepted_count = 0
    skipped_count = 0

    for img_path in sorted(images):
        print(f"  {img_path.name}")
        os.startfile(str(img_path)) if os.name == 'nt' else os.system(f'open "{img_path}"')
        response = input("  [a]ccept, [r]eject, [s]kip, [q]uit: ").strip().lower()

        if response == 'q':
            break
        elif response == 'r':
            img_path.unlink()
            rejected_count += 1
            print(f"  Rejected: {img_path.name}\n")
        elif response == 'a':
            accepted_count += 1
            print(f"  Accepted: {img_path.name}\n")
        else:
            skipped_count += 1
            print(f"  Skipped: {img_path.name}\n")

    print(f"\nReview complete: {accepted_count} accepted, {rejected_count} rejected, {skipped_count} skipped")

# ---------------------------------------------------------------------------
# Upload to server and update database
# ---------------------------------------------------------------------------

def login_admin(api_base: str, username: str, password: str) -> str:
    """Authenticate with the admin API and return a bearer token."""
    resp = requests.post(
        f"{api_base}/auth/login.php",
        data={"username": username, "password": password},
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Login failed: {resp.status_code} {resp.text}")
    data = resp.json()
    return data.get('token') or data.get('data', {}).get('token', '')

def upload_and_map():
    """Upload accepted images to the server and update product image_url in the database."""
    import mysql.connector

    api_base = os.getenv('ADMIN_API_URL', 'http://localhost:8000/backend/api').rstrip('/')
    username = os.getenv('ADMIN_USERNAME', 'admin')
    password = os.getenv('ADMIN_PASSWORD', 'password')

    # Authenticate
    print(f"Authenticating to admin API at {api_base}...")
    token = login_admin(api_base, username, password)
    headers = {"Authorization": f"Bearer {token}"}

    # Load products
    products_path = OUTPUT_DIR / "products.json"
    if not products_path.exists():
        print("No products.json found. Run 'export' first.")
        sys.exit(1)

    with open(products_path) as f:
        products = {p['slug']: p for p in json.load(f)}

    # Load generation manifest
    manifest_path = OUTPUT_DIR / "generation-manifest.json"
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        # Fall back to scanning accepted directory
        accepted = list(ACCEPTED_DIR.glob("*.png"))
        manifest = {"results": [{"slug": img.stem, "path": str(img)} for img in accepted]}

    # Find accepted images
    accepted_images = ACCEPTED_DIR.glob("*.png")
    accepted_images = sorted(accepted_images)

    if not accepted_images:
        print("No accepted images found.")
        sys.exit(1)

    print(f"Uploading {len(accepted_images)} images and updating database...\n")

    # Database connection for direct updates
    db_config = {
        'host': os.getenv('DB_HOST', 'localhost'),
        'database': os.getenv('DB_NAME', 'nepal_techguard'),
        'user': os.getenv('DB_USER', 'root'),
        'password': os.getenv('DB_PASS', ''),
    }
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    success = 0
    errors = []

    for i, img_path in enumerate(accepted_images, 1):
        slug = img_path.stem
        product = products.get(slug)

        if not product:
            print(f"  [{i}/{len(accepted_images)}] SKIP — no product found for slug '{slug}'")
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
                raise RuntimeError(f"Upload failed: {resp.status_code} {resp.text[:200]}")

            upload_data = resp.json()
            if not upload_data.get('success'):
                raise RuntimeError(f"Upload API error: {upload_data.get('message', 'unknown')}")

            image_url = upload_data['url']
            print(f"  [{i}/{len(accepted_images)}] Uploaded — {product_name[:40]} → {Path(image_url).name}")

            # Update products.image_url
            cursor.execute(
                'UPDATE products SET image_url = %s WHERE id = %s',
                (image_url, product_id)
            )
            success += 1

        except Exception as e:
            print(f"  [{i}/{len(accepted_images)}] FAIL — {product_name[:40]}: {e}")
            errors.append({"slug": slug, "product_id": product_id, "error": str(e)})

    conn.commit()
    cursor.close()
    conn.close()

    # Save upload manifest
    upload_manifest = {
        "uploaded_at": datetime.now().isoformat(),
        "total_uploaded": success,
        "errors": errors,
    }
    manifest_path = OUTPUT_DIR / "upload-manifest.json"
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(upload_manifest, f, indent=2, ensure_ascii=False)

    print(f"\nDone: {success} products updated, {len(errors)} errors")
    print(f"Upload manifest saved to {manifest_path}")

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='AI Product Image Generation Pipeline')
    parser.add_argument('command', choices=['export', 'generate', 'review', 'upload', 'all'],
                        help='Action to perform')
    parser.add_argument('--limit', type=int, default=None,
                        help='Limit number of products to process (for testing)')
    parser.add_argument('--skip-existing', action='store_true', default=True,
                        help='Skip products that already have images (default: True)')
    parser.add_argument('--no-skip-existing', dest='skip_existing', action='store_false',
                        help='Regenerate images even if they exist')

    args = parser.parse_args()

    if args.command in ('export', 'all'):
        export_products()

    if args.command in ('generate', 'all'):
        generate_all_products(
            skip_existing=args.skip_existing,
            limit=args.limit,
        )

    if args.command in ('review', 'all'):
        review_images()

    if args.command in ('upload', 'all'):
        upload_and_map()

if __name__ == '__main__':
    main()
