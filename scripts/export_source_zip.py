import os
import zipfile

def export_zip():
    root_dir = os.path.abspath(os.getcwd())
    output_zip = os.path.join(root_dir, 'public', 'tumpanggo-ereceipt-source.zip')
    
    exclude_dirs = {
        'node_modules',
        'dist',
        '.git',
        '.cache',
        '.aistudio'
    }
    
    exclude_extensions = {
        '.log',
        '.tmp'
    }
    
    exclude_files = {
        '.env',
        '.env.local',
        'tumpanggo-ereceipt-source.zip'
    }

    print(f"📦 Packaging TumpangGo source archive to: {output_zip}")
    
    file_count = 0
    total_bytes = 0
    
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Prune excluded directories
            dirnames[:] = [d for d in dirnames if d not in exclude_dirs and not d.startswith('.git')]
            
            for f in filenames:
                if f in exclude_files:
                    continue
                if any(f.endswith(ext) for ext in exclude_extensions):
                    continue
                if 'backup.json' in f:
                    continue
                if f.endswith('.zip') and dirpath == os.path.join(root_dir, 'public'):
                    continue
                    
                full_path = os.path.join(dirpath, f)
                rel_path = os.path.relpath(full_path, root_dir)
                
                zf.write(full_path, rel_path)
                file_count += 1
                total_bytes += os.path.getsize(full_path)
                
    zip_size_mb = os.path.getsize(output_zip) / (1024 * 1024)
    print(f"✅ Source ZIP created successfully: {file_count} files, {total_bytes / (1024 * 1024):.2f} MB raw, {zip_size_mb:.2f} MB compressed.")

if __name__ == '__main__':
    export_zip()
