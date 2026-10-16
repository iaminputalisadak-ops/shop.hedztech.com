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

# Helper function to clean text like in the original
def clean(text):
    s = str(text or "")
    s = s.replace("\ufffd", "-").replace("\u2014", "-").replace("\u2013", "-")
    s = re.sub(r"\?{2,}", "-", s)
    s = re.sub(r"\s+", " ", s).strip(" -")
    return s

# Helper function to format price
def money(n):
    return "Rs. " + f"{int(round(float(n or 0))):,}"

# Generate content for each product
content_dict = {}

for p in products:
    pid = str(p["id"])
    name = clean(p["name"])
    
    # Get family and attributes
    fam = generate_product_assets.family_of(p)
    attr = generate_product_assets.attributes(p)
    mode = generate_product_assets.delivery_mode(fam, attr, p)
    
    # Get family info
    F = generate_product_assets.FAMILIES.get(fam, generate_product_assets.FAMILIES["generic"])
    
    # Determine license type from attributes or name
    license_type = attr.get("license", "")
    if not license_type:
        nl = name.lower()
        if "retail" in nl:
            license_type = "Retail"
        elif "oem" in nl:
            license_type = "OEM"
        elif "mak" in nl:
            license_type = "MAK"
        elif "bind" in nl:
            license_type = "Bind"
        elif "phone key" in nl:
            license_type = "Phone"
        elif "own account" in nl or "user id" in nl or "extend" in nl:
            license_type = "Own account"
        elif "account" in nl or "admin" in nl or "password" in nl:
            license_type = "Account"
        elif "preactivated" in nl:
            license_type = "Pre-activated"
        else:
            license_type = ""  # Will be handled in description
    
    # Check if license type is already in the product name to avoid duplication
    license_in_name = False
    if license_type:
        # Check if the license type (case insensitive) is already in the name
        if license_type.lower() in name.lower():
            license_in_name = True
    
    # Determine device count
    devices = attr.get("devices", "1 PC")
    if not devices:
        devices = "1 PC"  # Default
    
    # Determine term
    term = attr.get("term", "Lifetime")
    if not term:
        term = "Lifetime"  # Default
    
    # Determine platform
    platform = attr.get("platform", "Windows")
    if not platform:
        platform = "Windows"  # Default
    
    # 1. short_description - 1-2 sentences, product-specific
    # Must include: exact product/edition name, license type, device/user count, term, platform
    
    # Build short description naturally
    if "Windows" in name and ("11" in name or "10" in name or "8" in name):
        # For Windows products
        if license_type and not license_in_name:
            short_description = f"Genuine {name} {license_type.lower()} licence for {devices}."
        else:
            short_description = f"Genuine {name} licence for {devices}."
        
        if term != "Lifetime":
            short_description += f" {term} term."
        else:
            short_description += f" Lifetime use."
            
        short_description += f" Works on {platform}."
        
    elif "Office" in name and "365" in name:
        # For Office 365/Microsoft 365 products
        short_description = f"Genuine {name} subscription for {devices}."
        if term != "Lifetime":
            short_description += f" {term} term."
        else:
            short_description += f" Lifetime use."
        short_description += f" Works on {platform}."
        
    elif "Office" in name and ("2021" in name or "2019" in name):
        # For Office 2021/2019 products
        if license_type and not license_in_name:
            short_description = f"Genuine {name} {license_type.lower()} licence for {devices}."
        else:
            short_description = f"Genuine {name} licence for {devices}."
        short_description += f" {term.lower() if term != 'Lifetime' else 'lifetime'} use."
        short_description += f" Works on {platform}."
        
    else:
        # Generic format
        parts = [f"Genuine {name}"]
        if license_type and not license_in_name:
            parts.append(f"{license_type.lower()} licence")
        elif license_in_name:
            # License type already in name, just add "licence"
            parts.append("licence")
        parts.append(f"for {devices}")
        
        if term != "Lifetime":
            parts.append(f"{term} term")
        else:
            parts.append("lifetime use")
            
        parts.append(f"works on {platform}")
        
        short_description = ". ".join(parts) + "."
    
    # 2. description - 3-5 sentences expanding on short description
    # Mention what the product is, who it's for, how it's delivered, and the warranty/support
    
    # Start with what the product is
    desc_parts = [f"{name} provides {F['about'].format(name=name)}"]
    
    # Add who it's for based on category/family
    if fam == "windows":
        if "pro" in name.lower() or "enterprise" in name.lower():
            desc_parts.append("Ideal for professionals, businesses, and power users who need advanced features like BitLocker, Remote Desktop, and enterprise security tools.")
        else:
            desc_parts.append("Perfect for home users and students who need a reliable operating system with regular security updates and feature improvements.")
    elif fam == "office":
        if "professional plus" in name.lower() or "business" in name.lower():
            desc_parts.append("Designed for professionals and businesses that need full productivity suite including Outlook, Access, and Publisher.")
        elif "home" in name.lower() or "student" in name.lower():
            desc_parts.append("Perfect for home users and students who need essential Office applications like Word, Excel, and PowerPoint.")
        else:
            desc_parts.append("Suitable for users who need Microsoft Office productivity tools for documents, spreadsheets, and presentations.")
    elif fam == "m365":
        desc_parts.append("Ideal for users who want always-up-to-date Office applications with cloud storage, enabling work across PC, Mac, and mobile devices.")
    elif fam == "antivirus":
        desc_parts.append("Essential for anyone wanting to protect their computer from viruses, malware, ransomware, and online threats while browsing or using online banking.")
    elif fam == "vmware" or fam == "parallels":
        desc_parts.append("Perfect for developers, testers, and power users who need to run multiple operating systems on a single machine.")
    else:
        desc_parts.append(f"Suitable for users who need {F['topic']} for their computing needs.")
    
    # Add delivery info
    delivery_desc = m.DELIVERY_WORDS.get(mode, "product key by email and WhatsApp")
    desc_parts.append(f"You will receive {delivery_desc} within minutes during working hours, along with activation support from our technical team in Kathmandu.")
    
    # Add warranty/support info
    warranty_info = ""
    if attr.get("warranty"):
        warranty_info = f"This product includes {attr['warranty']} replacement warranty from Nepal TechGuard."
    else:
        warranty_info = "Backed by our satisfaction guarantee - if you encounter any issues with activation, our team will provide assistance or replacement."
    
    desc_parts.append(warranty_info)
    
    description = " ".join(desc_parts)
    
    # 3. features - array of 3-6 bullet points from FAMILIES
    features = F["features"][:]  # Copy the list
    # Ensure we have 3-6 features
    if len(features) > 6:
        features = features[:6]
    elif len(features) < 3:
        # Pad with generic features if needed
        generic_features = [
            "Genuine licence with fast digital delivery",
            "Secure checkout and activation support", 
            "Support available from Kathmandu team"
        ]
        while len(features) < 3 and generic_features:
            features.append(generic_features.pop(0))
    
    # 4. requirements - array of system requirements from FAMILIES
    requirements = F["req"][:]  # Copy the list
    # Make them more specific where possible
    if fam == "windows":
        # Customize Windows requirements based on version in name
        if "11" in name:
            requirements[0] = "64-bit processor 1 GHz or faster with supported CPU, TPM 2.0 and Secure Boot for Windows 11"
        elif "10" in name:
            requirements[0] = "64-bit processor 1 GHz or faster for Windows 10"
        elif "8" in name or "8.1" in name:
            requirements[0] = "Processor 1 GHz or faster for Windows 8/8.1"
    elif fam == "office":
        # Customize Office requirements
        if "mac" in name.lower() or "win/mac" in name.lower():
            # Already handled in generic requirements
            pass
        else:
            # Windows-specific
            pass
    
    # 5. faq - array of 3-6 {q, a} objects
    faq = []
    
    # Common question 1: Is it genuine?
    faq.append({
        "q": f"Is this {name} genuine?",
        "a": f"Yes. Nepal TechGuard sells genuine {F['topic']} licences from authorized sources. If the licence fails to work properly, contact us within the warranty period for assistance or replacement."
    })
    
    # Common question 2: How fast delivery?
    clean_slug = clean(p.get('slug', name))
    faq.append({
        "q": f"How fast will I receive {clean_slug} in Nepal?",
        "a": f"Most orders are delivered within minutes to a few hours during working hours. You get {generate_product_assets.DELIVERY_WORDS.get(mode, 'product key by email and WhatsApp')}, so there is no shipping wait for delivery to Kathmandu, Pokhara, Lalitpur, or anywhere in Nepal."
    })
    
    # Common question 3: Warranty/refund?
    faq.append({
        "q": f"What warranty applies to {name}?",
        "a": f"We provide a replacement warranty if the product key fails to activate properly. Our technical team is available to help with any activation issues you may encounter."
    })
    
    # Common question 4: How many devices/users?
    if attr.get("devices") and attr["devices"] != "1 PC":
        faq.append({
            "q": f"How many devices can I use {name} on?",
            "a": f"This licence is valid for {attr['devices']} as specified. If you need more devices, we offer volume licensing options - please contact us for details."
        })
    else:
        faq.append({
            "q": f"How many devices can I use {name} on?",
            "a": f"This licence is for 1 PC/device unless otherwise specified in the product details. For multiple devices, please check our volume licensing options."
        })
    
    # Common question 5: Activation help?
    faq.append({
        "q": f"Do you provide activation assistance for {name}?",
        "a": "Yes. Our technical team provides free activation support. If you encounter any errors during activation, simply contact us via WhatsApp or email with a screenshot of the error, and we'll guide you through the process or connect remotely to resolve it."
    })
    
    # Common question 6: Payment and delivery?
    faq.append({
        "q": f"How do I purchase and receive {name}?",
        "a": "Place your order on our website, then our team will contact you via WhatsApp or email to confirm payment details. Once payment is confirmed, we deliver the product key or login details instantly via digital channels."
    })
    
    # Limit to 3-6 FAQs
    if len(faq) > 6:
        faq = faq[:6]
    elif len(faq) < 3:
        # This shouldn't happen with our logic, but just in case
        while len(faq) < 3:
            faq.append({
                "q": f"Is technical support available for {name} after purchase?",
                "a": "Yes, we provide ongoing technical support for activation and basic usage questions for all products sold through our store."
            })
    
    # 6. seo_title - under 60 chars. Include product name + "Nepal" + price
    price_str = money(p["price_min"])
    seo_title = f"{name} Price in Nepal"
    if len(seo_title) + len(" | Nepal TechGuard") <= 60:
        seo_title += " | Nepal TechGuard"
    elif len(seo_title) > 60:
        # Try shortening
        short_name = re.sub(r'\s*\([^)]*\)', '', name)  # Remove parentheticals
        short_name = re.sub(r'\s+', ' ', short_name).strip()
        seo_title = f"{short_name} Price in Nepal"
        if len(seo_title) + len(" | Nepal TechGuard") <= 60:
            seo_title += " | Nepal TechGuard"
        else:
            seo_title = seo_title[:57] + "..."
    
    # 7. seo_description - under 160 chars. Natural, keyword-rich, unique per product
    license_part = ""
    if license_type and not license_in_name:
        license_part = f"{license_type} "
    elif license_in_name:
        # If license type is in name, we don't need to add it again
        license_part = ""
    
    # Format license term for SEO description
    if term != "Lifetime":
        license_term = f"{term} "
    else:
        license_term = "Lifetime "
    
    seo_desc = f"Buy genuine {license_part}{name} in Nepal for {price_str}. {license_term.strip()} {devices} licence. Instant delivery and activation support from Kathmandu."
    
    if len(seo_desc) > 160:
        seo_desc = f"Buy genuine {name} for {price_str} in Nepal. {license_type if not license_in_name else ''} {devices} {term.lower() if term != 'Lifetime' else 'lifetime'} licence. Fast delivery."
        if len(seo_desc) > 160:
            seo_desc = seo_desc[:157] + "..."
    
    # 8. imageAlt - concise alt text for the product image
    # Determine brand/product type for alt text
    brand_hint = ""
    if "Windows" in name:
        brand_hint = "Windows logo"
    elif "Office" in name or "Microsoft" in name:
        brand_hint = "Microsoft Office branding"
    elif "VMware" in name:
        brand_hint = "VMware logo"
    elif "Antivirus" in name or "Security" in name:
        brand_hint = "antivirus software branding"
    else:
        brand_hint = "product branding"
    
    image_alt = f"{name} licence key"
    if license_type and not license_in_name:
        image_alt += f" ({license_type})"
    elif license_in_name:
        # If license type is in name, we still want to show it in alt text for clarity
        pass  # Don't add extra since it's already in the name
    image_alt += f", {brand_hint}"
    
    # 9. unknown - list any details I could not determine
    unknown = []
    if not p.get("brand_name") or p.get("brand_name") == "":
        unknown.append("brand_name")
    if p.get("description") is None or p.get("description") == "":
        unknown.append("original_description")
    # Note: We're generating our own description, so missing original description is expected
    
    # Store the content for this product
    content_dict[pid] = {
        "short_description": short_description,
        "description": description,
        "features": features,
        "requirements": requirements,
        "faq": faq,
        "seo_title": seo_title,
        "seo_description": seo_desc,
        "imageAlt": image_alt,
        "unknown": unknown
    }

# Write to output file
output_path = "D:/Websites/shop hedztech/scripts/product_content.json"
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(content_dict, f, ensure_ascii=False, indent=2)

print(f"Generated content for {len(content_dict)} products and saved to {output_path}")