(function () {
    function normalizePath(path) {
        if (!path) return '/';
        return path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;
    }

    function getTargetKey(path) {
        const p = normalizePath(path.toLowerCase());

        if (p === '/' || p === '/home') return 'home';
        if (p.startsWith('/live-detection')) return 'mark';
        if (p.startsWith('/register')) return 'register';
        if (p.startsWith('/attendance_record')) return 'records';
        if (p.startsWith('/dashboard')) return 'dashboard';
        if (p.startsWith('/about-us') || p.startsWith('/about_us')) return 'about';
        if (p.startsWith('/login') || p.startsWith('/user_login') || p.startsWith('/admin-login') || p.startsWith('/admin_login')) return 'login';

        return '';
    }

    const menu = document.querySelector('.navbar-menu');
    if (!menu) return;

    const links = Array.from(menu.querySelectorAll('a.nav-link'));
    links.forEach(link => link.classList.remove('active'));

    const key = getTargetKey(window.location.pathname);
    if (!key) return;

    const finder = {
        home: (href) => href === '/' || href.startsWith('/home'),
        mark: (href) => href.startsWith('/live-detection'),
        register: (href) => href.startsWith('/register'),
        records: (href) => href.startsWith('/attendance_record'),
        dashboard: (href) => href.startsWith('/dashboard'),
        about: (href) => href.startsWith('/about-us') || href.startsWith('/about_us'),
        login: (href) => href.startsWith('/login') || href.startsWith('/user_login') || href.startsWith('/admin-login') || href.startsWith('/admin_login')
    };

    const matcher = finder[key];
    if (!matcher) return;

    const activeLink = links.find(link => {
        try {
            const url = new URL(link.getAttribute('href'), window.location.origin);
            const hrefPath = normalizePath(url.pathname.toLowerCase());
            return matcher(hrefPath);
        } catch (_err) {
            return false;
        }
    });

    if (activeLink) activeLink.classList.add('active');
})();
