import json
import sys
import importlib.util

# Import the module with hyphen in name
spec = importlib.util.spec_from_file_location("generate_product_assets", "D:/Websites/shop hedztech/scripts/generate-product-assets.py")
generate_product_assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generate_product_assets)

# Load products
with open('D:/Websites/shop hedztech/scripts/data/products-live.json', 'r') as f:
    products = json.load(f)

# Examine first few products
for i, p in enumerate(products[:5]):
    print(f'Product {p["id"]}: {p["name"]}')
    print(f'  Category: {p["category_name"]}')
    print(f'  Short description: {p.get("short_description", "")}')
    print(f'  Description: {p.get("description", "")}')
    print(f'  Price: {p["price_min"]}')
    
    # Get family
    fam = generate_product_assets.family_of(p)
    print(f'  Family: {fam}')
    
    # Get attributes
    attr = generate_product_assets.attributes(p)
    print(f'  Attributes: {attr}')
    
    # Get delivery mode
    mode = generate_product_assets.delivery_mode(fam, attr, p)
    print(f'  Delivery mode: {mode}')
    
    # Get family info
    if fam in generate_product_assets.FAMILIES:
        F = generate_product_assets.FAMILIES[fam]
        print(f'  Family noun: {F["noun"]}')
        print(f'  Family features: {F["features"][:2]}...')
        print(f'  Family requirements: {F["req"][:2]}...')
    print()