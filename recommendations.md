# Recommendations for AI Product Image Generation Workflow

## Provider Choice
- **Primary**: OpenAI DALL‑E 3 (via API) – best consistency, photorealism, and safety features for product shots.
- **Alternative**: Stability AI (Stable Diffusion XL) – lower cost, but requires more prompt tuning and may produce less consistent results. Use only if budget is a major concern and you can invest in prompt engineering.
- **Avoid**: Midjourney (no official API, variable quality, and potential licensing issues).

## API Key Management
- Store API keys in environment variables (`OPENAI_API_KEY`, `STABILITY_API_KEY`).
- Never commit keys to version control. Use `.env` files (excluded via `.gitignore`) or a secrets manager.
- Consider rotating keys periodically and restricting usage to specific IPs if supported.

## Cost Control
- DALL‑E 3 pricing (as of 2026): ~$0.04 per 1024x1024 image (standard quality).
- Estimate monthly cost: `number_of_products × $0.04`. For a catalog of 500 items, ~$20/month.
- Enable caching: skip regeneration if an accepted image already exists (implemented via `--skip-existing`).
- Use the `--limit` flag during development to control costs.

## Fallback Strategy
- If the primary provider fails (rate limit, error, downtime), automatically fall back to the secondary provider.
- Implement a retry mechanism with exponential backoff (already present via simple sleep; can be enhanced).
- Log failures and notify administrators via email or webhook.

## Deployment & Maintenance
- Keep the prompt templates version‑controlled (`prompt_templates.json`) and review them quarterly.
- Update the `categorize` function when new product categories are added to the database.
- Run the generation pipeline as a scheduled cron job (e.g., weekly) to refresh images for new or updated products.
- Store generated images in a CDN‑friendly location (e.g., `/public/uploads/products/`) and reference them via URLs.

## Quality Assurance
- Enforce the safety rules (see `safety_rules.md`) during prompt generation.
- Use the review step (`review` command) to visually inspect all images before publishing.
- Consider automated image quality checks (blur detection, aspect ratio, color variance) as an additional gate.

## SVG Cover (`cover.php`) Recommendation
- The existing `cover.php` generates SVG placeholder graphics. These are **not** suitable for a modern e‑commerce catalog that expects realistic product photos.
- **Recommendation**: Replace SVG placeholders with AI‑generated photographs as the default product image.
- Keep `cover.php` only as a fallback for products where image generation fails catastrophically (e.g., after all retries), and even then prefer a generic “photo not available” placeholder rather than an SVG diagram.

## Environment Variables Summary
| Variable               | Description                                      | Required? |
|------------------------|--------------------------------------------------|-----------|
| OPENAI_API_KEY         | OpenAI API key                                   | Yes (if using openai) |
| STABILITY_API_KEY      | Stability AI API key                             | Yes (if using stability) |
| IMAGE_PROVIDER         | Provider to use: `openai` (default) or `stability` | No |
| DB_HOST                | MySQL host                                       | No (default: localhost) |
| DB_NAME                | MySQL database                                   | No (default: nepal_techguard) |
| DB_USER                | MySQL user                                       | No (default: root) |
| DB_PASS                | MySQL password                                   | No |
| ADMIN_API_URL          | Base URL of admin API                            | No (default: http://localhost:8000/backend/api) |
| ADMIN_USERNAME         | Admin username for API auth                      | Yes |
| ADMIN_PASSWORD         | Admin password for API auth                      | Yes |
| OPENAI_ORG_ID          | OpenAI organization ID (optional)                | No |
| STABILITY_ENGINE_ID    | Stability engine ID (optional)                   | No |

## Next Steps
1. Add the environment variables to your deployment environment (e.g., `.env` file, Docker secrets, or platform config).
2. Run `php composer install` (if needed) and ensure the PHP provider class is autoloaded.
3. Test the pipeline with a small batch:  
   ```bash
   php scripts/ai_images_enhanced.py export
   php scripts/ai_images_enhanced.py generate --limit 5
   php scripts/ai_images_enhanced.py review
   php scripts/ai_images_enhanced.py upload
   ```
4. Review the generated images, adjust prompts if necessary, then run the full catalog.
