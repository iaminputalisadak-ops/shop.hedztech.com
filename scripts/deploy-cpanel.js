/**
 * Deploy shop.hedztech.com over FTP.
 * Run: npm run deploy:cpanel
 *
 * Uses deploy/ftp-config.json. Never overwrites config/database.php.
 * Optional zip only: npm run deploy:cpanel:zip
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const staging = path.join(root, 'deploy', 'cpanel-out');
const zipName = 'shop-hedztech-seo.zip';
const zipPath = path.join(root, zipName);
const ftpConfig = path.join(root, 'deploy', 'ftp-config.json');
const wantZip = process.argv.includes('--zip');
const wantFtp = !process.argv.includes('--zip-only');

function copy(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn('Skip missing', src);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === 'node_modules' || name === '.git') continue;
      copy(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

copy(path.join(root, 'frontend', 'dist'), staging);
copy(path.join(root, 'backend', 'api'), path.join(staging, 'backend'));
// Product images live in backend/uploads/ (served as /uploads/). Without this
// copy, admin uploads AND generated product images 404 in production.
copy(path.join(root, 'backend', 'uploads'), path.join(staging, 'backend', 'uploads'));
copy(path.join(root, 'deploy', 'htaccess-cpanel-subdomain.txt'), path.join(staging, '.htaccess'));
copy(path.join(root, 'frontend', 'public', 'robots.txt'), path.join(staging, 'robots.txt'));

const configOnStaging = path.join(staging, 'config', 'database.php');
if (fs.existsSync(configOnStaging)) {
  fs.unlinkSync(configOnStaging);
}

if (wantZip) {
  const py = `
import os, zipfile, shutil
staging = r'''${staging.replace(/\\/g, '\\\\')}'''
out = r'''${zipPath.replace(/\\/g, '\\\\')}'''
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for dirpath, _, files in os.walk(staging):
        for name in files:
            full = os.path.join(dirpath, name)
            arc = os.path.relpath(full, staging).replace('\\\\', '/')
            z.write(full, arc)
print('zipped', out)
desk = os.path.join(os.path.expanduser('~'), 'OneDrive', 'Desktop', '${zipName}')
if os.path.isdir(os.path.dirname(desk)):
    shutil.copy2(out, desk)
    print('copied', desk)
`;
  const result = spawnSync('python', ['-c', py], { encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error('Zip failed. Files are in', staging);
    process.exit(1);
  }
  const sizeMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
  console.log('Created', zipPath, `(${sizeMb} MB)`);
}

if (!wantFtp) {
  console.log('Zip-only mode. Not uploading.');
  process.exit(0);
}

if (!fs.existsSync(ftpConfig)) {
  console.error('Missing deploy/ftp-config.json');
  console.error('Copy deploy/ftp-config.example.json and add the FTP password.');
  process.exit(1);
}

console.log('Uploading to shop.hedztech.com over FTP...');
const ftp = spawnSync(
  'python',
  [path.join(root, 'scripts', 'ftp-deploy.py'), staging, ftpConfig],
  { encoding: 'utf8' }
);
if (ftp.stdout) process.stdout.write(ftp.stdout);
if (ftp.stderr) process.stderr.write(ftp.stderr);
if (ftp.status !== 0) {
  console.error('FTP deploy failed.');
  process.exit(ftp.status || 1);
}

console.log('Refreshing sitemap.xml from live catalog...');
const refresh = spawnSync('python', ['-c', `
import json, ssl, urllib.request, ftplib, io
cfg = json.load(open(r'''${ftpConfig.replace(/\\/g, '\\\\')}''', encoding='utf-8'))
ctx = ssl.create_default_context()
req = urllib.request.Request(cfg.get('siteUrl', 'https://shop.hedztech.com/').rstrip('/') + '/backend/sitemap.php', headers={'User-Agent': 'NepalTechGuard-Deploy/1.0'})
xml = urllib.request.urlopen(req, timeout=45, context=ctx).read()
if b'<urlset' not in xml or xml.count(b'<loc>') < 10:
    raise SystemExit('Live sitemap.php did not return XML')
ftp = ftplib.FTP_TLS()
ftp.connect(cfg['host'], int(cfg.get('port') or 21), timeout=45)
ftp.auth(); ftp.prot_p(); ftp.login(cfg['username'], cfg['password']); ftp.set_pasv(True)
ftp.storbinary('STOR /sitemap.xml', io.BytesIO(xml))
ftp.quit()
print('Wrote /sitemap.xml', len(xml), 'bytes', xml.count(b'<loc>'), 'urls')
`], { encoding: 'utf8' });
if (refresh.stdout) process.stdout.write(refresh.stdout);
if (refresh.stderr) process.stderr.write(refresh.stderr);
if (refresh.status !== 0) {
  console.error('Sitemap refresh failed. /backend/sitemap.php is still the live source.');
}

console.log('Live: https://shop.hedztech.com/');
console.log('Admin: https://shop.hedztech.com/admin');
console.log('Sitemap: https://shop.hedztech.com/sitemap.xml');
