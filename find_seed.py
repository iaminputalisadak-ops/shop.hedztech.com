import os
for root,dirs,files in os.walk(r'D:\Websites\shop hedztech'):
    dirs[:] = [d for d in dirs if d != '__pycache__']
    for f in files:
        if 'seed' in f and f.endswith('.sql'):
            p = os.path.join(root,f)
            try:
                with open(p, encoding='utf-8', errors='ignore') as fh:
                    c = fh.read()
                if 'admin_users' in c:
                    print('===', p, '===')
                    print(c)
                    break
            except Exception as e:
                pass
    else:
        continue
    break
