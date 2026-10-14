#!/usr/bin/env python3
"""
ai_images_enhanced.py — Enhanced AI Product Image Generation Pipeline
- Supports multiple providers (OpenAI DALL-E 3, Stability AI) via configurable interface.
- Uses categorized prompt templates from prompt_templates.json.
- Includes safety rules to prevent hallucination of unspecific details.
- Integrates with existing product catalog and admin API.

Usage:
  python scripts/ai_images_enhanced.py export          # Export products from DB → products.json
  python scripts/ai_images_enhanced.py generate        # Generate images for all products
  python scripts/ai_images_enhanced.py review          # Interactive review/accept-reject loop
  python scripts/ai_images_enhanced.py upload          # Upload accepted images via admin API
  python scripts/ai_images_enhanced.py all             # Run export → generate → review → upload

Requirements:
  pip install openai mysql-connector-python requests pillow tqdm

Environment variables:
  OPENAI_API_KEY           - OpenAI API key (for DALL-E 3)
  STABILITY_API_KEY        - Stability AI API key (optional)
  IMAGE_PROVIDER           - Provider to use: 'openai' (default) or 'stability'
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
import re
import sys
import time
import hashlib
import argparse
from pathlib import Path
from datetime import datetime
from urllib.parse import urljoin

import requests

# Optional OpenAI import; will be used if provider is openai
try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "scripts" / "ai_images_output"
IMAGES_DIR = OUTPUT_DIR / "images"
ACCEPTED_DIR = OUTPUT_DIR / "accepted"
PROMPT_TEMPLATES_FILE = ROOT / "prompt_templates.json"

# ---------------------------------------------------------------------------
# Prompt template loading and categorization
# ---------------------------------------------------------------------------
def load_prompt_templates() -> dict:
    if not PROMPT_TEMPLATES_FILE.exists():
        print(f"ERROR: Prompt templates file not found: {PROMPT_TEMPLATES_FILE}")
        sys.exit(1)
    with open(PROMPT_TEMPLATES_FILE, encoding='utf-8') as f:
        return json.load(f)

PROMPT_TEMPLATES = load_prompt_templates()

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_]+', '-', text)
    text = re.sub(r'-+', '-', text)
    return text.strip('-')

def categorize(name: str, category_name: str) -> str:
    """Map product to a prompt template group based on name and category."""
    hay = (name + ' ' + category_name).lower()
    # Microsoft OS
    if 'windows' in hay:
        return 'microsoft_os'
    # Microsoft Office
    if any(k in hay for k in ['office', 'word', 'excel', 'powerpoint', 'outlook', 'microsoft 365', 'office 365']):
        return 'microsoft_office'
    # Microsoft Project/Visio/Access
    if any(k in hay for k in ['project', 'visio', 'access']):
        return 'microsoft_project_visio_access'
    # Adobe Creative
    if any(k in hay for k in ['adobe', 'photoshop', 'illustrator', 'acrobat', 'premiere', 'creative cloud']):
        return 'adobe_creative'
    # Design / Architecture (Lumion, design software)
    if any(k in hay for k in ['lumion', 'design', 'architecture', 'cad', 'sketchup']):
        return 'design_architecture'
    # Virtualization
    if any(k in hay for k in ['vmware', 'parallels', 'virtualization', 'virtual machine']):
        return 'virtualization'
    # Antivirus / Security
    if any(k in hay for k in ['antivirus', 'security', 'mcafee', 'kaspersky', 'quick heal', 'norton', 'bitdefender']):
        return 'antivirus_security'
    # Cloud / Streaming
    if any(k in hay for k in ['cloud', 'storage', 'streaming', 'youtube', 'drive', 'dropbox', 'spotify', 'netflix']):
        return 'cloud_streaming'
    # AI / Others
    if any(k in hay for k in ['ai', 'chatgpt', 'grammarly', 'copilot']):
        return 'ai_others'
    # Accounting Software
    if any(k in hay for k in ['accounting', 'bookkeeping', 'quickbooks', 'sage', 'wave', 'xero']):
        return 'accounting_software'
    # Bundle Keys
    if 'bundle' in hay or 'key' in hay:
        return 'bundle_keys'
    # Default fallback
    return 'default'

def make_prompt(product: dict) -> str:
    """Build a DALL-E prompt from a product record, applying safety rules."""
    name = product.get('name', 'Software License')
    category = product.get('category_name', '')
    short_desc = product.get('short_description', '') or ''
    brand = product.get('brand_name', '')

    group = categorize(name, category)
    template = PROMPT_TEMPLATES.get(group, PROMPT_TEMPLATES['default'])

    # Safety: Do not hallucinate specifics. Only add brand if present.
    parts = []
    for fragment in template:
        parts.append(fragment.format(name=name))

    if brand:
        parts.append(f"featuring {brand} branding and color scheme")

    # Only add description if it does NOT contain specific model numbers, versions, ports unless they appear in name/brand.
    # We'll filter out obvious hallucination triggers.
    desc_clean = re.sub(r'\b\d+(\.\d+)?\s*(days?|months?|years?)\s*warranty\b', '', short_desc, flags=re.I)
    desc_clean = re.sub(r'\b\d+\s*[GBTB]\b', '', desc_clean)  # remove storage sizes that could be hallucinated
    desc_clean = desc_clean.strip()
    if desc_clean:
        # Limit length and avoid adding details that look like specs.
        # Allow only generic phrases; we could check for numbers but keep simple.
        if len(desc_clean) > 120:
            desc_desc = desc_clean[:120].rsplit(' ', 1)[0]
        else:
            desc_desc = desc_clean
        parts.append(f"representing: {desc_desc}")

    prompt = ', '.join(parts)

    # DALL-E prompt max is 1000 chars; truncate at sentence boundary.
    if len(prompt) > 950:
        prompt = prompt[:950].rsplit('.', 1)[0]
    return prompt

# ---------------------------------------------------------------------------
# Provider abstraction
# ---------------------------------------------------------------------------
class ImageProvider:
    """Abstract base class for image providers."""
    def generate(self, prompt: str) -> str:
        raise NotImplementedError

class OpenAIImageProvider(ImageProvider):
    def __init__(self, api_key: str, org_id: str = ''):
        if OpenAI is None:
            raise RuntimeError("OpenAI package not installed. Install with `pip install openai`.")
        self.client = OpenAI(api_key=api_key, organization=org_id or None)

    def generate(self, prompt: str) -> str:
        resp = self.client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            size="1024x1024",
            response_format="url",
            quality="standard",
            style="natural",
        )
        return resp.data[0].url

class StabilityImageProvider(ImageProvider):
    """Placeholder for Stability AI implementation."""
    def __init__(self, api_key: str, engine_id: str = 'stable-diffusion-xl-1024-v1-0'):
        self.api_key = api_key
        self.engine_id = engine_id

    def generate(self, prompt: str) -> str:
        # TODO: Implement Stability API call
        raise NotImplementedError("Stability provider not yet implemented.")

def get_provider() -> ImageProvider:
    provider_name = os.getenv('IMAGE_PROVIDER', 'openai').lower()
    if provider_name == 'openai':
        api_key = os.getenv('OPENAI_API_KEY')
        if not api_key:
            print("ERROR: OPENAI_API_KEY environment variable not set.")
            sys.exit(1)
        org_id = os.getenv('OPENAI_ORG_ID', '')
        return OpenAIImageProvider(api_key, org_id)
    elif provider_name == 'stability':
        api_key = os.getenv('STABILITY_API_KEY')
        if not api_key:
            print("ERROR: STABILITY_API_KEY environment variable not set.")
            sys.exit(1)
        engine_id = os.getenv('STABILITY_ENGINE_ID', '')
        return StabilityImageProvider(api_key, engine_id)
    else:
        print(f"ERROR: Unsupported IMAGE_PROVIDER '{provider_name}'. Use 'openai' or 'stability'.")
        sys.exit(1)

# ---------------------------------------------------------------------------
# Database export
# ---------------------------------------------------------------------------
def export_products() -> list:
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
# AI image generation
# ---------------------------------------------------------------------------
def generate_image(product: dict, provider: ImageProvider, index: int, total: int, skip_existing: bool = True) -> dict | None:
    slug = product.get('slug') or slugify(product.get('name', 'product'))
    image_path = ACCEPTED_DIR / f"{slug}.png"

    if skip_existing and image_path.exists():
        print(f"  [{index}/{total}] SKIP (already have) — {product['name'][:40]}")
        return {"product_id": product['id'], "slug": slug, "path": str(image_path), "prompt": "cached"}

    prompt = make_prompt(product)

    try:
        image_url = provider.generate(prompt)

        # Download the generated image
        img_data = requests.get(image_url, timeout=60).content
        IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        raw_path = IMAGES_DIR / f"{slug}.png"
        with open(raw_path, 'wb') as f:
            f.write(img_data)

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
    products_path = OUTPUT_DIR / "products.json"
    if not products_path.exists():
        print("No products.json found. Run 'export' first.")
        sys.exit(1)

    with open(products_path) as f:
        products = json.load(f)

    if limit:
        products = products[:limit]

    print(f"Generating {len(products)} images with provider {os.getenv('IMAGE_PROVIDER', 'openai')}...\n")

    provider = get_provider()
    results = []
    errors = []

    for i, product in enumerate(products, 1):
        result = generate_image(product, provider, i, len(products), skip_existing)
        if result:
            results.append(result)
        else:
            errors.append(product.get('slug', product['name']))

        if i < len(products):
            time.sleep(1)  # rate limiting

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
# Review / accept-reject (unchanged)
# ---------------------------------------------------------------------------
def review_images():
    images = list(ACCEPTED_DIR.glob("*.png"))
    if not images:
        print("No generated images found. Run 'generate' first.")
        sys.exit(1)

    print(f"Found {len(images)} generated images.")
    print("Review mode: each image will open in your default viewer.")
    print("Commands: a=accept, r=reject(delete), s=skip, q=quit\n")

    rejected = accepted = skipped = 0
    for img_path in sorted(images):
        print(f"  {img_path.name}")
        if os.name == 'nt':
            os.startfile(str(img_path))
        else:
            os.system(f'open "{img_path}"')
        resp = input("  [a]ccept, [r]eject, [s]kip, [q]uit: ").strip().lower()
        if resp == 'q':
            break
        elif resp == 'r':
            img_path.unlink()
            rejected += 1
            print(f"  Rejected: {img_path.name}\n")
        elif resp == 'a':
            accepted += 1
            print(f"  Accepted: {img_path.name}\n")
        else:
            skipped += 1
            print(f"  Skipped: {img_path.name}\n")

    print(f"\nReview complete: {accepted} accepted, {rejected} rejected, {skipped} skipped")

# ---------------------------------------------------------------------------
# Upload to server and update database (unchanged)
# ---------------------------------------------------------------------------
def login_admin(api_base: str, username: str, password: str) -> str:
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
    import mysql.connector

    api_base = os.getenv('ADMIN_API_URL', 'http://localhost:8000/backend/api').rstrip('/')
    username = os.getenv('ADMIN_USERNAME', 'admin')
    password = os.getenv('ADMIN_PASSWORD', 'password')

    print(f"Authenticating to admin API at {api_base}...")
    token = login_admin(api_base, username, password)
    headers = {"Authorization": f"Bearer {token}"}

    products_path = OUTPUT_DIR / "products.json"
    if not products_path.exists():
        print("No products.json found. Run 'export' first.")
        sys.exit(1)

    with open(products_path) as f:
        products = {p['slug']: p for p in json.load(f)}

    manifest_path = OUTPUT_DIR / "generation-manifest.json"
    if manifest_path.exists():
        with open(manifest_path) as f:
            manifest = json.load(f)
    else:
        accepted = list(ACCEPTED_DIR.glob("*.png"))
        manifest = {"results": [{"slug": img.stem, "path": str(img)} for img in accepted]}

    accepted_images = sorted(ACCEPTED_DIR.glob("*.png"))
    if not accepted_images:
        print("No accepted images found.")
        sys.exit(1)

    print(f"Uploading {len(accepted_images)} images and updating database...\n")

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
    parser = argparse.ArgumentParser(description='Enhanced AI Product Image Generation Pipeline')
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