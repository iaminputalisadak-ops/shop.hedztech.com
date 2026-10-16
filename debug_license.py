import json
import sys
import re
import importlib.util

# Import the module with hyphen in name
spec = importlib.util.spec_from_file_location("generate_product_assets", "D:/Websites/shop hedztech/scripts/generate-product-assets.py")
generate_product_assets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generate_product_assets)

# Load products
with open('D:/Websites/shop hedztech/scripts/data/products-live.json', 'r') as f:
    products = json.load(f)

# Get product #3
p = products[2]  # 0-indexed, so index 2 is product ID 3
print(f"Product ID: {p['id']}")
print(f"Name: {p['name']}")

# Get attributes
attr = generate_product_assets.attributes(p)
print(f"Attributes: {attr}")

# Check license type from attributes
license_type_from_attr = attr.get("license", "")
print(f"License type from attributes: '{license_type_from_attr}'")

# Check if license type is in name
nl = p["name"].lower()
print(f"Name lowercase: '{nl}'")
if license_type_from_attr:
    check = license_type_from_attr.lower() in nl
    print(f"Is '{license_type_from_attr.lower()}' in '{nl}'? {check}")
else:
    print("No license type from attributes")

# What does our detection logic say?
license_type = license_type_from_attr
license_in_name = False
if license_type:
    if license_type.lower() in nl:
        license_in_name = True
        print(f"Set license_in_name to True because '{license_type.lower()}' is in name")
    else:
        print(f"Did NOT set license_in_name to True because '{license_type.lower()}' is NOT in name")
else:
    print("No license type, so license_in_name remains False")

print(f"Final license_type: '{license_type}'")
print(f"Final license_in_name: {license_in_name}")