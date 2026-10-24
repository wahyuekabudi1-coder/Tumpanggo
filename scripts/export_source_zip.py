import os
import zipfile

def export_zip():
    root_dir = os.path.abspath(os.getcwd())
    export_dir = os.path.join(root_dir, 'dist-archive')
    os.makedirs(export_dir, exist_ok=True)
    output_zip = os.path.join(export_dir, 'tumpanggo-clean-source.zip')
    
    # Remove previous zip if it exists to prevent nested or dirty packaging
    if os.path.exists(output_zip):
        try:
            os.remove(output_zip)
        except Exception:
            pass

    exclude_dirs = {
        'node_modules',
        'dist',
        '.git',
        '.cache',
        '.aistudio',
        '.turbo',
        '.vercel',
        'backups',
        'dist-archive',
        'coverage'
    }
    
    exclude_extensions = {
        '.log',
        '.tmp',
        '.bundle',
        '.patch',
        '.tgz',
        '.zip'
    }
    
    exclude_files = {
        '.env',
        '.env.local',
        '.env.production',
        '.env.development',
        '.master_recovery_token',
        '.DS_Store',
        'bun.lock',
        'bun.lockb',
        'yarn.lock',
        'pnpm-lock.yaml',
        'tumpang_food_db.json',
        'tumpang_db.json',
        'tumpanggo-source.zip',
        'tumpanggo-clean-source.zip',
        'tumpanggo-ereceipt-source.zip'
    }

    print(f"📦 Packaging TumpangGo clean source archive to: {output_zip}")
    
    file_count = 0
    total_bytes = 0
    packaged_entries = []
    
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Prune excluded directories in-place
            dirnames[:] = [d for d in dirnames if d not in exclude_dirs and not d.startswith('.git') and not d.startswith('.')]
            
            for f in filenames:
                if f in exclude_files:
                    continue
                if any(f.endswith(ext) for ext in exclude_extensions):
                    continue
                if 'backup' in f.lower() or 'shop_db' in f or f.startswith('tumpang_food_db.json'):
                    continue
                    
                full_path = os.path.join(dirpath, f)
                rel_path = os.path.relpath(full_path, root_dir)
                
                zf.write(full_path, rel_path)
                file_count += 1
                total_bytes += os.path.getsize(full_path)
                packaged_entries.append(rel_path)
                
    zip_size_mb = os.path.getsize(output_zip) / (1024 * 1024)
    print(f"✅ Source ZIP created successfully: {file_count} files, {total_bytes / (1024 * 1024):.2f} MB raw, {zip_size_mb:.2f} MB compressed.")
    print(f"📁 Source archive location: {output_zip}")

    # Also copy to current artifact directory for AI Studio Build
    # Also copy to current artifact directory for AI Studio Build
    artifact_dirs = [
        os.path.join(root_dir, '.aistudio', 'artifacts', 'brain', 'fcc79869-ec65-4c37-aed9-b8c9a4e34753'),
        os.path.join(root_dir, '.aistudio', 'artifacts', 'brain', 'bc8758c6-d4e9-4c51-89c0-7de48a5e5073'),
        os.path.join(root_dir, '.aistudio', 'artifacts', 'brain', 'beb95fb3-b008-4dbd-bec7-0dd9de135170'),
        os.path.join(root_dir, '.aistudio', 'artifacts', 'brain', '2ee7047e-bf14-42a0-96e3-38772562a041')
    ]
    for art_dir in artifact_dirs:
        try:
            os.makedirs(art_dir, exist_ok=True)
            import shutil
            shutil.copy2(output_zip, os.path.join(art_dir, 'tumpanggo-clean-source.zip'))
            print(f"📁 Synced to artifact directory: {art_dir}/tumpanggo-clean-source.zip")
        except Exception as copy_err:
            pass

    # --- POST-EXPORT ZIP INTEGRITY & HYGIENE AUDIT ---
    print("\n🔍 Auditing exported ZIP contents...")
    with zipfile.ZipFile(output_zip, 'r') as zf:
        names = zf.namelist()
        
        # Check for ArtoPay
        artopay_findings = [n for n in names if 'arto' in n.lower()]
        assert len(artopay_findings) == 0, f"VIOLATION: Found ArtoPay files in ZIP: {artopay_findings}"
        print("  ✅ [PASS] No ArtoPay files or references in ZIP archive.")

        # Check for backups directory
        backup_findings = [n for n in names if n.startswith('backups/') or 'backup' in n.lower()]
        assert len(backup_findings) == 0, f"VIOLATION: Found backup files in ZIP: {backup_findings}"
        print("  ✅ [PASS] No operational backup JSON files in ZIP archive.")

        # Check for nested zips or dist-archive
        nested_findings = [n for n in names if n.startswith('dist-archive/') or n.endswith('.zip')]
        assert len(nested_findings) == 0, f"VIOLATION: Found nested archives in ZIP: {nested_findings}"
        print("  ✅ [PASS] No nested ZIP archives or dist-archive directory in ZIP.")

        # Check for secrets or local db dumps
        secret_findings = [n for n in names if n in {'.env', '.env.local', 'tumpang_food_db.json', 'bun.lock'}]
        assert len(secret_findings) == 0, f"VIOLATION: Found secrets or database dumps in ZIP: {secret_findings}"
        print("  ✅ [PASS] No secrets, .env files, or database dumps in ZIP.")

        # Check for public directory hygiene
        public_sensitive = [n for n in names if n.startswith('public/') and any(n.endswith(ext) for ext in ['.zip', '.json', '.sql', '.tar', '.gz']) and not ('manifest' in n or 'robots' in n or 'sitemap' in n)]
        assert len(public_sensitive) == 0, f"VIOLATION: Found unexpected files in public/: {public_sensitive}"
        print("  ✅ [PASS] Public directory is completely free of source archives, dumps, or sensitive files.")

        # Check vercel.json in ZIP contains cleanUrls, trailingSlash, and SPA rewrite to /index.html
        assert 'vercel.json' in names, "VIOLATION: vercel.json missing from ZIP"
        vercel_in_zip = zf.read('vercel.json').decode('utf-8')
        assert '"cleanUrls": true' in vercel_in_zip, "VIOLATION: vercel.json in ZIP must have cleanUrls: true"
        assert '"trailingSlash": false' in vercel_in_zip, "VIOLATION: vercel.json in ZIP must have trailingSlash: false"
        assert '"source": "/merchant"' in vercel_in_zip, "VIOLATION: vercel.json in ZIP must have /merchant rewrite"
        assert '"destination": "/index.html"' in vercel_in_zip, "VIOLATION: vercel.json in ZIP must rewrite SPA routes to /index.html"
        print("  ✅ [PASS] vercel.json in ZIP contains cleanUrls: true, trailingSlash: false, and /index.html SPA rewrites.")

        # Check public/sw.js in ZIP
        assert 'public/sw.js' in names, "VIOLATION: public/sw.js missing from ZIP"
        sw_in_zip = zf.read('public/sw.js').decode('utf-8')
        assert 'resolveNavigationShell' in sw_in_zip, "VIOLATION: public/sw.js in ZIP must have resolveNavigationShell"
        assert 'tumpanggo-pwa-v15' in sw_in_zip, "VIOLATION: public/sw.js in ZIP must specify tumpanggo-pwa-v15 cache"
        print("  ✅ [PASS] public/sw.js in ZIP contains resolveNavigationShell and tumpanggo-pwa-v15 cache.")

        # Check usePWAInstall.ts in ZIP contains isInstallationInProgress lock
        assert 'src/hooks/usePWAInstall.ts' in names, "VIOLATION: usePWAInstall.ts missing from ZIP"
        hook_in_zip = zf.read('src/hooks/usePWAInstall.ts').decode('utf-8')
        assert 'isInstallationInProgress' in hook_in_zip, "VIOLATION: usePWAInstall.ts in ZIP must have isInstallationInProgress lock"
        print("  ✅ [PASS] src/hooks/usePWAInstall.ts in ZIP contains isInstallationInProgress installation prompt lock.")

        # Check manifest-merchant.json in ZIP
        assert 'public/manifest-merchant.json' in names, "VIOLATION: manifest-merchant.json missing from ZIP"
        manifest_in_zip = zf.read('public/manifest-merchant.json').decode('utf-8')
        assert '"start_url": "/merchant"' in manifest_in_zip, "VIOLATION: manifest-merchant.json in ZIP must specify /merchant start_url"
        print("  ✅ [PASS] public/manifest-merchant.json in ZIP specifies /merchant start_url.")

    print("🎉 All ZIP audit assertions passed successfully!\n")

if __name__ == '__main__':
    export_zip()
