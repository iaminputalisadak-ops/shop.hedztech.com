# Safety Rules for AI-Generated Product Images

## Goal
Ensure generated images are accurate, truthful, and do not contain hallucinated details that could mislead customers.

## Rules

1. **No Hallucinated Specifications**
   - Do NOT add model numbers, version numbers, port counts, storage sizes, or technical specs unless they appear explicitly in the product data (name, short_description, brand).
   - Avoid adding details like "32GB RAM", "2TB SSD", "HDMI 2.1", etc. unless present.

2. **Branding Only When Provided**
   - Only include brand logos, colors, or branding elements if the product data includes a brand name.
   - Do not infer or guess branding from category alone.

3. **No Fake Logos or Watermarks**
   - The prompt must instruct the model to avoid watermarks, text overlays, or fake logos.
   - Post‑generation validation should check for any visible text or logos that were not requested.

4. **Category‑Appropriate Scenes**
   - Software products should be shown as digital license key cards, clean software interfaces on monitors, or professional packaging.
   - Hardware products (if any) should be shown as physical devices in studio lighting.
   - Avoid mixing software and hardware cues unless the product is known to be a hybrid.

5. **Photorealistic, Neutral Background**
   - Use studio/product photography style with clean, white or neutral backgrounds.
   - Avoid cluttered desks unless they are part of a legitimate office scene and supported by the product category.

6. **Consistent Lighting and Style**
   - All images should follow a uniform lighting setup (soft, diffused key light) to maintain catalog consistency.
   - Style: commercial product shot, sharp focus, 8K resolution.

7. **Validation Steps**
   - After generation, run automated checks:
     - Image dimensions are 1024x1024.
     - File size is within reasonable limits (e.g., 100KB‑2MB for PNG/WebP).
     - Use OCR or simple heuristics to detect unexpected text (optional).
   - Manual review step (accept/reject) is required before publishing.

8. **Prompt Transparency**
   - Store the exact prompt used for each generated image in the manifest for auditing.

## Implementation Notes
- The prompt templates in `prompt_templates.json` are designed to follow these rules.
- The `make_prompt` function in `ai_images_enhanced.py` strips out warranty text and generic size numbers to reduce hallucination risk.
- The provider interface allows swapping models while keeping the same safety‑checked prompt.
