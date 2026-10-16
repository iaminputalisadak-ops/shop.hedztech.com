<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Admin Dashboard | Nepal TechGuard</title>
    <style>
        :root { --accent: #0d6efd; --bg: #f8f9fa; --text: #212529; }
        body { font-family: sans-serif; background: var(--bg); margin: 0; display: flex; }
        aside { width: 200px; background: #343a40; color: white; height: 100vh; padding: 1rem; }
        main { flex: 1; padding: 2rem; }
        .card { background: white; padding: 1rem; border: 1px solid #dee2e6; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <aside>
        <h3>Dashboard</h3>
        <nav><a href="#" style="color:white">Home</a></nav>
    </aside>
    <main>
        <h1>Dashboard Stats</h1>
        <div class="card" id="stats">Loading...</div>
    </main>
    <script>
        fetch('/api/admin/dashboard/index.php?action=stats')
            .then(res => res.json())
            .then(data => document.getElementById('stats').innerText = JSON.stringify(data.data, null, 2));
    </script>
</body>
</html>