@echo off
echo Starting image generation and database migration...
echo Generating product images...
python scripts/generate-product-assets.py
echo.
echo Updating database with images and descriptions...
php scripts/db_migration.php
echo.
echo Done! Please check your shop to see the updates.
pause
